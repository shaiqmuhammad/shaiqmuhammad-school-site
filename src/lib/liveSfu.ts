"use client";

/** Browser helper for Cloudflare Realtime SFU (publish + subscribe). App Secret stays on the worker. */
import { lmsApi, type LivePub } from "@/lib/lms";
import { isMaxBundleError, sdpDesc } from "@/lib/liveSdp";
import { ICE_RETRY_WAIT_MS, ICE_WAIT_MS, icePeerConfig, iceSummary, isMobileUa, isPcConnected, isPcConnecting, shouldRefreshSession, waitConnected, waitIce } from "@/lib/liveIceWait";
import { liveMediaLog as mediaLog } from "@/lib/liveMediaLog";
import { isRetryableSubError, isSessionDisconnectError, matchRemoteTrack, sfuResponseDetail, type RemoteTrackRow } from "@/lib/liveMediaError";

export { ICE_WAIT_MS, waitIce };

function sfuField<T = unknown>(r: Record<string, unknown>, key: string): T | undefined {
  if (r[key] !== undefined) return r[key] as T;
  const nest = r.result && typeof r.result === "object" ? r.result as Record<string, unknown> : null;
  return nest && nest[key] !== undefined ? nest[key] as T : undefined;
}

type RemoteFn = (key: string, stream: MediaStream | null) => void;
type TrackRow = RemoteTrackRow;

async function waitForMid(trans: RTCRtpTransceiver, ms = 800): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (trans.mid != null && String(trans.mid) !== "") return String(trans.mid);
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error("sfu_publish: transceiver mid was not assigned after setLocalDescription");
}

export class LiveSfu {
  private roomId: string;
  private selfId: string;
  private onRemote: RemoteFn;
  private ice: RTCIceServer[];
  private asAdmin: boolean;
  private pub?: RTCPeerConnection;
  private recv?: RTCPeerConnection;
  pubId = "";
  recvId = "";
  private published = new Map<string, RTCRtpTransceiver>();
  private slots = new Map<string, RTCRtpTransceiver>();
  private midKey = new Map<string, string>();
  private subbed = new Set<string>();
  private subUi = new Map<string, string>();
  private pendingOntrack = new Map<string, RTCTrackEvent>();
  private pubQ: Promise<void> = Promise.resolve();
  private recvQ: Promise<void> = Promise.resolve();
  private pubSetup?: Promise<void>;
  private recvSetup?: Promise<void>;
  private warm?: Promise<void>;
  private lastPubs: LivePub[] = [];
  private pubRetries = 0;
  private recvRetries = 0;
  private subRetries = 0;
  private subRetryTimer?: number;
  private forceRelay = false;
  private mobile = false;
  private disconnectTimer: Partial<Record<"pub" | "recv", number>> = {};
  private onVis?: () => void;
  constructor(roomId: string, selfId: string, ice: RTCIceServer[], onRemote: RemoteFn, asAdmin = false) {
    this.roomId = roomId;
    this.selfId = selfId;
    this.ice = icePeerConfig(ice).iceServers as RTCIceServer[];
    this.onRemote = onRemote;
    this.asAdmin = asAdmin;
    this.mobile = typeof navigator !== "undefined" && isMobileUa(navigator.userAgent || "");
    mediaLog.mark("ice_servers", iceSummary(this.ice) + (this.mobile ? " mobile" : ""));
    if (typeof document !== "undefined") {
      this.onVis = () => {
        if (document.visibilityState !== "visible") return;
        if (shouldRefreshSession(this.pub, this.pubId)) this.scheduleRetry("pub");
        if (shouldRefreshSession(this.recv, this.recvId)) this.scheduleRetry("recv");
      };
      document.addEventListener("visibilitychange", this.onVis);
    }
  }

  private enqueuePub(fn: () => Promise<void>) {
    this.pubQ = this.pubQ.then(fn, fn);
    return this.pubQ;
  }

