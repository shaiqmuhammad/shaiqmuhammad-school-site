/**
 * Part 1 — Live Lesson classroom (Cloudflare Realtime SFU + one Durable Object per room).
 *
 * Signalling and membership live in the DO (hibernating WebSockets). Media flows
 * browser ↔ Cloudflare Realtime SFU; the App Secret never leaves this worker.
 * Attendance is insert-only into att (not att-save). Staff-only recording uses optional LIVE_RECS R2.
 * No emails, no student notifications, no reward-balance changes, no SQLite video fallback.
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply } from "./admin";
import { lmsActor, type Actor, type LmsEnv } from "./lms";
import { recObjectKey } from "./liveAtt";
import { allowedPubTracks, canControlStudentMedia, canPresentInRoom, canSetMemberFloor, memberFloor, normalizePtrKind, type LiveFloor } from "./liveMedia";
import { SWEEP_MS, shouldDropMember, nextAlarmAt } from "./livePresence";
import { liveRemoveCheck } from "./liveRemove";
import { activatePresentItem, applyActivePresentItem, closeLibraryPresentItems, closePresentItem, openPresentItem, stashActivePresentItem, youtubeVideoId, type LivePresentItem } from "./livePresentItems";
import { keepDebugLogs, sanitizeLiveDebug, type LiveDebugBlob } from "./liveDebug";
import { normalizeSfuReply } from "./sfuError";
import { normalizeLiveShapes, type LiveShape, type LiveShapeKind } from "./liveShapes";

export interface LiveEnv extends LmsEnv {
  LIVE: DurableObjectNamespace<LiveRoom>;
  REALTIME_SFU_APP_ID?: string;
  REALTIME_SFU_APP_SECRET?: string;
  REALTIME_TURN_TOKEN_ID?: string;
  REALTIME_TURN_API_TOKEN?: string;
  /** Optional. Present only after R2 is enabled and bucket shaiqmuhammad-live-recordings is bound as LIVE_RECS. */
  LIVE_RECS?: R2Bucket;
}

const SFU = "https://rtc.live.cloudflare.com/v1";
const ROOM_RE = /^lv_[a-z0-9]{10,24}$/;
const MAX_MEMBERS = 40;
const MAX_WAITING = 40;
const MAX_CHAT = 80;
const MAX_TEXT = 400;

type Role = "teacher" | "student";
export type LivePub = { userId: string; sessionId: string; tracks: string[] };
export type LiveMember = { id: string; name: string; role: Role; camAllowed: boolean; micAllowed: boolean; shareAllowed?: boolean; hand: boolean; present: boolean; floor?: LiveFloor; seenAt?: number; hb?: boolean };
export type LiveWait = { id: string; name: string; at: number };
export type LiveAsk = { userId: string; name: string; cam: boolean; mic: boolean; at: number };
export type LiveChat = { id: string; from: string; name: string; text: string; at: number };
export type LiveStroke = { c: string; w: number; d: number[]; by: string };
export type { LiveShape, LiveShapeKind } from "./liveShapes";
export type LiveAnswer = { userId: string; name: string; slide: number; text: string; at: number };
export const LIVE_VIEW_MODES = ["teach", "lecture", "gallery", "speaker", "board", "discuss"] as const;
export type LiveViewMode = (typeof LIVE_VIEW_MODES)[number];
export type LiveView = { mode: LiveViewMode; follow: boolean };
function isViewMode(v: unknown): v is LiveViewMode {
  return LIVE_VIEW_MODES.includes(v as LiveViewMode);
}

export type { LivePresentItem, LivePresentItemKind } from "./livePresentItems";
export type LivePresent = {
  packId: string;
  packTitle: string;
  slide: number;
  follow: boolean;
  timerEnd: number | null;
  penId: string;
  strokes: LiveStroke[];
  tool: "" | "wheel" | "rand" | "award" | "board";
  wheelAngle: number;
  wheelSpinTo: number;
  wheelAt: number;
  winnerId: string;
  winnerName: string;
  randText: string;
  answers: LiveAnswer[];
  items?: LivePresentItem[];
  activeId?: string;
  src?: string;
  shapes?: LiveShape[];
};
export type LiveSnap = {
  id: string;
  title: string;
  cls: string;
  section: string;
  groupId: string;
  teacherId: string;
  status: "live" | "ended";
  created: number;
  waiting: LiveWait[];
  members: LiveMember[];
  chat: LiveChat[];
  pubs: LivePub[];
  asks?: LiveAsk[];
  sfu: boolean;
  present?: LivePresent | null;
  endsAt: number;
  view?: LiveView;
};

type State = Omit<LiveSnap, "sfu">;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

function newId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return "lv_" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function canRun(a: Actor) {
  return a.role === "admin" || (a.role === "teacher" && a.perms.includes("liveLesson"));
}
function canLive(a: Actor, perm: string) {
  return a.role === "admin" || (a.role === "teacher" && a.perms.includes(perm));
}
function liveFlags(a: Actor, env?: LiveEnv) {
  return {
    run: canRun(a),
    schedule: canLive(a, "liveSchedule"),
    schedStudent: canLive(a, "liveSchedStudent"),
    schedClass: canLive(a, "liveSchedClass"),
    shareLink: canLive(a, "liveShareLink"),
    camMic: canLive(a, "liveCamMic"),
    screenShare: canLive(a, "liveScreenShare"),
    present: canLive(a, "livePresent"),
    instant: canLive(a, "liveInstant"),
    record: canLive(a, "liveRecord"),
    recs: !!(env && env.LIVE_RECS),
  };
}
function tokenOf(request: Request, fallback = "") {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return fallback;
}
async function liveActor(request: Request, env: LiveEnv, store: ReturnType<LiveEnv["LMS"]["get"]>, raw = ""): Promise<Actor | null> {
  const a = await lmsActor(request, env, store);
  if (a) return a;
  const tok = raw || tokenOf(request);
  if (!tok.startsWith("lg_")) return null;
  return store.liveGuestActor(tok);
}

function publicMember(m: LiveMember, teacherId: string): LiveMember {
  const { seenAt: _seen, hb: _hb, ...rest } = m;
  return { ...rest, floor: memberFloor(m, teacherId) };
}
function publicSnap(s: State, sfu: boolean): LiveSnap {
  const members = s.members.map((m) => publicMember(m, s.teacherId));
  return { ...s, members, endsAt: s.endsAt || s.created + 40 * 60_000, waiting: s.waiting.map((w) => ({ id: w.id, name: w.name, at: w.at })), asks: s.asks || [], sfu };
}

export class LiveRoom extends DurableObject<LiveEnv> {
  private state: State | null = null;
  private loaded = false;

