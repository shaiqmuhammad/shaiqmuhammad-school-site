/** ICE gather helpers: start media as soon as a usable candidate exists. */

export const ICE_WAIT_MS = 150;
export const ICE_RETRY_WAIT_MS = 800;
export const ICE_EXTEND_MS = 500;
export const CONNECT_WAIT_MS = 2500;

export type IceLike = {
  iceGatheringState: string;
  addEventListener: (type: string, fn: (ev: { candidate?: { type?: string | null } | null }) => void) => void;
  removeEventListener: (type: string, fn: (ev: { candidate?: { type?: string | null } | null }) => void) => void;
};

function isUseful(type?: string | null) {
  return type === "srflx" || type === "prflx" || type === "relay";
}

/** Resolve on the first srflx/relay candidate, on gather complete, or when the cap is reached. */
export async function waitIce(pc: IceLike, ms = ICE_WAIT_MS) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((res) => {
    let settled = false;
    let useful = false;
    let extra: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      if (extra) clearTimeout(extra);
      pc.removeEventListener("icegatheringstatechange", onGather);
      pc.removeEventListener("icecandidate", onCand);
      res();
    };
    const t = setTimeout(() => {
      if (useful || pc.iceGatheringState === "complete") done();
      else extra = setTimeout(done, Math.max(0, ICE_EXTEND_MS - ms));
    }, ms);
    const onGather = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const onCand = (ev: { candidate?: { type?: string | null } | null }) => {
      if (isUseful(ev.candidate?.type)) {
        useful = true;
        done();
      }
    };
    pc.addEventListener("icegatheringstatechange", onGather);
    pc.addEventListener("icecandidate", onCand);
  });
}

type IceServerLike = { urls: string | string[]; username?: string; credential?: string };

/** Always keep a public STUN server so ICE is not forced onto TURN-only relay. */
export function mergeIceServers(servers: IceServerLike[]): IceServerLike[] {
  const stunUrl = "stun:stun.cloudflare.com:3478";
  const out: IceServerLike[] = [{ urls: stunUrl }];
  const seen = new Set<string>([stunUrl]);
  for (const s of servers || []) {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => u && !/:53(\?|$)/.test(String(u)));
    if (!urls.length) continue;
    const key = urls.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, urls: urls.length === 1 ? urls[0]! : urls });
  }
  return out;
}

/** Safe summary for debug logs (no usernames or credentials). */
export function iceSummary(servers: IceServerLike[]): string {
  let stun = 0;
  let turn = 0;
  for (const s of servers || []) {
    for (const u of Array.isArray(s.urls) ? s.urls : [s.urls]) {
      if (/^turns?:/i.test(String(u))) turn += 1;
      else stun += 1;
    }
  }
  return `stun:${stun} turn:${turn}`;
}

export type ConnLike = {
  connectionState: string;
  iceConnectionState?: string;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

function isConnected(pc: ConnLike) {
  return pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";
}

/** Wait until the PeerConnection is connected so publications can be announced (Cloudflare SFU). */
export async function waitConnected(pc: ConnLike, ms = CONNECT_WAIT_MS) {
  if (isConnected(pc)) return true;
  return await new Promise<boolean>((res) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      pc.removeEventListener("connectionstatechange", on);
      pc.removeEventListener("iceconnectionstatechange", on);
      res(ok);
    };
    const on = () => {
      if (isConnected(pc)) done(true);
      else if (pc.connectionState === "failed" || pc.connectionState === "closed") done(false);
    };
    const t = setTimeout(() => done(isConnected(pc)), ms);
    pc.addEventListener("connectionstatechange", on);
    pc.addEventListener("iceconnectionstatechange", on);
  });
}
