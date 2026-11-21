"use client";

/** Browser helper for Cloudflare Realtime SFU (publish + subscribe). App Secret stays on the worker. */
import { lmsApi, type LivePub } from "@/lib/lms";
import { isMaxBundleError, sdpDesc } from "@/lib/liveSdp";
import { ICE_RETRY_WAIT_MS, ICE_WAIT_MS, iceSummary, waitIce } from "@/lib/liveIceWait";
import { liveMediaLog as mediaLog } from "@/lib/liveMediaLog";

export { ICE_WAIT_MS, waitIce };

function sfuField<T = unknown>(r: Record<string, unknown>, key: string): T | undefined {
  if (r[key] !== undefined) return r[key] as T;
  const nest = r.result && typeof r.result === "object" ? r.result as Record<string, unknown> : null;
  return nest && nest[key] !== undefined ? nest[key] as T : undefined;
}

type RemoteFn = (key: string, stream: MediaStream | null) => void;
type TrackRow = { mid?: string; sessionId?: string; trackName?: string; errorCode?: string };

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
  private warm?: Promise<void>;
  private lastPubs: LivePub[] = [];
  private pubRetries = 0;
  private recvRetries = 0;
  constructor(roomId: string, selfId: string, ice: RTCIceServer[], onRemote: RemoteFn, asAdmin = false) {
    this.roomId = roomId;
    this.selfId = selfId;
    this.ice = ice;
    this.onRemote = onRemote;
    this.asAdmin = asAdmin;
    mediaLog.mark("ice_servers", iceSummary(ice));
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

  private newPc(label: "pub" | "recv") {
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle", iceCandidatePoolSize: 2 });
    mediaLog.watchPc(pc, label);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        mediaLog.mark("ice_restart", label);
        try { pc.restartIce(); } catch { /* */ }
        this.scheduleRetry(label);
      }
    };
    return pc;
  }

  private scheduleRetry(label: "pub" | "recv") {
    const n = label === "pub" ? this.pubRetries : this.recvRetries;
    if (n >= 2) return;
    if (label === "pub") this.pubRetries += 1;
    else this.recvRetries += 1;
    mediaLog.mark("retry", `${label}:${n + 1}`);
    window.setTimeout(() => {
      if (label === "pub") {
        const tracks = this.activePubs();
        if (tracks.length) void this.enqueuePub(() => this.republishAll(tracks, ICE_RETRY_WAIT_MS));
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

  private async applyRemote(pc: RTCPeerConnection, raw: unknown, fallback: RTCSdpType) {
    const desc = sdpDesc(raw, fallback);
    if (!desc) return;
    await pc.setRemoteDescription(desc);
  }

  private sfuFailed(r: Record<string, unknown>, name?: string) {
    const tracks = (Array.isArray(sfuField(r, "tracks")) ? sfuField(r, "tracks") : Array.isArray(r.tracks) ? r.tracks : []) as TrackRow[];
    if (r.errorErrors || r.errorCode) return true;
    if (name) return tracks.some((x) => x.trackName === name && x.errorCode);
    return tracks.some((x) => x.errorCode);
  }

  private async ensurePub() {
    if (this.pub) return;
    this.pub = this.newPc("pub");
    const r = await this.call({ op: "session-new" });
    this.pubId = String(r.sessionId || "");
    mediaLog.mark("sfu_session_pub", this.pubId ? this.pubId.slice(0, 10) : "failed");
    if (!this.pubId) throw new Error("sfu_session");
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
    if (this.recv) return;
    this.recv = this.newPc("recv");
    this.attachRecv(this.recv);
    const r = await this.call({ op: "session-new" });
    this.recvId = String(r.sessionId || "");
    mediaLog.mark("sfu_session_recv", this.recvId ? this.recvId.slice(0, 10) : "failed");
    if (!this.recvId) throw new Error("sfu_session");
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
    this.warm = undefined;
  }

  private dropRecvPc() {
    try { this.recv?.close(); } catch { /* */ }
    this.recv = undefined;
    this.recvId = "";
    this.midKey.clear();
    this.pendingOntrack.clear();
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
    mediaLog.mark("tracks_new_push", items.map((x) => x.name).join(",") || "none");
    const r = await this.call({
      op: "tracks-new",
      sessionId: this.pubId,
      sessionDescription: { type: "offer", sdp: this.pub!.localDescription?.sdp },
      tracks: items.map(({ name, trans }) => ({ location: "local", mid: trans.mid, trackName: name })),
    });
    if (this.sfuFailed(r)) throw new Error("sfu_publish");
    if (r.sessionDescription) await this.applyRemote(this.pub!, r.sessionDescription, "answer");
    for (const { name, trans } of items) this.published.set(name, trans);
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

  async publish(name: string, track: MediaStreamTrack) {
    await this.enqueuePub(async () => {
      await this.ensurePub();
      const existing = this.slots.get(name) || this.published.get(name);
      if (existing) {
        try {
          await existing.sender.replaceTrack(track);
          this.published.set(name, existing);
          return;
        } catch { /* fall through and renegotiate */ }
      }
      try {
        const trans = this.pub!.addTransceiver(track, { direction: "sendonly" });
        const offer = await this.pub!.createOffer();
        await this.pub!.setLocalDescription(offer);
        await waitIce(this.pub!);
        mediaLog.mark("tracks_new_push", name);
        const r = await this.call({
          op: "tracks-new",
          sessionId: this.pubId,
          sessionDescription: { type: "offer", sdp: this.pub!.localDescription?.sdp },
          tracks: [{ location: "local", mid: trans.mid, trackName: name }],
        });
        if (this.sfuFailed(r, name)) throw new Error("sfu_publish");
        if (r.sessionDescription) await this.applyRemote(this.pub!, r.sessionDescription, "answer");
        this.slots.set(name, trans);
        this.published.set(name, trans);
        this.pubRetries = 0;
      } catch (e) {
        // First answer without BUNDLE (or a later add/remove) makes Chrome refuse createOffer
        // with ERROR_CONTENT "max-bundle configured". Rebuild the publish session as one offer.
        if (!isMaxBundleError(e) && !this.published.size && !this.pub?.currentRemoteDescription) throw e;
        await this.republishAll(this.activePubs({ name, track }));
      }
    });
    if (this.pubId) {
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

  private async pullFresh(pubs: LivePub[], iceMs = ICE_WAIT_MS) {
    const wanted = new Set<string>();
    const fresh: { sessionId: string; name: string; subId: string; key: string }[] = [];
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
      const tracks = (Array.isArray(sfuField(r, "tracks")) ? sfuField(r, "tracks") : []) as TrackRow[];
      const used = new Set<string>();
      for (const item of fresh) {
        if (this.sfuFailed(r, item.name)) continue;
        const mine = tracks.find((t) => {
          const mid = t.mid != null ? String(t.mid) : "";
          if (!mid || t.errorCode || used.has(mid)) return false;
          return t.trackName === item.name || ((!t.trackName || t.trackName === item.name) && (!t.sessionId || t.sessionId === item.sessionId));
        });
        const mid = mine?.mid != null ? String(mine.mid) : "";
        if (!mid) continue;
        used.add(mid);
        this.bindMid(mid, item.key);
        this.subbed.add(item.subId);
      }
      const offer = sfuField(r, "sessionDescription") ?? sfuField(r, "session_description");
      if (offer) {
        await this.applyRemote(this.recv!, offer, "offer");
        const answer = await this.recv!.createAnswer();
        await this.recv!.setLocalDescription(answer);
        await waitIce(this.recv!, iceMs);
        const local = this.recv!.localDescription;
        await this.call({
          op: "renegotiate",
          sessionId: this.recvId,
          sessionDescription: local ? { type: "answer", sdp: sdpDesc(local, "answer")?.sdp || local.sdp } : { type: "answer", sdp: answer.sdp },
        });
        this.recvRetries = 0;
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