  private async load() {
    if (this.loaded) return;
    this.state = (await this.ctx.storage.get<State>("s")) || null;
    this.loaded = true;
  }
  private async save() {
    if (this.state) await this.ctx.storage.put("s", this.state);
  }
  private send(ws: WebSocket, msg: unknown) {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }
  private broadcast(msg: unknown, except?: string) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (except && (ws as WebSocket & { deserializeAttachment?: () => unknown }).deserializeAttachment?.() === except) continue;
      const tags = this.ctx.getTags(ws);
      if (except && tags.includes(except)) continue;
      try { ws.send(text); } catch { /* closed */ }
    }
  }
  private roomMsg() {
    if (!this.state) return;
    const room = publicSnap(this.state, this.sfuReady());
    for (const ws of this.ctx.getWebSockets()) {
      const selfId = this.ctx.getTags(ws)[0] || "";
      this.send(ws, { t: "room", room, selfId });
    }
  }
  private pubsMsg() {
    if (!this.state) return;
    this.broadcast({ t: "pubs", pubs: this.state.pubs });
  }
  private sfuReady() {
    return !!(this.env.REALTIME_SFU_APP_ID && this.env.REALTIME_SFU_APP_SECRET);
  }
  private member(id: string) {
    return this.state?.members.find((m) => m.id === id);
  }
  async putDebug(blob: LiveDebugBlob): Promise<{ ok: boolean }> {
    const list = (await this.ctx.storage.get<LiveDebugBlob[]>("dbg")) || [];
    await this.ctx.storage.put("dbg", keepDebugLogs(list, blob));
    return { ok: true };
  }
  async getDebug(requesterId: string, isHost: boolean): Promise<LiveDebugBlob[]> {
    const list = (await this.ctx.storage.get<LiveDebugBlob[]>("dbg")) || [];
    const now = Date.now();
    const live = list.filter((x) => now - x.at < 6 * 3600 * 1000);
    return isHost ? live : live.filter((x) => x.clientId === requesterId);
  }
  private roomEndsAt() {
    return this.state?.endsAt || (this.state ? this.state.created + 40 * 60_000 : Date.now() + SWEEP_MS);
  }
  private async scheduleSweep() {
    if (!this.state || this.state.status !== "live") return;
    await this.ctx.storage.setAlarm(nextAlarmAt(Date.now(), this.roomEndsAt()));
  }
  private touch(uid: string, ping = false) {
    const m = this.member(uid);
    if (!m) return false;
    const was = m.present;
    m.present = true;
    m.seenAt = Date.now();
    if (ping) m.hb = true;
    return !was;
  }
  private presence(ev: "join" | "leave", m: { id: string; name: string }) {
    this.broadcast({ t: "presence", ev, userId: m.id, name: m.name });
  }
  /** Remove an attendee (or mark the host offline). Returns the member if the roster changed. */
  private dropMember(userId: string): LiveMember | null {
    if (!this.state) return null;
    this.state.waiting = this.state.waiting.filter((w) => w.id !== userId);
    const m = this.member(userId);
    if (!m) return null;
    this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    if (userId === this.state.teacherId) {
      if (!m.present && !this.ctx.getWebSockets(userId).length) return null;
      m.present = false;
      m.seenAt = Date.now();
      return m;
    }
    this.state.members = this.state.members.filter((x) => x.id !== userId);
    return m;
  }
  private async sweepStale(now = Date.now()) {
    if (!this.state || this.state.status !== "live") return;
    const left: LiveMember[] = [];
    for (const m of [...this.state.members]) {
      const sockets = this.ctx.getWebSockets(m.id).length;
      const action = shouldDropMember(m, { now, sockets, isHost: m.id === this.state.teacherId });
      if (action === "keep") continue;
      if (action === "offline") {
        if (m.present) {
          m.present = false;
          m.seenAt = now;
          this.state.pubs = this.state.pubs.filter((p) => p.userId !== m.id);
          left.push(m);
        }
        if (sockets && m.hb) {
          for (const ws of this.ctx.getWebSockets(m.id)) {
            try { ws.close(4000, "stale"); } catch { /* */ }
          }
        }
        continue;
      }
      const dropped = this.dropMember(m.id);
      if (dropped) {
        left.push(dropped);
        if (sockets) {
          for (const ws of this.ctx.getWebSockets(m.id)) {
            try { ws.close(4000, "stale"); } catch { /* */ }
          }
        }
      }
    }
    if (left.length) {
      await this.save();
      for (const m of left) this.presence("leave", m);
      this.roomMsg();
    }
  }

  async init(meta: { id: string; title: string; cls: string; section: string; groupId: string; teacherId: string; teacherName: string; endsAt?: number }) {
    await this.load();
    if (this.state && this.state.status === "live") return publicSnap(this.state, this.sfuReady());
    const now = Date.now();
    this.state = {
      id: meta.id,
      title: meta.title || "Live Lesson",
      cls: meta.cls,
      section: meta.section,
      groupId: meta.groupId,
      teacherId: meta.teacherId,
      status: "live",
      created: now,
      endsAt: Math.max(now + 60_000, Math.min(now + 180 * 60_000, Number(meta.endsAt) || (now + 40 * 60_000))),
      waiting: [],
      members: [{ id: meta.teacherId, name: meta.teacherName || "Teacher", role: "teacher", camAllowed: true, micAllowed: true, hand: false, present: true, floor: "presenter" }],
      chat: [],
      pubs: [],
      asks: [],
    };
    await this.save();
    await this.scheduleSweep();
    return publicSnap(this.state, this.sfuReady());
  }

  async snapshot(): Promise<LiveSnap | null> {
    await this.load();
    return this.state ? publicSnap(this.state, this.sfuReady()) : null;
  }

  async requestJoin(a: { id: string; name: string; role: Role | "admin" }): Promise<{ status: "in" | "waiting" | "ended" | "full"; room?: LiveSnap }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { status: "ended" };
    if (a.id === this.state.teacherId || this.member(a.id)) {
      const m = this.member(a.id);
      const joined = m ? this.touch(m.id) : false;
      if (m) m.name = m.name || a.name;
      await this.save();
      if (joined && m) this.presence("join", m);
      this.roomMsg();
      return { status: "in", room: publicSnap(this.state, this.sfuReady()) };
    }
    if (this.state.members.length >= MAX_MEMBERS) return { status: "full" };
    if (this.state.waiting.some((w) => w.id === a.id)) return { status: "waiting", room: publicSnap(this.state, this.sfuReady()) };
    if (this.state.waiting.length >= MAX_WAITING) return { status: "full" };
    this.state.waiting.push({ id: a.id, name: a.name || "Student", at: Date.now() });
    await this.save();
    this.roomMsg();
    return { status: "waiting", room: publicSnap(this.state, this.sfuReady()) };
  }

  async admit(hostId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    if (hostId !== this.state.teacherId) return { ok: false, error: "forbidden" };
    const ids = userId === "all" ? this.state.waiting.map((w) => w.id) : [userId];
    const joined: { id: string; name: string }[] = [];
    for (const id of ids) {
      const w = this.state.waiting.find((x) => x.id === id);
      if (!w) continue;
      if (this.state.members.length >= MAX_MEMBERS) break;
      this.state.waiting = this.state.waiting.filter((x) => x.id !== id);
      this.state.members.push({ id: w.id, name: w.name, role: "student", camAllowed: false, micAllowed: false, shareAllowed: false, hand: false, present: true, floor: "attendee", seenAt: Date.now() });
      joined.push({ id: w.id, name: w.name });
    }
    await this.save();
    for (const m of joined) this.presence("join", m);
    this.roomMsg();
    return { ok: true };
  }

  async deny(hostId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    if (hostId !== this.state.teacherId) return { ok: false, error: "forbidden" };
    this.state.waiting = this.state.waiting.filter((w) => w.id !== userId);
    await this.save();
    this.broadcast({ t: "denied", userId });
    this.roomMsg();
    return { ok: true };
  }

  async remove(hostId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    const check = liveRemoveCheck({
      live: !!(this.state && this.state.status === "live"),
      teacherId: this.state?.teacherId || "",
      hostId,
      userId,
      memberIds: (this.state?.members || []).map((m) => m.id),
    });
    if (!check.ok) return check;
    if (this.state) this.state.asks = (this.state.asks || []).filter((a) => a.userId !== userId);
    const m = this.dropMember(userId);
    if (!m) return { ok: false, error: "not_found" };
    await this.save();
    this.broadcast({ t: "removed", userId });
    this.presence("leave", m);
    this.roomMsg();
    for (const ws of this.ctx.getWebSockets(userId)) {
      try { ws.close(4001, "removed"); } catch { /* */ }
    }
    return { ok: true };
  }

  async leave(userId: string): Promise<{ ok: boolean }> {
    await this.load();
    if (!this.state) return { ok: true };
    const m = this.dropMember(userId);
    await this.save();
    if (m) this.presence("leave", m);
    this.roomMsg();
    for (const ws of this.ctx.getWebSockets(userId)) {
      try { ws.close(1000, "left"); } catch { /* */ }
    }
    return { ok: true };
  }

  async endClass(hostId: string): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    if (!this.state) return { ok: true };
    if (hostId !== this.state.teacherId && hostId !== "admin") return { ok: false, error: "forbidden" };
    this.state.status = "ended";
    this.state.waiting = [];
    this.state.pubs = [];
    await this.env.LMS.get(this.env.LMS.idFromName("main")).liveMarkEnded(this.state.id);
    await this.save();
    this.broadcast({ t: "ended" });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(1000, "ended"); } catch { /* */ }
    }
    return { ok: true };
  }

  async setPerm(hostId: string, userId: string, cam?: boolean, mic?: boolean, share?: boolean, floor?: LiveFloor): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    if (hostId !== this.state.teacherId && hostId !== "admin") return { ok: false, error: "forbidden" };
    const m = this.member(userId);
    if (!m || m.id === this.state.teacherId) return { ok: false, error: "not_found" };
    if (typeof cam === "boolean") m.camAllowed = cam;
    if (typeof mic === "boolean") m.micAllowed = mic;
    if (typeof share === "boolean") m.shareAllowed = share;
    if (floor === "presenter" || floor === "attendee") {
      if (!canSetMemberFloor(hostId === "admin" ? "admin" : hostId, hostId === "admin" ? "admin" : "teacher", this.state.teacherId, userId)) {
        return { ok: false, error: "forbidden" };
      }
      m.floor = floor;
      if (floor === "presenter") {
        m.camAllowed = true;
        m.micAllowed = true;
        m.shareAllowed = true;
        if (this.state.present) this.state.present.penId = userId;
      }
      if (floor === "attendee" && this.state.present?.penId === userId) this.state.present.penId = this.state.teacherId;
    }
    if (m.camAllowed || m.micAllowed) {
      this.state.asks = (this.state.asks || []).filter((x) => {
        if (x.userId !== userId) return true;
        const stillCam = x.cam && !m.camAllowed;
        const stillMic = x.mic && !m.micAllowed;
        return stillCam || stillMic;
      }).map((x) => x.userId !== userId ? x : { ...x, cam: x.cam && !m.camAllowed, mic: x.mic && !m.micAllowed });
    }
    const pub = this.state.pubs.find((p) => p.userId === userId);
    if (pub) {
      if (!m.camAllowed) pub.tracks = pub.tracks.filter((t) => t !== "camera");
      if (!m.micAllowed) pub.tracks = pub.tracks.filter((t) => t !== "mic");
      if (!m.shareAllowed) pub.tracks = pub.tracks.filter((t) => t !== "screen");
      if (!pub.tracks.length) this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    }
    await this.save();
    this.broadcast({ t: "perm", userId, camAllowed: m.camAllowed, micAllowed: m.micAllowed, shareAllowed: !!m.shareAllowed });
    this.roomMsg();
    return { ok: true };
  }

  async askMedia(userId: string, cam: boolean, mic: boolean, on: boolean): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    const m = this.member(userId);
    if (!m || m.role === "teacher") return { ok: false, error: "forbidden" };
    this.state.asks = (this.state.asks || []).filter((x) => x.userId !== userId);
    const wantCam = !!cam && !m.camAllowed;
    const wantMic = !!mic && !m.micAllowed;
    if (on && (wantCam || wantMic)) {
      this.state.asks.push({ userId, name: m.name, cam: wantCam, mic: wantMic, at: Date.now() });
    }
    await this.save();
    this.broadcast({ t: "ask", userId, name: m.name, cam: wantCam, mic: wantMic, on, asks: this.state.asks });
    this.roomMsg();
    return { ok: true };
  }

  async setHand(userId: string, on: boolean): Promise<{ ok: boolean; error?: string }> {

    await this.load();
    const m = this.member(userId);
    if (!this.state || !m) return { ok: false, error: "forbidden" };
    m.hand = !!on;
    await this.save();
    this.roomMsg();
    return { ok: true };
  }

  async addChat(userId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    const m = this.member(userId);
    if (!this.state || this.state.status !== "live" || !m) return { ok: false, error: "forbidden" };
    const msg: LiveChat = { id: "c_" + Date.now().toString(36), from: userId, name: m.name, text: str(text, MAX_TEXT), at: Date.now() };
    if (!msg.text) return { ok: false, error: "empty" };
    this.state.chat = [...this.state.chat, msg].slice(-MAX_CHAT);
    await this.save();
    this.broadcast({ t: "chat", msg });
    return { ok: true };
  }

  async setPub(userId: string, sessionId: string, tracks: string[]): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    const m = this.member(userId);
    if (!this.state || !m || this.state.status !== "live") return { ok: false, error: "forbidden" };
    const wanted = tracks.map((t) => str(t, 20)).filter(Boolean);
    const { next, denied } = allowedPubTracks(m, wanted);
    const sid = str(sessionId, 80);
    if (!sid) return { ok: false, error: "bad_session" };
    if (denied.length && !next.length) return { ok: false, error: "not_allowed" };
    this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    if (next.length) this.state.pubs.push({ userId, sessionId: sid, tracks: next });
    await this.save();
    this.pubsMsg();
    this.roomMsg();
    return { ok: true };
  }

  async dropPub(userId: string, tracks?: string[]): Promise<{ ok: boolean }> {
    await this.load();
    if (!this.state) return { ok: true };
    const pub = this.state.pubs.find((p) => p.userId === userId);
    if (!pub) return { ok: true };
    if (!tracks?.length) this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    else {
      pub.tracks = pub.tracks.filter((t) => !tracks.includes(t));
      if (!pub.tracks.length) this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    }
    await this.save();
    this.pubsMsg();
    this.roomMsg();
    return { ok: true };
  }


  async setEndsAt(hostId: string, endsAt: number): Promise<{ ok: boolean; error?: string; endsAt?: number }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    if (hostId !== this.state.teacherId && hostId !== "admin") return { ok: false, error: "forbidden" };
    const now = Date.now();
    this.state.endsAt = Math.max(now + 30_000, Math.min(now + 180 * 60_000, Math.trunc(endsAt)));
    await this.save();
    await this.scheduleSweep();
    this.roomMsg();
    return { ok: true, endsAt: this.state.endsAt };
  }

  async setView(hostId: string, mode?: string, follow?: boolean): Promise<{ ok: boolean; error?: string; view?: LiveView }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    if (hostId !== this.state.teacherId && hostId !== "admin") return { ok: false, error: "forbidden" };
    const prev = this.state.view || { mode: "gallery" as LiveViewMode, follow: true };
    if (mode != null && mode !== "" && !isViewMode(mode)) return { ok: false, error: "bad_view" };
    const view: LiveView = {
      mode: isViewMode(mode) ? mode : prev.mode,
      follow: typeof follow === "boolean" ? follow : prev.follow,
    };
    this.state.view = view;
    await this.save();
    this.broadcast({ t: "view", view });
    this.roomMsg();
    return { ok: true, view };
  }

  private presentMsg() {
    if (!this.state) return;
    this.broadcast({ t: "present", present: this.state.present || null });
    this.roomMsg();
  }

  async setPresent(hostId: string, patch: (Partial<LivePresent> & { closeId?: string; closeAll?: boolean; activeId?: string }) | null, start?: { packId: string; packTitle: string; kind?: string; src?: string; slide?: number }): Promise<{ ok: boolean; error?: string; present?: LivePresent | null }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    const asPresenter = hostId !== this.state.teacherId && hostId !== "admin" && memberFloor(this.member(hostId), this.state.teacherId) === "presenter";
    if (hostId !== this.state.teacherId && hostId !== "admin" && !asPresenter) return { ok: false, error: "forbidden" };
    if (patch === null && !start) {
      this.state.present = null;
      await this.save();
      this.presentMsg();
      return { ok: true, present: null };
    }
    if (!this.state.present) {
      this.state.present = {
        packId: "",
        packTitle: "Whiteboard",
        slide: 0,
        follow: true,
        timerEnd: null,
        penId: this.state.teacherId,
        strokes: [],
        tool: "",
        wheelAngle: 0,
        wheelSpinTo: 0,
        wheelAt: 0,
        winnerId: "",
        winnerName: "",
        randText: "",
        answers: [],
        items: [{ id: "board", kind: "board", title: "Whiteboard", packId: "", slide: 0, strokes: [], src: "" }],
        activeId: "board",
        src: "",
        shapes: [],
      };
    }
    const p = this.state.present;
    if (start) {
      openPresentItem(p, start);
      if (typeof patch?.follow !== "boolean") p.follow = true;
    }
    if (patch?.closeAll) closeLibraryPresentItems(p);
    else if (typeof patch?.closeId === "string") closePresentItem(p, str(patch.closeId, 80));
    if (typeof patch?.activeId === "string" && !start) activatePresentItem(p, str(patch.activeId, 80));
    if (patch?.tool === "board" && !start) activatePresentItem(p, "board");
    if (typeof patch?.slide === "number") p.slide = Math.max(0, Math.min(59, Math.trunc(patch.slide)));
    if (typeof patch?.follow === "boolean") p.follow = patch.follow;
    if (patch && "timerEnd" in patch) p.timerEnd = patch.timerEnd == null ? null : Math.trunc(Number(patch.timerEnd) || 0);
    if (typeof patch?.penId === "string") p.penId = str(patch.penId, 40) || this.state.teacherId;
    if (patch?.tool === "" || patch?.tool === "wheel" || patch?.tool === "rand" || patch?.tool === "award" || patch?.tool === "board") p.tool = patch.tool;
    if (typeof patch?.wheelAngle === "number") p.wheelAngle = patch.wheelAngle;
    if (typeof patch?.wheelSpinTo === "number") p.wheelSpinTo = patch.wheelSpinTo;
    if (typeof patch?.wheelAt === "number") p.wheelAt = patch.wheelAt;
    if (typeof patch?.winnerId === "string") p.winnerId = str(patch.winnerId, 40);
    if (typeof patch?.winnerName === "string") p.winnerName = str(patch.winnerName, 80);
    if (typeof patch?.randText === "string") p.randText = str(patch.randText, 200);
    if (Array.isArray(patch?.strokes)) {
      p.strokes = patch!.strokes.slice(-200).map((x) => ({
        c: str(x.c, 20) || "#1b3a57",
        w: Math.max(1, Math.min(16, Number(x.w) || 3)),
        d: (Array.isArray(x.d) ? x.d : []).slice(0, 400).map((n) => Number(n) || 0),
        by: str(x.by, 40),
      }));
    }
    if (Array.isArray(patch?.shapes)) {
      p.shapes = normalizeLiveShapes(patch!.shapes, newId);
    }
    stashActivePresentItem(p);
    applyActivePresentItem(p);
    await this.save();
    this.presentMsg();
    return { ok: true, present: p };
  }

  private ptrs = new Map<string, { userId: string; name: string; x: number; y: number; color: string; on: boolean; kind: string }>();

  setPointer(userId: string, x?: number, y?: number, kind?: string) {
    if (!this.state || this.state.status !== "live") return;
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      this.ptrs.delete(userId);
      this.broadcast({ t: "ptr", ptr: { userId, on: false } });
      return;
    }
    const p = this.state.present;
    const allowed = userId === this.state.teacherId || (!!p && p.penId === userId);
    if (!allowed) return;
    const m = this.member(userId);
    const name = (m?.name || (userId === this.state.teacherId ? "Teacher" : "Pen")).slice(0, 80);
    const color = userId === this.state.teacherId ? "#ef4444" : "#16a34a";
    const prev = this.ptrs.get(userId);
    const ptr = { userId, name, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)), color, on: true, kind: normalizePtrKind(kind || prev?.kind) };
    this.ptrs.set(userId, ptr);
    this.broadcast({ t: "ptr", ptr });
  }

  async addStroke(userId: string, stroke: LiveStroke): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    const p = this.state?.present;
    if (!this.state || !p || this.state.status !== "live") return { ok: false, error: "not_presenting" };
    const allowed = userId === this.state.teacherId || userId === p.penId;
    if (!allowed) return { ok: false, error: "no_pen" };
    const next: LiveStroke = {
      c: str(stroke.c, 32) || "#1b3a57",
      w: Math.max(1, Math.min(24, Number(stroke.w) || 3)),
      d: (Array.isArray(stroke.d) ? stroke.d : []).slice(0, 400).map((n) => Number(n) || 0),
      by: userId,
    };
    if (next.d.length < 4) return { ok: false, error: "bad_stroke" };
    p.strokes = [...p.strokes, next].slice(-200);
    stashActivePresentItem(p);
    applyActivePresentItem(p);
    await this.save();
    this.broadcast({ t: "stroke", stroke: next });
    return { ok: true };
  }

  async addAnswer(userId: string, name: string, slide: number, text: string): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    const p = this.state?.present;
    if (!this.state || !p || this.state.status !== "live") return { ok: false, error: "not_presenting" };
    const body = str(text, 1000);
    if (!body) return { ok: false, error: "empty" };
    const sl = Math.max(0, Math.min(59, Math.trunc(slide)));
    p.answers = p.answers.filter((x) => !(x.userId === userId && x.slide === sl));
    p.answers = [...p.answers, { userId, name: str(name, 80) || "Student", slide: sl, text: body, at: Date.now() }].slice(-80);
    await this.save();
    this.presentMsg();
    return { ok: true };
  }

  async knownSession(sessionId: string, userId: string): Promise<boolean> {
    await this.load();
    if (!this.state) return false;
    return this.state.pubs.some((p) => p.sessionId === sessionId) || this.state.members.some((m) => m.id === userId);
  }

  async alarm() {
    await this.load();
    if (!this.state || this.state.status !== "live") return;
    if (Date.now() >= this.roomEndsAt()) {
      await this.endClass(this.state.teacherId);
      return;
    }
    await this.sweepStale();
    await this.scheduleSweep();
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!this.state || this.state.status !== "live") return new Response("ended", { status: 410 });
    const uid = str(request.headers.get("X-Live-User"), 40);
    const name = str(request.headers.get("X-Live-Name"), 80);
    const isHost = uid && uid === this.state.teacherId;
    const member = this.member(uid);
    const waiting = this.state.waiting.some((w) => w.id === uid);
    if (!uid || (!isHost && !member && !waiting)) return new Response("forbidden", { status: 403 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [uid]);
    let joined = false;
    if (member) joined = this.touch(uid);
    else if (isHost) {
      this.state.members.push({ id: uid, name: name || "Teacher", role: "teacher", camAllowed: true, micAllowed: true, hand: false, present: true, floor: "presenter", seenAt: Date.now() });
      joined = true;
    }
    await this.save();
    if (joined) {
      const m = this.member(uid);
      if (m) this.presence("join", m);
    }
    this.send(pair[1], { t: "room", room: publicSnap(this.state, this.sfuReady()), selfId: uid });
    this.roomMsg();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.load();
    if (!this.state || this.state.status !== "live") return;
    let data: { t?: string; text?: string; on?: boolean; x?: number; y?: number; kind?: string } = {};
    try { data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)) as typeof data; } catch { return; }
    const uid = this.ctx.getTags(ws)[0] || "";
    if (data.t === "ping") {
      this.touch(uid, true);
      await this.save();
      this.send(ws, { t: "pong" });
      return;
    }
    if (uid) this.touch(uid);
    if (data.t === "ptr") { this.setPointer(uid, data.x, data.y, data.kind); return; }
    if (data.t === "chat") await this.addChat(uid, String(data.text || ""));
    if (data.t === "raise") await this.setHand(uid, !!data.on);
  }

  async webSocketClose(ws: WebSocket) {
    await this.load();
    if (!this.state || this.state.status !== "live") return;
    const uid = this.ctx.getTags(ws)[0] || "";
    const m = this.member(uid);
    if (!m) return;
    const still = this.ctx.getWebSockets(uid).filter((x) => x !== ws).length;
    if (still) return;
    m.present = false;
    m.seenAt = Date.now();
    await this.save();
    this.roomMsg();
    await this.scheduleSweep();
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}