  private enqueueRecv(fn: () => Promise<void>) {
    this.recvQ = this.recvQ.then(fn, fn);
    return this.recvQ;
  }

  setSelfId(id: string) { if (id) this.selfId = id; }

  private call(body: Record<string, unknown>) {
    return lmsApi.liveSfu(this.roomId, body, this.asAdmin);
  }

  private tracksOf(r: Record<string, unknown>): TrackRow[] {
    return (Array.isArray(sfuField(r, "tracks")) ? sfuField(r, "tracks") : Array.isArray(r.tracks) ? r.tracks : []) as TrackRow[];
  }

  private sfuFailed(r: Record<string, unknown>, name?: string) {
    const tracks = this.tracksOf(r);
    const top = r.errorCode != null && String(r.errorCode).trim() !== "";
    if (r.errorErrors || top) return true;
    if (name) return tracks.some((x) => (x.trackName === name || (!x.trackName && tracks.length === 1)) && !!x.errorCode);
    return tracks.some((x) => x.errorCode);
  }

  private throwIfSfuFailed(r: Record<string, unknown>, name?: string, kind: "sfu_publish" | "sfu_session" = "sfu_publish"): void {
    if (!this.sfuFailed(r, name)) return;
    const detail = sfuResponseDetail(r) || "sfu request failed";
    mediaLog.mark("sfu_error", `${name || kind}:${detail}`);
    const err = new Error(`${kind}: ${detail}`) as Error & { code: string; data: Record<string, unknown> };
    err.code = kind;
    err.data = r;
    throw err;
  }

  private newPc(label: "pub" | "recv") {
    const cfg = icePeerConfig(this.ice, this.forceRelay);
    const pc = new RTCPeerConnection(cfg as RTCConfiguration);
    mediaLog.watchPc(pc, label);
    const onState = () => this.onPcState(label, pc);
    pc.addEventListener("connectionstatechange", onState);
    pc.addEventListener("iceconnectionstatechange", onState);
    return pc;
  }

  private onPcState(label: "pub" | "recv", pc: RTCPeerConnection) {
    if (pc !== this.pub && pc !== this.recv) return;
    if (isPcConnected(pc)) {
      if (label === "pub") this.pubRetries = 0;
      else this.recvRetries = 0;
      const t = this.disconnectTimer[label];
      if (t) {
        window.clearTimeout(t);
        this.disconnectTimer[label] = undefined;
      }
      return;
    }
    const c = pc.connectionState;
    const ice = pc.iceConnectionState;
    if (c === "failed" || ice === "failed") {
      mediaLog.mark("ice_restart", label);
      try { pc.restartIce(); } catch { /* */ }
      this.scheduleRetry(label);
      return;
    }
    if (c === "disconnected" || ice === "disconnected" || c === "closed") {
      if (this.disconnectTimer[label]) return;
      this.disconnectTimer[label] = window.setTimeout(() => {
        this.disconnectTimer[label] = undefined;
        if (pc !== this.pub && pc !== this.recv) return;
        if (isPcConnected(pc)) return;
        mediaLog.mark("pc_disconnected", `${label}:${c || ice}`);
        this.scheduleRetry(label);
      }, 800);
    }
  }

  private scheduleRetry(label: "pub" | "recv") {
    const n = label === "pub" ? this.pubRetries : this.recvRetries;
    if (n >= 2) return;
    if (label === "pub") this.pubRetries += 1;
    else this.recvRetries += 1;
    if (n >= 1 && !this.forceRelay && this.mobile) {
      this.forceRelay = true;
      mediaLog.mark("ice_relay_fallback", label);
    }
    mediaLog.mark("retry", `${label}:${n + 1}`);
    window.setTimeout(() => {
      if (label === "pub") {
        const tracks = this.activePubs();
        if (!tracks.length) {
          // Drop a stale unused publish session so the next Mic/Camera tap starts fresh.
          if (shouldRefreshSession(this.pub, this.pubId)) this.dropPubPc();
          return;
        }
        void this.enqueuePub(() => this.republishAll(tracks, ICE_RETRY_WAIT_MS));
      } else if (this.lastPubs.length) {
        void this.enqueueRecv(async () => {
          this.dropRecvPc();
          await this.ensureRecv();
          this.subbed.clear();
          await this.pullFresh(this.lastPubs, ICE_RETRY_WAIT_MS);
        });
      }
    }, 400);
  }

