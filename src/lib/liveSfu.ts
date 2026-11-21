"use client";

/** Browser helper for Cloudflare Realtime SFU (publish + subscribe). App Secret stays on the worker. */
import { lmsApi, type LivePub } from "@/lib/lms";
import { isMaxBundleError, sdpDesc } from "@/lib/liveSdp";

export async function waitIce(pc: RTCPeerConnection, ms = 2500) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    const fn = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        pc.removeEventListener("icegatheringstatechange", fn);
        res();
      }
    };
    pc.addEventListener("icegatheringstatechange", fn);
  });
}

type RemoteFn = (key: string, stream: MediaStream | null) => void;

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
  private q: Promise<void> = Promise.resolve();
  constructor(roomId: string, selfId: string, ice: RTCIceServer[], onRemote: RemoteFn, asAdmin = false) {
    this.roomId = roomId;
    this.selfId = selfId;
    this.ice = ice;
    this.onRemote = onRemote;
    this.asAdmin = asAdmin;
  }

  private enqueue(fn: () => Promise<void>) {
    this.q = this.q.then(fn, fn);
    return this.q;
  }

  setSelfId(id: string) { if (id) this.selfId = id; }

  private call(body: Record<string, unknown>) {
    return lmsApi.liveSfu(this.roomId, body, this.asAdmin);
  }

  private newPc() {
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle" });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
    };
    return pc;
  }

  private async applyRemote(pc: RTCPeerConnection, raw: unknown, fallback: RTCSdpType) {
    const desc = sdpDesc(raw, fallback);
    if (!desc) return;
    await pc.setRemoteDescription(desc);
  }

  private sfuFailed(r: Record<string, unknown>, name?: string) {
    const tracks = (Array.isArray(r.tracks) ? r.tracks : []) as { errorCode?: string; trackName?: string }[];
    if (r.errorErrors || r.errorCode) return true;
    if (name) return tracks.some((x) => x.trackName === name && x.errorCode);
    return tracks.some((x) => x.errorCode);
  }

  private async ensurePub() {
    if (this.pub) return;
    this.pub = this.newPc();
    const r = await this.call({ op: "session-new" });
    this.pubId = String(r.sessionId || "");
    if (!this.pubId) throw new Error("sfu_session");
  }

  private async ensureRecv() {
    if (this.recv) return;
    this.recv = this.newPc();
    this.recv.ontrack = (ev) => {
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
    const r = await this.call({ op: "session-new" });
    this.recvId = String(r.sessionId || "");
    if (!this.recvId) throw new Error("sfu_session");
  }

  private dropPubPc() {
    try { this.pub?.close(); } catch { /* */ }
    this.pub = undefined;
    this.pubId = "";
    this.published.clear();
    this.slots.clear();
  }

  /** Recreate the publish session and push every active track in one tracks/new (Cloudflare batch). */
  private async republishAll(tracks: { name: string; track: MediaStreamTrack }[]) {
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
    await waitIce(this.pub!);
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
    await this.enqueue(async () => {
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
      } catch (e) {
        // First answer without BUNDLE (or a later add/remove) makes Chrome refuse createOffer
        // with ERROR_CONTENT "max-bundle configured". Rebuild the publish session as one offer.
        if (!isMaxBundleError(e) && !this.published.size && !this.pub?.currentRemoteDescription) throw e;
        await this.republishAll(this.activePubs({ name, track }));
      }
    });
    if (this.pubId) await lmsApi.livePub(this.roomId, this.pubId, [...this.published.keys()], this.asAdmin);
  }

  async unpublish(name: string) {
    await this.enqueue(async () => {
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

  async syncSubs(pubs: LivePub[]) {
    await this.enqueue(async () => {
      await this.ensureRecv();
      const wanted = new Set<string>();
      for (const p of pubs) {
        if (p.userId === this.selfId) continue;
        for (const name of p.tracks) {
          const subId = `${p.sessionId}:${name}`;
          const key = `${p.userId}:${name}`;
          wanted.add(subId);
          this.subUi.set(subId, key);
          if (this.subbed.has(subId)) continue;
          const r = await this.call({
            op: "tracks-new",
            sessionId: this.recvId,
            tracks: [{ location: "remote", sessionId: p.sessionId, trackName: name }],
          });
          const tracks = (Array.isArray(r.tracks) ? r.tracks : []) as { mid?: string; sessionId?: string; trackName?: string; errorCode?: string }[];
          if (this.sfuFailed(r, name)) continue;
          const mine = tracks.find((t) => t.trackName === name && !t.errorCode);
          if (!mine?.mid) continue;
          this.midKey.set(String(mine.mid), key);
          const pending = this.pendingOntrack.get(String(mine.mid));
          if (pending) {
            this.pendingOntrack.delete(String(mine.mid));
            const stream = pending.streams[0] || new MediaStream([pending.track]);
            pending.track.onended = () => this.onRemote(key, null);
            this.onRemote(key, stream);
          }
          if (r.sessionDescription) {
            await this.applyRemote(this.recv!, r.sessionDescription, "offer");
            const answer = await this.recv!.createAnswer();
            await this.recv!.setLocalDescription(answer);
            await waitIce(this.recv!);
            const local = this.recv!.localDescription;
            await this.call({
              op: "renegotiate",
              sessionId: this.recvId,
              sessionDescription: local ? { type: "answer", sdp: sdpDesc(local, "answer")?.sdp || local.sdp } : { type: "answer", sdp: answer.sdp },
            });
          }
          this.subbed.add(subId);
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
    });
  }

  close() {
    for (const tr of this.published.values()) {
      try { tr.sender.track?.stop(); } catch { /* */ }
      try { tr.stop(); } catch { /* */ }
    }
    this.published.clear();
    this.slots.clear();
    this.subbed.clear();
    this.subUi.clear();
    this.pendingOntrack.clear();
    try { this.pub?.close(); } catch { /* */ }
    try { this.recv?.close(); } catch { /* */ }
    this.pub = undefined;
    this.recv = undefined;
    this.pubId = "";
    this.recvId = "";
  }
}