function roomStub(env: LiveEnv, id: string) {
  return env.LIVE.get(env.LIVE.idFromName(id));
}

async function sfuCall(env: LiveEnv, method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const appId = str(env.REALTIME_SFU_APP_ID, 80);
  const secret = env.REALTIME_SFU_APP_SECRET || "";
  if (!appId || !secret) return { status: 503, json: { error: "sfu_not_configured" } };
  const r = await fetch(`${SFU}/apps/${appId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return normalizeSfuReply(r.status, json);
}

type IceServer = { urls: string | string[]; username?: string; credential?: string };
function iceStun(): IceServer[] {
  return [{ urls: "stun:stun.cloudflare.com:3478" }];
}

async function iceServers(env: LiveEnv): Promise<IceServer[]> {
  const key = str(env.REALTIME_TURN_TOKEN_ID, 80);
  const tok = env.REALTIME_TURN_API_TOKEN || "";
  if (!key || !tok) return iceStun();
  try {
    const r = await fetch(`${SFU}/turn/keys/${key}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 4 * 3600 }),
    });
    const j = (await r.json().catch(() => ({}))) as { iceServers?: IceServer[] };
    if (r.ok && Array.isArray(j.iceServers) && j.iceServers.length) {
      const filtered = j.iceServers.filter((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return !urls.some((u) => /:53(\?|$)/.test(String(u)));
      });
      if (filtered.length) {
        const stun = iceStun();
        const haveStun = filtered.some((s) => {
          const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
          return urls.some((u) => /^stuns?:/i.test(String(u)));
        });
        return haveStun ? filtered : [...stun, ...filtered];
      }
    }
  } catch { /* STUN fallback */ }
  return iceStun();
}