  /** If the publish PeerConnection is not connected, open a fresh SFU session first. */
  private async ensurePubForPublish(extra?: { name: string; track: MediaStreamTrack }): Promise<"ready" | "rebuilt"> {
    if (this.pub && this.pubId && isPcConnected(this.pub)) return "ready";
    if (this.pub && this.pubId && isPcConnecting(this.pub)) {
      if (await waitConnected(this.pub)) return "ready";
    }
    mediaLog.mark("pub_fresh_session", this.pub ? (this.pub.connectionState || "none") : "none");
    await this.republishAll(this.activePubs(extra));
    return "rebuilt";
  }

  private async applyRemote(pc: RTCPeerConnection, raw: unknown, fallback: RTCSdpType) {
    const desc = sdpDesc(raw, fallback);
    if (!desc) return;
    await pc.setRemoteDescription(desc);
  }

  private async ensurePub() {
    if (this.pub && this.pubId && this.pub.connectionState !== "closed") return;
    if (this.pubSetup) return this.pubSetup;
    this.pubSetup = (async () => {
      if (this.pub && this.pubId && this.pub.connectionState !== "closed") return;
      this.pub = this.newPc("pub");
      const r = await this.call({ op: "session-new" });
      this.pubId = String(sfuField(r, "sessionId") || r.sessionId || "");
      mediaLog.mark("sfu_session_pub", this.pubId ? this.pubId.slice(0, 10) : "failed");
      if (!this.pubId) {
        const err = new Error("sfu_session: the SFU did not return a session id") as Error & { code: string; data: Record<string, unknown> };
        err.code = "sfu_session";
        err.data = r;
        throw err;
      }
    })();
    try {
      await this.pubSetup;
    } catch (e) {
      try { this.pub?.close(); } catch { /* */ }
      this.pub = undefined;
      this.pubId = "";
      throw e;
    } finally {
      this.pubSetup = undefined;
    }
  }

  private attachRecv(pc: RTCPeerConnection) {
    pc.ontrack = (ev) => {
      const mid = ev.transceiver?.mid || ev.receiver?.track?.id || "";
      const key = this.midKey.get(mid) || this.midKey.get(String(ev.transceiver?.mid || "")) || "";
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      ev.track.onended = () => {
        const k = this.midKey.get(mid) || key;
        if (k) this.onRemote(k, null);
      };
      if (!key) {
        if (mid) this.pendingOntrack.set(mid, ev);
        return;
      }
      this.onRemote(key, stream);
    };
  }

  private async ensureRecv() {
    if (this.recv && this.recvId && this.recv.connectionState !== "closed") return;
    if (this.recvSetup) return this.recvSetup;
    this.recvSetup = (async () => {
      if (this.recv && this.recvId && this.recv.connectionState !== "closed") return;
      this.recv = this.newPc("recv");
      this.attachRecv(this.recv);
      const r = await this.call({ op: "session-new" });
      this.recvId = String(sfuField(r, "sessionId") || r.sessionId || "");
      mediaLog.mark("sfu_session_recv", this.recvId ? this.recvId.slice(0, 10) : "failed");
      if (!this.recvId) {
        const err = new Error("sfu_session: the SFU did not return a session id") as Error & { code: string; data: Record<string, unknown> };
        err.code = "sfu_session";
        err.data = r;
        throw err;
      }
    })();
    try {
      await this.recvSetup;
    } catch (e) {
      try { this.recv?.close(); } catch { /* */ }
      this.recv = undefined;
      this.recvId = "";
      throw e;
    } finally {
      this.recvSetup = undefined;
    }
  }

