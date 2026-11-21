"use client";

/** Browser helper for Cloudflare Realtime SFU (publish + subscribe). App Secret stays on the worker. */
import { lmsApi, type LivePub } from "@/lib/lms";

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
  private midKey = new Map<string, string>();
  private subbed = new Set<string>();
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
      const key = this.midKey.get(mid) || "";
      if (!key) return;
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      ev.track.onended = () => this.onRemote(key, null);
      this.onRemote(key, stream);
    };
    const r = await this.call({ op: "session-new" });
    this.recvId = String(r.sessionId || "");
    if (!this.recvId) throw new Error("sfu_session");
  }

  async publish(name: string, track: MediaStreamTrack) {
    await this.enqueue(async () => {
      await this.ensurePub();
      if (this.published.has(name)) {
        const tr = this.published.get(name)!;
        await tr.sender.replaceTrack(track);
        return;
      }
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
      if (r.errorErrors || r.errorCode) throw new Error("sfu_publish");
      if (r.sessionDescription) await this.pub!.setRemoteDescription(r.sessionDescription as RTCSessionDescriptionInit);
      this.published.set(name, trans);
    });
    await lmsApi.livePub(this.roomId, this.pubId, [...this.published.keys()], this.asAdmin);
  }

  async unpublish(name: string) {
    await this.enqueue(async () => {
      const trans = this.published.get(name);
      if (!trans || !this.pub) return;
      const mid = trans.mid;
      try { trans.stop(); } catch { /* */ }
      try { trans.sender.track?.stop(); } catch { /* */ }
      const offer = await this.pub.createOffer();
      await this.pub.setLocalDescription(offer);
      await waitIce(this.pub);
      const r = await this.call({
        op: "tracks-close",
        sessionId: this.pubId,
        tracks: [{ mid }],
        sessionDescription: { type: "offer", sdp: this.pub.localDescription?.sdp },
        force: false,
      });
      if (r.sessionDescription) await this.pub.setRemoteDescription(r.sessionDescription as RTCSessionDescriptionInit);
      this.published.delete(name);
    });
    const left = [...this.published.keys()];
    if (left.length) await lmsApi.livePub(this.roomId, this.pubId, left, this.asAdmin);
    else await lmsApi.liveUnpub(this.roomId, [name], this.asAdmin);
  }

  async syncSubs(pubs: LivePub[]) {
    await this.enqueue(async () => {
      await this.ensureRecv();
      const wanted = new Set<string>();
      for (const p of pubs) {
        if (p.userId === this.selfId) continue;
        for (const name of p.tracks) {
          const key = `${p.userId}:${name}`;
          wanted.add(key);
          if (this.subbed.has(key)) continue;
          const r = await this.call({
            op: "tracks-new",
            sessionId: this.recvId,
            tracks: [{ location: "remote", sessionId: p.sessionId, trackName: name }],
          });
          const tracks = (Array.isArray(r.tracks) ? r.tracks : []) as { mid?: string; sessionId?: string; trackName?: string; errorCode?: string }[];
          const mine = tracks.find((t) => t.trackName === name && !t.errorCode) || tracks[0];
          if (mine?.mid) this.midKey.set(String(mine.mid), key);
          this.subbed.add(key);
          if (r.sessionDescription) {
            await this.recv!.setRemoteDescription(r.sessionDescription as RTCSessionDescriptionInit);
            const answer = await this.recv!.createAnswer();
            await this.recv!.setLocalDescription(answer);
            await waitIce(this.recv!);
            await this.call({
              op: "renegotiate",
              sessionId: this.recvId,
              sessionDescription: { type: "answer", sdp: this.recv!.localDescription?.sdp },
            });
          }
        }
      }
      for (const key of [...this.subbed]) {
        if (!wanted.has(key)) {
          this.subbed.delete(key);
          this.onRemote(key, null);
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
    this.subbed.clear();
    try { this.pub?.close(); } catch { /* */ }
    try { this.recv?.close(); } catch { /* */ }
    this.pub = undefined;
    this.recv = undefined;
  }
}