export async function handleLive(request: Request, env: LiveEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (action === "live-ws") return handleLiveWs(request, env);

  const store = env.LMS.get(env.LMS.idFromName("main"));
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    const text = await request.text();
    const max = action === "live-rec" ? 2_200_000 : 60_000;
    if (text.length > max) return reply(origin, { error: "too_large" }, 413);
    try { body = JSON.parse(text || "{}") as Record<string, unknown>; } catch { return reply(origin, { error: "bad_json" }, 400); }
  }
  const url = new URL(request.url);
  const linkTok = str(body.token || url.searchParams.get("t"), 80);

  if (action === "live-link-info") {
    const info = await store.liveLinkInfo(linkTok);
    if (!info.ok) return reply(origin, { error: info.error }, info.error === "ended" ? 410 : 404);
    return reply(origin, info, 200);
  }
  if (action === "live-link-join") {
    const name = str(body.name, 80);
    if (!name) return reply(origin, { error: "need_name" }, 400);
    const r = await store.liveGuestJoin(linkTok, name);
    if (!r.ok) return reply(origin, { error: r.error }, r.error === "ended" ? 410 : 404);
    return reply(origin, r, 200);
  }
  if (action === "live-status") {
    const rid = str(body.id || url.searchParams.get("id") || url.searchParams.get("room"), 40);
    if (!ROOM_RE.test(rid)) return reply(origin, { status: "not_found" }, 200);
    const row = await store.liveRow(rid);
    if (!row) return reply(origin, { status: "not_found" }, 200);
    return reply(origin, { status: String(row.status) === "live" ? "live" : "ended" }, 200);
  }

  const a = await liveActor(request, env, store);
  if (!a) return reply(origin, { error: "unauthorized" }, 401);
  if (a.viewAs) return reply(origin, { error: "read_only" }, 403);
  if (a.role === "parent") return reply(origin, { error: "forbidden" }, 403);

  const id = str(body.id || url.searchParams.get("id"), 40);
  const sfuOn = !!(env.REALTIME_SFU_APP_ID && env.REALTIME_SFU_APP_SECRET);

  if (action === "live-list") {
    const rows = (await store.liveListOpen()) as { id: string; teacher: string; title: string; cls: string; section: string; group_id: string; status: string; created: number }[];
    const rooms = [];
    for (const r of rows) {
      if (!(await store.liveVisible(a, r))) continue;
      rooms.push({
        id: String(r.id),
        title: String(r.title),
        cls: String(r.cls || ""),
        section: String(r.section || ""),
        teacherId: String(r.teacher),
        teacherName: await store.liveTeacherName(String(r.teacher)),
        created: Number(r.created),
        mine: r.teacher === a.id || a.role === "admin",
      });
    }
    const options = canRun(a) ? await store.liveScopeOptions(a) : [];
    const groups = canRun(a) && a.role !== "student" ? ((await store.handle("grp-list", a, {})) as { status: number; body: { items?: { id: string; name: string }[] } }).body?.items || [] : [];
    return reply(origin, { rooms, canStart: canRun(a), sfu: sfuOn, options, groups, perms: liveFlags(a, env) }, 200);
  }

  if (action === "live-history") {
    if (a.guest || a.role === "student" || a.role === "parent") return reply(origin, { error: "forbidden" }, 403);
    const items = await store.liveHistory(a);
    return reply(origin, { items, perms: liveFlags(a, env) }, 200);
  }

  if (action === "live-rec") {
    if (a.guest || a.role === "student" || a.role === "parent") return reply(origin, { error: "forbidden" }, 403);
    const ready = !!env.LIVE_RECS;
    const allowed = canLive(a, "liveRecord");
    const op = str(body.op, 20) || "status";
    if (op === "status" || op === "list") {
      const items = (op === "list" && allowed) ? (await store.liveHistory(a)).filter((x) => x.recKey) : [];
      return reply(origin, { ready, record: allowed, items, perms: liveFlags(a, env) }, 200);
    }
    if (!allowed) return reply(origin, { error: "no_record" }, 403);
    if (!ready || !env.LIVE_RECS) return reply(origin, { error: "rec_disabled" }, 503);
    const recId = str(body.id || id, 40);
    if (!ROOM_RE.test(recId)) return reply(origin, { error: "not_found" }, 404);
    const recRow = await store.liveRow(recId);
    if (!recRow) return reply(origin, { error: "not_found" }, 404);
    if (a.role !== "admin" && String(recRow.teacher) !== a.id) return reply(origin, { error: "forbidden" }, 403);
    const bucket = env.LIVE_RECS;
    if (op === "start") {
      const key = recObjectKey(recId, Number(recRow.created) || Date.now());
      await store.liveRecStart(recId, key);
      return reply(origin, { ok: true, key }, 200);
    }
    if (op === "chunk") {
      const key = str(body.key, 160) || recObjectKey(recId, Number(recRow.created) || Date.now());
      const part = Math.max(0, Math.trunc(Number(body.part) || 0));
      const b64 = str(body.data, 2_000_000);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return reply(origin, { error: "bad_json" }, 400); }
      if (bytes.byteLength > 1_500_000) return reply(origin, { error: "too_large" }, 413);
      const objKey = `${key}.p${String(part).padStart(4, "0")}`;
      await bucket.put(objKey, bytes, { httpMetadata: { contentType: "video/webm" } });
      await store.liveRecBytes(recId, (Number(recRow.rec_bytes) || 0) + bytes.byteLength);
      return reply(origin, { ok: true, key: objKey, bytes: bytes.byteLength }, 200);
    }
    if (op === "stop") {
      return reply(origin, { ok: true, key: String(recRow.rec_key || "") }, 200);
    }
    if (op === "get") {
      const key = str(body.key || recRow.rec_key, 160);
      if (!key || !key.startsWith("live/")) return reply(origin, { error: "not_found" }, 404);
      const obj = await bucket.get(key) || await bucket.get(`${key}.p0000`);
      if (!obj) return reply(origin, { error: "not_found" }, 404);
      return new Response(obj.body, { status: 200, headers: { ...corsHeaders(origin), "Content-Type": obj.httpMetadata?.contentType || "video/webm", "Cache-Control": "private, max-age=60" } });
    }
    return reply(origin, { error: "bad_op" }, 400);
  }

  if (action === "live-sched-list") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    const items = await store.liveSchedList(a);
    const packs = canLive(a, "liveSchedule") ? await store.liveSchedPacks(a) : [];
    return reply(origin, { items, packs, perms: liveFlags(a, env), options: canLive(a, "liveSchedule") ? await store.liveScopeOptions(a) : [], groups: canLive(a, "liveSchedule") && a.role !== "student" ? ((await store.handle("grp-list", a, {})) as { status: number; body: { items?: { id: string; name: string }[] } }).body?.items || [] : [] }, 200);
  }

  if (action === "live-sched-save") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    const r = await store.liveSchedSave(a, {
      id: str(body.id, 40) || undefined,
      title: str(body.title, 80),
      starts: Number(body.starts) || 0,
      duration: Number(body.duration) || 0,
      cls: str(body.cls, 80),
      section: str(body.section, 40),
      groupId: str(body.groupId, 40),
      studentId: str(body.studentId, 40),
      packId: str(body.packId, 40),
    });
    if (!r.ok) return reply(origin, { error: r.error }, r.error === "forbidden" || r.error.startsWith("no_") || r.error === "not_your_class" ? 403 : 400);
    return reply(origin, { id: r.id, item: store.liveSchedPublic((await store.liveSchedRow(r.id)) as Record<string, unknown>, a, true) }, 200);
  }

  if (action === "live-sched-cancel") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    const r = await store.liveSchedCancel(a, str(body.id, 40));
    if (!r.ok) return reply(origin, { error: r.error }, r.error === "forbidden" ? 403 : 400);
    return reply(origin, { ok: true }, 200);
  }

  if (action === "live-sched-link") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    const r = await store.liveSchedSetLink(a, str(body.id, 40), body.off !== true);
    if (!r.ok) return reply(origin, { error: r.error }, r.error === "no_share_link" || r.error === "forbidden" ? 403 : 400);
    return reply(origin, { ok: true, token: r.token || "" }, 200);
  }

  if (action === "live-meet") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    if (a.viewAs) return reply(origin, { error: "read_only" }, 403);
    const r = await store.liveMeet(a, {
      title: str(body.title, 80),
      duration: Number(body.duration) || 0,
      now: body.now === true,
      starts: Number(body.starts) || 0,
    });
    if (!r.ok) return reply(origin, { error: r.error }, r.error === "no_instant" || r.error === "forbidden" ? 403 : 400);
    if (body.now === true && !r.roomId) {
      const roomId = newId();
      const title = r.title || "Quick meeting";
      const stub = roomStub(env, roomId);
      await stub.init({ id: roomId, title, cls: "", section: "", groupId: "", teacherId: a.id, teacherName: a.name, endsAt: r.ends });
      await store.livePut({ id: roomId, teacher: a.id, title, cls: "", section: "", groupId: "", status: "live", created: Date.now(), schedId: r.schedId });
      await store.liveSchedAttachRoom(r.schedId, roomId);
      return reply(origin, { ...r, roomId }, 200);
    }
    return reply(origin, r, 200);
  }

  if (action === "live-sched-start") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    const sch = await store.liveSchedRow(str(body.id, 40));
    if (!sch) return reply(origin, { error: "not_found" }, 404);
    const isMeeting = String(sch.kind || "") === "meeting";
    if (!canRun(a) && !(isMeeting && canLive(a, "liveInstant"))) return reply(origin, { error: "no_permission" }, 403);
    if (a.role !== "admin" && String(sch.teacher) !== a.id) return reply(origin, { error: "forbidden" }, 403);
    if (String(sch.room_id || "")) return reply(origin, { id: String(sch.room_id), existing: true }, 200);
    if (!store.liveSchedCanStart(sch as Record<string, unknown>)) return reply(origin, { error: "not_yet" }, 400);
    const open = ((await store.liveListOpen()) as { id: string; teacher: string }[]).find((r) => r.teacher === a.id);
    if (open) return reply(origin, { id: String(open.id), existing: true }, 200);
    const cls = String(sch.cls || "");
    const section = String(sch.section || "");
    const groupId = String(sch.group_id || "");
    const studentId = String(sch.student_id || "");
    const ok = isMeeting ? { ok: true as const } : (studentId ? { ok: true as const } : await store.liveCanStart(a, cls, section, groupId));
    if (!ok.ok) return reply(origin, { error: ok.error }, 403);
    const roomId = newId();
    const title = String(sch.title || "Live Lesson");
    const stub = roomStub(env, roomId);
    const endsAt = Number(sch.starts) + Number(sch.duration) * 60_000;
    await stub.init({ id: roomId, title, cls, section, groupId, teacherId: a.id, teacherName: a.name, endsAt });
    await store.livePut({ id: roomId, teacher: a.id, title, cls, section, groupId, status: "live", created: Date.now(), studentId, schedId: String(sch.id) });
    await store.liveSchedAttachRoom(String(sch.id), roomId);
    return reply(origin, { id: roomId }, 200);
  }

  if (action === "live-start") {
    if (!canRun(a)) return reply(origin, { error: "no_permission" }, 403);
    const open = ((await store.liveListOpen()) as { id: string; teacher: string }[]).find((r) => r.teacher === a.id);
    if (open) return reply(origin, { id: String(open.id), existing: true }, 200);
    const cls = str(body.cls, 80);
    const section = str(body.section, 40);
    const groupId = str(body.groupId, 40);
    const ok = await store.liveCanStart(a, cls, section, groupId);
    if (!ok.ok) return reply(origin, { error: ok.error }, 403);
    const roomId = newId();
    const title = str(body.title, 80) || "Live Lesson";
    const stub = roomStub(env, roomId);
    const minutes = Math.min(180, Math.max(5, Math.trunc(Number(body.minutes) || 40)));
    await stub.init({ id: roomId, title, cls, section, groupId, teacherId: a.id, teacherName: a.name, endsAt: Date.now() + minutes * 60_000 });
    await store.livePut({ id: roomId, teacher: a.id, title, cls, section, groupId, status: "live", created: Date.now() });
    return reply(origin, { id: roomId }, 200);
  }

  if (!ROOM_RE.test(id)) return reply(origin, { error: "not_found" }, 404);
  const row = await store.liveRow(id);
  if (!row) return reply(origin, { error: "not_found" }, 404);
  if (a.guest) {
    const sch = a.liveSched ? await store.liveSchedRow(a.liveSched) : null;
    if (!sch || String(sch.room_id || "") !== id) return reply(origin, { error: "forbidden" }, 403);
  } else if (!(await store.liveVisible(a, row as never))) return reply(origin, { error: "forbidden" }, 403);
  const stub = roomStub(env, id);

  if (action === "live-get") {
    const room = await stub.snapshot();
    if (!room) return reply(origin, { error: "not_found" }, 404);
    return reply(origin, { room }, 200);
  }

  if (action === "live-join") {
    if (String(row.status) !== "live") return reply(origin, { error: "ended" }, 410);
    const r = await stub.requestJoin({ id: a.id, name: a.name, role: a.role === "admin" || a.id === String(row.teacher) ? "teacher" : "student" });
    if (r.status === "in" && a.role === "student" && !a.guest) await store.liveAttSync(id, [a.id]);
    return reply(origin, { ...r, selfId: a.id }, r.status === "full" ? 409 : r.status === "ended" ? 410 : 200);
  }

  if (action === "live-admit" || action === "live-deny") {
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const userId = str(body.userId, 40);
    if (!userId) return reply(origin, { error: "bad_request" }, 400);
    const r = action === "live-admit" ? await stub.admit(String(row.teacher), userId) : await stub.deny(String(row.teacher), userId);
    if (r.ok && action === "live-admit") {
      const snap = await stub.snapshot();
      const ids = snap ? snap.members.filter((m) => m.role === "student").map((m) => m.id) : (userId === "all" ? [] : [userId]);
      if (ids.length) await store.liveAttSync(id, ids);
    }
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-remove") {
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const userId = str(body.userId, 40);
    if (!userId) return reply(origin, { error: "bad_request" }, 400);
    const r = await stub.remove(a.role === "admin" ? "admin" : String(row.teacher), userId);
    if (r.ok) {
      const snap = await stub.snapshot();
      if (snap) await store.liveAttSync(id, snap.members.filter((m) => m.role === "student").map((m) => m.id));
    }
    return reply(origin, r, r.ok ? 200 : r.error === "not_found" ? 404 : 403);
  }

  if (action === "live-leave") {
    await stub.leave(a.id);
    return reply(origin, { ok: true }, 200);
  }

  if (action === "live-end") {
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const snap = await stub.snapshot();
    const r = await stub.endClass(a.role === "admin" ? "admin" : a.id);
    if (r.ok && snap) await store.liveAttSync(id, snap.members.filter((m) => m.role === "student").map((m) => m.id));
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-perm") {
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const teacherId = String(row.teacher);
    if (typeof body.share === "boolean" && !canControlStudentMedia(a, teacherId, "screenShare")) return reply(origin, { error: "no_screen_share" }, 403);
    if ((typeof body.cam === "boolean" || typeof body.mic === "boolean") && !canControlStudentMedia(a, teacherId, "camMic")) return reply(origin, { error: "no_cam_mic" }, 403);
    const floor = body.floor === "presenter" || body.floor === "attendee" ? body.floor : undefined;
    if (floor && !canSetMemberFloor(a.id, a.role, teacherId, str(body.userId, 40))) return reply(origin, { error: "forbidden" }, 403);
    const r = await stub.setPerm(a.role === "admin" ? "admin" : teacherId, str(body.userId, 40), typeof body.cam === "boolean" ? body.cam : undefined, typeof body.mic === "boolean" ? body.mic : undefined, typeof body.share === "boolean" ? body.share : undefined, floor);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-ask") {
    const target = str(body.userId, 40) || a.id;
    if (target !== a.id) {
      if (!canControlStudentMedia(a, String(row.teacher), "camMic")) return reply(origin, { error: "no_cam_mic" }, 403);
    } else if (a.role === "teacher" && a.id === String(row.teacher)) {
      return reply(origin, { error: "forbidden" }, 403);
    }
    const r = await stub.askMedia(target, body.cam !== false, body.mic !== false, body.on !== false);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-raise") {
    const r = await stub.setHand(a.id, !!body.on);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-chat") {
    const r = await stub.addChat(a.id, str(body.text, MAX_TEXT));
    return reply(origin, r, r.ok ? 200 : 400);
  }

  if (action === "live-pub") {
    const tracks = Array.isArray(body.tracks) ? body.tracks.map((x) => str(x, 20)) : [];
    const r = await stub.setPub(a.id, str(body.sessionId, 80), tracks);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-unpub") {
    const tracks = Array.isArray(body.tracks) ? body.tracks.map((x) => str(x, 20)) : [];
    await stub.dropPub(a.id, tracks);
    return reply(origin, { ok: true }, 200);
  }

  if (action === "live-duration") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const now = Date.now();
    let endsAt = Number(body.endsAt);
    if (typeof body.addMin === "number") {
      const snap = await stub.snapshot();
      endsAt = Math.max(now, snap?.endsAt || now) + Math.trunc(body.addMin) * 60_000;
    }
    const r = await stub.setEndsAt(a.role === "admin" ? "admin" : a.id, endsAt);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-view") {
    if (a.guest) return reply(origin, { error: "forbidden" }, 403);
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const r = await stub.setView(a.role === "admin" ? "admin" : a.id, str(body.mode, 20), typeof body.follow === "boolean" ? body.follow : undefined);
    return reply(origin, r, r.ok ? 200 : r.error === "bad_view" ? 400 : 403);
  }

  if (action === "live-pack") {
    try {
      const room = await stub.snapshot();
      if (!room || room.status !== "live") return reply(origin, { error: "ended" }, 410);
      const inRoom = a.role === "admin" || room.teacherId === a.id || room.members.some((m) => m.id === a.id);
      if (!inRoom) return reply(origin, { error: "forbidden" }, 403);
      const packId = str(body.packId || room.present?.packId, 40);
      if (!room.present?.packId || packId !== room.present.packId) return reply(origin, { error: "not_presenting" }, 404);
      const pack = await store.livePresentedPack(packId);
      if (!pack) return reply(origin, { error: "pack_not_found" }, 404);
      return reply(origin, { pack }, 200);
    } catch {
      return reply(origin, { error: "pack_load_failed" }, 500);
    }
  }

  const inLiveRoom = async () => {
    const room = await stub.snapshot();
    if (!room || room.status !== "live") return null;
    if (a.role === "admin" || room.teacherId === a.id || room.members.some((m) => m.id === a.id)) return room;
    return null;
  };

  if (action === "live-ice") {
    const room = await inLiveRoom();
    if (!room) return reply(origin, { error: "forbidden" }, 403);
    return reply(origin, { iceServers: await iceServers(env) }, 200);
  }

  if (action === "live-debug") {
    const room = await inLiveRoom();
    if (!room) return reply(origin, { error: "forbidden" }, 403);
    const isHost = a.role === "admin" || a.id === room.teacherId;
    if (str(body.op, 8) === "get") {
      return reply(origin, { logs: await stub.getDebug(a.id, isHost) }, 200);
    }
    const blob = sanitizeLiveDebug(body, a.id);
    if (!blob) return reply(origin, { error: "bad_request" }, 400);
    await stub.putDebug(blob);
    return reply(origin, { ok: true }, 200);
  }

  if (action === "live-sfu") {
    const room = await inLiveRoom();
    if (!room) return reply(origin, { error: "forbidden" }, 403);
    const op = str(body.op, 20);
    const sessionId = str(body.sessionId, 80);
    if (op === "session-new") {
      const r = await sfuCall(env, "POST", "/sessions/new");
      return reply(origin, r.json, r.status);
    }
    if (!sessionId) return reply(origin, { error: "bad_session" }, 400);
    if (op === "tracks-new") {
      const tracks = Array.isArray(body.tracks) ? body.tracks as Record<string, unknown>[] : [];
      const member = room.members.find((m) => m.id === a.id);
      const isHost = a.role === "admin" || a.id === room.teacherId;
      for (const tr of tracks) {
        if (String(tr.location) === "remote") {
          const pubSid = str(tr.sessionId, 80);
          if (!room.pubs.some((p) => p.sessionId === pubSid)) return reply(origin, { error: "forbidden" }, 403);
        }
        if (String(tr.location) === "local" && !isHost) {
          const name = str(tr.trackName, 20);
          const { denied } = allowedPubTracks(member, name ? [name] : []);
          if (denied.length) return reply(origin, { error: "not_allowed" }, 403);
        }
      }
      const r = await sfuCall(env, "POST", `/sessions/${sessionId}/tracks/new`, {
        sessionDescription: body.sessionDescription,
        tracks,
      });
      return reply(origin, r.json, r.status);
    }
    if (op === "tracks-update") {
      const r = await sfuCall(env, "PUT", `/sessions/${sessionId}/tracks/update`, {
        sessionDescription: body.sessionDescription,
        tracks: body.tracks,
      });
      return reply(origin, r.json, r.status);
    }
    if (op === "renegotiate") {
      const r = await sfuCall(env, "PUT", `/sessions/${sessionId}/renegotiate`, { sessionDescription: body.sessionDescription });
      return reply(origin, r.json, r.status);
    }
    if (op === "tracks-close") {
      const r = await sfuCall(env, "PUT", `/sessions/${sessionId}/tracks/close`, {
        tracks: body.tracks,
        sessionDescription: body.sessionDescription,
        force: body.force === true,
      });
      return reply(origin, r.json, r.status);
    }
    return reply(origin, { error: "bad_op" }, 400);
  }

  if (action === "live-present") {
    const op = str(body.op, 20);
    const teacherId = String(row.teacher);
    const isHost = a.id === teacherId || a.role === "admin";
    const snapForFloor = await stub.snapshot();
    const floor = memberFloor(snapForFloor?.members.find((m) => m.id === a.id), teacherId);
    const canPresent = canPresentInRoom(a, teacherId) || floor === "presenter";
    if (op === "answer") {
      const r = await stub.addAnswer(a.id, a.name, Number(body.slide) || 0, str(body.text, 1000));
      return reply(origin, r, r.ok ? 200 : 400);
    }
    if (op === "stroke") {
      const stroke = (body.stroke || {}) as { c?: string; w?: number; d?: number[]; by?: string };
      const r = await stub.addStroke(a.id, { c: str(stroke.c, 20), w: Number(stroke.w) || 3, d: Array.isArray(stroke.d) ? stroke.d.map((n) => Number(n) || 0) : [], by: a.id });
      return reply(origin, r, r.ok ? 200 : 403);
    }
    if (!canPresent) return reply(origin, { error: "no_present" }, 403);
    const host = a.role === "admin" ? "admin" : (isHost || floor === "presenter" ? (isHost ? teacherId : a.id) : teacherId);
    if (op === "stop") {
      const r = await stub.setPresent(host, { closeAll: true });
      return reply(origin, r, r.ok ? 200 : 403);
    }
    if (op === "board") {
      const r = await stub.setPresent(host, { tool: "board" }, { packId: "", packTitle: "Whiteboard", kind: "board" });
      return reply(origin, r, r.ok ? 200 : r.error === "ended" ? 410 : 403);
    }
    if (op === "close") {
      const closeId = str(body.itemId || body.closeId, 80);
      if (!closeId) return reply(origin, { error: "bad_item" }, 400);
      const r = await stub.setPresent(host, { closeId });
      return reply(origin, r, r.ok ? 200 : r.error === "ended" ? 410 : 403);
    }
    if (op === "activate") {
      const activeId = str(body.itemId || body.activeId, 80);
      if (!activeId) return reply(origin, { error: "bad_item" }, 400);
      const r = await stub.setPresent(host, { activeId });
      return reply(origin, r, r.ok ? 200 : r.error === "ended" ? 410 : 403);
    }
    if (op === "start") {
      const kind = str(body.kind, 20);
      const srcRaw = str(body.src || body.url, 200);
      if (kind === "youtube" || (!str(body.packId, 40) && srcRaw)) {
        const src = youtubeVideoId(srcRaw);
        if (!src) return reply(origin, { error: "bad_youtube" }, 400);
        const r = await stub.setPresent(host, { follow: true }, { packId: "", packTitle: str(body.packTitle, 80) || "YouTube", kind: "youtube", src });
        return reply(origin, r, r.ok ? 200 : r.error === "ended" ? 410 : 403);
      }
      if (kind === "upload") return reply(origin, { error: "upload_unavailable" }, 400);
      const packId = str(body.packId, 40);
      if (!packId) return reply(origin, { error: "pack_not_found" }, 400);
      const packTitle = str(body.packTitle, 80);
      try {
        const pack = await store.livePresentedPack(packId);
        if (!pack) return reply(origin, { error: "pack_not_found" }, 404);
        const slide = typeof body.slide === "number" ? body.slide : 0;
        const r = await stub.setPresent(host, { slide, follow: true }, { packId, packTitle: packTitle || pack.title, kind: kind || "lesson", slide });
        return reply(origin, r, r.ok ? 200 : r.error === "ended" ? 410 : 403);
      } catch {
        return reply(origin, { error: "present_failed" }, 500);
      }
    }
    const patch: Record<string, unknown> = {};
    if (typeof body.itemId === "string" || typeof body.activeId === "string") patch.activeId = str(body.itemId || body.activeId, 80);
    if (typeof body.slide === "number") patch.slide = body.slide;
    if (typeof body.follow === "boolean") patch.follow = body.follow;
    if ("timerEnd" in body) patch.timerEnd = body.timerEnd == null ? null : Number(body.timerEnd);
    if (typeof body.penId === "string") patch.penId = body.penId;
    if (typeof body.tool === "string") patch.tool = body.tool;
    if (typeof body.wheelAngle === "number") patch.wheelAngle = body.wheelAngle;
    if (typeof body.wheelSpinTo === "number") patch.wheelSpinTo = body.wheelSpinTo;
    if (typeof body.wheelAt === "number") patch.wheelAt = body.wheelAt;
    if (typeof body.winnerId === "string") patch.winnerId = body.winnerId;
    if (typeof body.winnerName === "string") patch.winnerName = body.winnerName;
    if (typeof body.randText === "string") patch.randText = body.randText;
    if (Array.isArray(body.strokes)) patch.strokes = body.strokes;
    if (Array.isArray(body.shapes)) patch.shapes = body.shapes;
    const r = await stub.setPresent(host, patch as never);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  return reply(origin, { error: "not_found" }, 404);
}