  /** Create publish and receive sessions in parallel as soon as the student or teacher joins. */
  async warmup() {
    if (!this.warm) {
      this.warm = Promise.all([this.ensurePub(), this.ensureRecv()]).then(() => undefined, (e) => {
        this.warm = undefined;
        throw e;
      });
    }
    await this.warm;
  }

  private dropPubPc() {
    try { this.pub?.close(); } catch { /* */ }
    this.pub = undefined;
    this.pubId = "";
    this.published.clear();
    this.slots.clear();
    this.pubSetup = undefined;
    this.warm = undefined;
  }

  private dropRecvPc() {
    try { this.recv?.close(); } catch { /* */ }
    this.recv = undefined;
    this.recvId = "";
    this.midKey.clear();
    this.pendingOntrack.clear();
    this.recvSetup = undefined;
    this.warm = undefined;
  }

  /** Recreate the publish session and push every active track in one tracks/new (Cloudflare batch). */
  private async republishAll(tracks: { name: string; track: MediaStreamTrack }[], iceMs = ICE_WAIT_MS) {
    this.dropPubPc();
    if (!tracks.length) return;
    await this.ensurePub();
    const items: { name: string; trans: RTCRtpTransceiver }[] = [];
    for (const { name, track } of tracks) {
      const trans = this.pub!.addTransceiver(track, { direction: "sendonly" });
      items.push({ name, trans });
    }
    const offer = await this.pub!.createOffer();
    await this.pub!.setLocalDescription(offer);
    await waitIce(this.pub!, iceMs);
    const rows = [];
    for (const { name, trans } of items) {
      rows.push({ location: "local", mid: await waitForMid(trans), trackName: name });
    }
    mediaLog.mark("tracks_new_push", items.map((x) => x.name).join(",") || "none");
    const r = await this.call({
      op: "tracks-new",
      sessionId: this.pubId,
      sessionDescription: { type: "offer", sdp: this.pub!.localDescription?.sdp },
      tracks: rows,
    });
    this.throwIfSfuFailed(r);
    if (r.sessionDescription) await this.applyRemote(this.pub!, r.sessionDescription, "answer");
    for (const { name, trans } of items) {
      this.slots.set(name, trans);
      this.published.set(name, trans);
    }
  }

  private activePubs(extra?: { name: string; track: MediaStreamTrack }) {
    const out: { name: string; track: MediaStreamTrack }[] = [];
    for (const [name, trans] of this.published) {
      const track = trans.sender.track;
      if (track && track.readyState !== "ended") out.push({ name, track });
    }
    if (extra && !out.some((x) => x.name === extra.name)) out.push(extra);
    else if (extra) {
      const i = out.findIndex((x) => x.name === extra.name);
      if (i >= 0) out[i] = extra;
    }
    return out;
  }