async function handleLiveWs(request: Request, env: LiveEnv): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
  const url = new URL(request.url);
  const id = str(url.searchParams.get("room"), 40);
  const raw = url.searchParams.get("t") || "";
  if (!ROOM_RE.test(id) || !raw) return new Response("forbidden", { status: 403 });
  const store = env.LMS.get(env.LMS.idFromName("main"));
  const a = await liveActor(new Request(request.url, { headers: { Authorization: raw.startsWith("Bearer ") ? raw : `Bearer ${raw}` } }), env, store, raw);
  if (!a || a.viewAs || a.role === "parent") return new Response("forbidden", { status: 403 });
  const row = await store.liveRow(id);
  if (!row || String(row.status) !== "live") return new Response("ended", { status: 410 });
  if (a.guest) {
    const sch = a.liveSched ? await store.liveSchedRow(a.liveSched) : null;
    if (!sch || String(sch.room_id || "") !== id) return new Response("forbidden", { status: 403 });
  } else if (!(await store.liveVisible(a, row as never))) return new Response("forbidden", { status: 403 });
  const stub = roomStub(env, id);
  const snap = await stub.snapshot();
  const allowed = snap && (snap.teacherId === a.id || snap.members.some((m) => m.id === a.id) || snap.waiting.some((w) => w.id === a.id));
  if (!allowed) return new Response("forbidden", { status: 403 });
  const headers = new Headers(request.headers);
  headers.set("X-Live-User", a.id);
  headers.set("X-Live-Name", a.name);
  return stub.fetch(new Request("https://live/ws", { headers }));
}