  private isPermanentPubError(e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code || "") : "";
    const msg = e instanceof Error ? e.message : "";
    return /not_allowed|forbidden|unauthorized|sfu_not_configured|bad_session/.test(`${code} ${msg}`);
  }

  async publish(name: string, track: MediaStreamTrack) {
    await this.enqueuePub(async () => {
      const ready = await this.ensurePubForPublish({ name, track });
      if (ready === "rebuilt") return;
      const existing = this.slots.get(name) || this.published.get(name);
      if (existing && this.pub && !shouldRefreshSession(this.pub, this.pubId)) {
        try {
          await existing.sender.replaceTrack(track);
          this.published.set(name, existing);
          return;
        } catch { /* fall through and renegotiate */ }
      }
      try {
        await this.ensurePub();
        const trans = this.pub!.addTransceiver(track, { direction: "sendonly" });
        const offer = await this.pub!.createOffer();
        await this.pub!.setLocalDescription(offer);
        await waitIce(this.pub!);
        const mid = await waitForMid(trans);
        mediaLog.mark("tracks_new_push", name);
        const r = await this.call({
          op: "tracks-new",
          sessionId: this.pubId,
          sessionDescription: { type: "offer", sdp: this.pub!.localDescription?.sdp },
          tracks: [{ location: "local", mid, trackName: name }],
        });
        this.throwIfSfuFailed(r, name);
        if (r.sessionDescription) await this.applyRemote(this.pub!, r.sessionDescription, "answer");
        this.slots.set(name, trans);
        this.published.set(name, trans);
        this.pubRetries = 0;
      } catch (e) {
        if (this.isPermanentPubError(e) && !isSessionDisconnectError(e)) throw e;
        // Stale SFU session (iOS idle / background) or max-bundle: one rebuild on a fresh session.
        if (isSessionDisconnectError(e) || isMaxBundleError(e) || this.published.size || this.pub?.currentRemoteDescription) {
          mediaLog.mark(isSessionDisconnectError(e) ? "session_retry" : "pub_rebuild", name);
          await this.republishAll(this.activePubs({ name, track }));
          return;
        }
        throw e;
      }
    });
    if (this.pubId) {
      // Cloudflare: announce only after the publisher is connected, otherwise
      // subscribers get empty_track_error and used to never retry.
      if (this.pub) {
        const ok = await waitConnected(this.pub);
        mediaLog.mark(ok ? "ice_connected" : "ice_failed", "pub:" + (this.pub.connectionState || "timeout"));
      }
      mediaLog.mark("pub_announce", [...this.published.keys()].join(",") || "none");
      await lmsApi.livePub(this.roomId, this.pubId, [...this.published.keys()], this.asAdmin);
    }
  }

  async unpublish(name: string) {
    await this.enqueuePub(async () => {
      const trans = this.published.get(name);
      if (!trans || !this.pub) return;
      try { await trans.sender.replaceTrack(null); } catch { /* */ }
      try { trans.sender.track?.stop(); } catch { /* */ }
      // Keep the transceiver (and its mid) so turning the track back on is replaceTrack,
      // not a new createOffer that can hit Chrome's max-bundle error.
      this.published.delete(name);
    });
    const left = [...this.published.keys()];
    if (left.length && this.pubId) await lmsApi.livePub(this.roomId, this.pubId, left, this.asAdmin);
    else await lmsApi.liveUnpub(this.roomId, [name], this.asAdmin);
  }

  private bindMid(mid: string, key: string) {
    this.midKey.set(mid, key);
    const pending = this.pendingOntrack.get(mid);
    if (!pending) return;
    this.pendingOntrack.delete(mid);
    const stream = pending.streams[0] || new MediaStream([pending.track]);
    pending.track.onended = () => this.onRemote(key, null);
    this.onRemote(key, stream);
  }

  private scheduleSubRetry() {
    if (this.subRetries >= 5 || this.subRetryTimer) return;
    const delay = [400, 1000, 2000, 4000, 4000][this.subRetries] || 4000;
    this.subRetries += 1;
    mediaLog.mark("sfu_sub_retry", String(this.subRetries));
    this.subRetryTimer = window.setTimeout(() => {
      this.subRetryTimer = undefined;
      if (this.lastPubs.length) {
        void this.enqueueRecv(async () => {
          await this.ensureRecv();
          await this.pullFresh(this.lastPubs);
        });
      }
    }, delay);
  }

  private async pullFresh(pubs: LivePub[], iceMs = ICE_WAIT_MS) {
    const wanted = new Set<string>();
    const fresh: { sessionId: string; name: string; subId: string; key: string; mid?: string }[] = [];
    for (const p of pubs) {
      if (p.userId === this.selfId) continue;
      for (const name of p.tracks) {
        const subId = `${p.sessionId}:${name}`;
        const key = `${p.userId}:${name}`;
        wanted.add(subId);
        this.subUi.set(subId, key);
        if (!this.subbed.has(subId)) fresh.push({ sessionId: p.sessionId, name, subId, key });
      }
    }
    if (fresh.length) {
      mediaLog.mark("tracks_new_pull", fresh.map((x) => x.name).join(","));
      const r = await this.call({
        op: "tracks-new",
        sessionId: this.recvId,
        tracks: fresh.map((t) => ({ location: "remote", sessionId: t.sessionId, trackName: t.name })),
      }) as Record<string, unknown>;
      const tracks = this.tracksOf(r);
      const used = new Set<string>();
      const failed: string[] = [];
      for (let i = 0; i < fresh.length; i++) {
        const item = fresh[i]!;
        const mine = matchRemoteTrack(tracks, item, used, i);
        const mid = mine?.mid != null ? String(mine.mid) : "";
        if (!mid || mine?.errorCode) {
          const why = sfuResponseDetail({ tracks: mine ? [mine] : tracks }) || sfuResponseDetail(r) || "no mid in tracks/new result";
          failed.push(`${item.name}:${why}`);
          mediaLog.mark("sfu_sub_fail", `${item.name}:${why}`);
          continue;
        }
        used.add(mid);
        item.mid = mid;
        this.bindMid(mid, item.key);
      }
      const offer = sfuField(r, "sessionDescription") ?? sfuField(r, "session_description");
      if (offer) {
        await this.applyRemote(this.recv!, offer, "offer");
        const answer = await this.recv!.createAnswer();
        await this.recv!.setLocalDescription(answer);
        await waitIce(this.recv!, iceMs);
        const local = this.recv!.localDescription;
        const done = await this.call({
          op: "renegotiate",
          sessionId: this.recvId,
          sessionDescription: local ? { type: "answer", sdp: sdpDesc(local, "answer")?.sdp || local.sdp } : { type: "answer", sdp: answer.sdp },
        });
        this.throwIfSfuFailed(done, undefined, "sfu_session");
        this.recvRetries = 0;
      }
      for (const item of fresh) {
        if (item.mid) this.subbed.add(item.subId);
      }
      if (failed.length) {
        const retry = failed.some((d) => isRetryableSubError(d)) || failed.some((d) => /no mid/i.test(d));
        if (retry) this.scheduleSubRetry();
        else mediaLog.mark("sfu_sub_fail", failed.join(" | "));
      } else {
        this.subRetries = 0;
      }
    }
    for (const subId of [...this.subbed]) {
      if (!wanted.has(subId)) {
        this.subbed.delete(subId);
        const key = this.subUi.get(subId) || "";
        this.subUi.delete(subId);
        const still = key && [...this.subbed].some((id) => this.subUi.get(id) === key);
        if (key && !still) this.onRemote(key, null);
      }
    }
  }

  async syncSubs(pubs: LivePub[]) {
    this.lastPubs = pubs;
    await this.enqueueRecv(async () => {
      await this.ensureRecv();
      await this.pullFresh(pubs);
    });
  }

  close() {
    this.warm = undefined;
    if (this.onVis && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVis);
      this.onVis = undefined;
    }
    for (const k of ["pub", "recv"] as const) {
      const t = this.disconnectTimer[k];
      if (t) window.clearTimeout(t);
      this.disconnectTimer[k] = undefined;
    }
    if (this.subRetryTimer) {
      window.clearTimeout(this.subRetryTimer);
      this.subRetryTimer = undefined;
    }
    for (const tr of this.published.values()) {
      try { tr.sender.track?.stop(); } catch { /* */ }
      try { tr.stop(); } catch { /* */ }
    }
    this.published.clear();
    this.slots.clear();
    this.subbed.clear();
    this.subUi.clear();
    this.pendingOntrack.clear();
    this.lastPubs = [];
    try { this.pub?.close(); } catch { /* */ }
    try { this.recv?.close(); } catch { /* */ }
    this.pub = undefined;
    this.recv = undefined;
    this.pubId = "";
    this.recvId = "";
  }
}
