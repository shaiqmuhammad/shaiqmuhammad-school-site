/**
 * Part 1 — Live Lesson classroom (Cloudflare Realtime SFU + one Durable Object per room).
 *
 * Signalling and membership live in the DO (hibernating WebSockets). Media flows
 * browser ↔ Cloudflare Realtime SFU; the App Secret never leaves this worker.
 * No recording, no emails, no student notifications, no reward-balance changes.
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply } from "./admin";
import { lmsActor, type Actor, type LmsEnv } from "./lms";

export interface LiveEnv extends LmsEnv {
  LIVE: DurableObjectNamespace<LiveRoom>;
  REALTIME_SFU_APP_ID?: string;
  REALTIME_SFU_APP_SECRET?: string;
  REALTIME_TURN_TOKEN_ID?: string;
  REALTIME_TURN_API_TOKEN?: string;
}

const SFU = "https://rtc.live.cloudflare.com/v1";
const ROOM_RE = /^lv_[a-z0-9]{10,24}$/;
const MAX_MEMBERS = 40;
const MAX_WAITING = 40;
const MAX_CHAT = 80;
const MAX_TEXT = 400;
const ROOM_MS = 4 * 60 * 60 * 1000;

type Role = "teacher" | "student";
export type LivePub = { userId: string; sessionId: string; tracks: string[] };
export type LiveMember = { id: string; name: string; role: Role; camAllowed: boolean; micAllowed: boolean; hand: boolean; present: boolean };
export type LiveWait = { id: string; name: string; at: number };
export type LiveChat = { id: string; from: string; name: string; text: string; at: number };
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
  sfu: boolean;
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

function publicSnap(s: State, sfu: boolean): LiveSnap {
  return { ...s, waiting: s.waiting.map((w) => ({ id: w.id, name: w.name, at: w.at })), sfu };
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
    this.broadcast({ t: "room", room: publicSnap(this.state, this.sfuReady()) });
  }
  private sfuReady() {
    return !!(this.env.REALTIME_SFU_APP_ID && this.env.REALTIME_SFU_APP_SECRET);
  }
  private member(id: string) {
    return this.state?.members.find((m) => m.id === id);
  }

  async init(meta: { id: string; title: string; cls: string; section: string; groupId: string; teacherId: string; teacherName: string }) {
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
      waiting: [],
      members: [{ id: meta.teacherId, name: meta.teacherName || "Teacher", role: "teacher", camAllowed: true, micAllowed: true, hand: false, present: true }],
      chat: [],
      pubs: [],
    };
    await this.save();
    await this.ctx.storage.setAlarm(now + ROOM_MS);
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
      if (m) m.present = true;
      await this.save();
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
    for (const id of ids) {
      const w = this.state.waiting.find((x) => x.id === id);
      if (!w) continue;
      if (this.state.members.length >= MAX_MEMBERS) break;
      this.state.waiting = this.state.waiting.filter((x) => x.id !== id);
      this.state.members.push({ id: w.id, name: w.name, role: "student", camAllowed: false, micAllowed: false, hand: false, present: true });
    }
    await this.save();
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

  async leave(userId: string): Promise<{ ok: boolean }> {
    await this.load();
    if (!this.state) return { ok: true };
    this.state.waiting = this.state.waiting.filter((w) => w.id !== userId);
    const m = this.member(userId);
    if (m) m.present = false;
    if (userId !== this.state.teacherId) this.state.members = this.state.members.filter((x) => x.id !== userId);
    this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    await this.save();
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

  async setPerm(hostId: string, userId: string, cam?: boolean, mic?: boolean): Promise<{ ok: boolean; error?: string }> {
    await this.load();
    if (!this.state || this.state.status !== "live") return { ok: false, error: "ended" };
    if (hostId !== this.state.teacherId) return { ok: false, error: "forbidden" };
    const m = this.member(userId);
    if (!m || m.role === "teacher") return { ok: false, error: "not_found" };
    if (typeof cam === "boolean") m.camAllowed = cam;
    if (typeof mic === "boolean") m.micAllowed = mic;
    if (!m.camAllowed || !m.micAllowed) {
      const pub = this.state.pubs.find((p) => p.userId === userId);
      if (pub) {
        if (!m.camAllowed) pub.tracks = pub.tracks.filter((t) => t !== "camera");
        if (!m.micAllowed) pub.tracks = pub.tracks.filter((t) => t !== "mic");
        if (!pub.tracks.length) this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
      }
    }
    await this.save();
    this.broadcast({ t: "perm", userId, camAllowed: m.camAllowed, micAllowed: m.micAllowed });
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
    const allow = new Set<string>();
    if (m.camAllowed) allow.add("camera");
    if (m.micAllowed) allow.add("mic");
    if (m.role === "teacher") allow.add("screen");
    const next = tracks.map((t) => str(t, 20)).filter((t) => allow.has(t));
    const sid = str(sessionId, 80);
    if (!sid) return { ok: false, error: "bad_session" };
    this.state.pubs = this.state.pubs.filter((p) => p.userId !== userId);
    if (next.length) this.state.pubs.push({ userId, sessionId: sid, tracks: next });
    await this.save();
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
    this.roomMsg();
    return { ok: true };
  }

  async knownSession(sessionId: string, userId: string): Promise<boolean> {
    await this.load();
    if (!this.state) return false;
    return this.state.pubs.some((p) => p.sessionId === sessionId) || this.state.members.some((m) => m.id === userId);
  }

  async alarm() {
    await this.load();
    if (this.state && this.state.status === "live") await this.endClass(this.state.teacherId);
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
    if (member) member.present = true;
    else if (isHost) {
      this.state.members.push({ id: uid, name: name || "Teacher", role: "teacher", camAllowed: true, micAllowed: true, hand: false, present: true });
    }
    await this.save();
    this.send(pair[1], { t: "room", room: publicSnap(this.state, this.sfuReady()) });
    this.roomMsg();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.load();
    if (!this.state || this.state.status !== "live") return;
    let data: { t?: string; text?: string; on?: boolean } = {};
    try { data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)) as typeof data; } catch { return; }
    const uid = this.ctx.getTags(ws)[0] || "";
    if (data.t === "ping") { this.send(ws, { t: "pong" }); return; }
    if (data.t === "chat") await this.addChat(uid, String(data.text || ""));
    if (data.t === "raise") await this.setHand(uid, !!data.on);
  }

  async webSocketClose(ws: WebSocket) {
    await this.load();
    const uid = this.ctx.getTags(ws)[0] || "";
    const m = this.member(uid);
    if (m) {
      const still = this.ctx.getWebSockets(uid).filter((x) => x !== ws).length;
      if (!still) m.present = false;
      await this.save();
      this.roomMsg();
    }
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
  return { status: r.status, json };
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
      return j.iceServers.filter((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return !urls.some((u) => /:53(\?|$)/.test(String(u)));
      });
    }
  } catch { /* STUN fallback */ }
  return iceStun();
}

export async function handleLive(request: Request, env: LiveEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (action === "live-ws") return handleLiveWs(request, env);

  const store = env.LMS.get(env.LMS.idFromName("main"));
  const a = await lmsActor(request, env, store);
  if (!a) return reply(origin, { error: "unauthorized" }, 401);
  if (a.viewAs) return reply(origin, { error: "read_only" }, 403);
  if (a.role === "parent") return reply(origin, { error: "forbidden" }, 403);

  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 60_000) return reply(origin, { error: "too_large" }, 413);
    try { body = JSON.parse(text || "{}") as Record<string, unknown>; } catch { return reply(origin, { error: "bad_json" }, 400); }
  }
  const id = str(body.id || new URL(request.url).searchParams.get("id"), 40);
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
    return reply(origin, { rooms, canStart: canRun(a), sfu: sfuOn, options, groups }, 200);
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
    await stub.init({ id: roomId, title, cls, section, groupId, teacherId: a.id, teacherName: a.name });
    await store.livePut({ id: roomId, teacher: a.id, title, cls, section, groupId, status: "live", created: Date.now() });
    return reply(origin, { id: roomId }, 200);
  }

  if (!ROOM_RE.test(id)) return reply(origin, { error: "not_found" }, 404);
  const row = await store.liveRow(id);
  if (!row) return reply(origin, { error: "not_found" }, 404);
  if (!(await store.liveVisible(a, row as never))) return reply(origin, { error: "forbidden" }, 403);
  const stub = roomStub(env, id);

  if (action === "live-get") {
    const room = await stub.snapshot();
    if (!room) return reply(origin, { error: "not_found" }, 404);
    return reply(origin, { room }, 200);
  }

  if (action === "live-join") {
    if (String(row.status) !== "live") return reply(origin, { error: "ended" }, 410);
    const r = await stub.requestJoin({ id: a.id, name: a.name, role: a.role === "admin" || a.id === String(row.teacher) ? "teacher" : "student" });
    return reply(origin, r, r.status === "full" ? 409 : r.status === "ended" ? 410 : 200);
  }

  if (action === "live-admit" || action === "live-deny") {
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const userId = str(body.userId, 40);
    if (!userId) return reply(origin, { error: "bad_request" }, 400);
    const r = action === "live-admit" ? await stub.admit(String(row.teacher), userId) : await stub.deny(String(row.teacher), userId);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-leave") {
    await stub.leave(a.id);
    return reply(origin, { ok: true }, 200);
  }

  if (action === "live-end") {
    if (a.id !== String(row.teacher) && a.role !== "admin") return reply(origin, { error: "forbidden" }, 403);
    const r = await stub.endClass(a.role === "admin" ? "admin" : a.id);
    return reply(origin, r, r.ok ? 200 : 403);
  }

  if (action === "live-perm") {
    const r = await stub.setPerm(a.id, str(body.userId, 40), typeof body.cam === "boolean" ? body.cam : undefined, typeof body.mic === "boolean" ? body.mic : undefined);
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

  if (action === "live-ice") {
    const room = await stub.snapshot();
    if (!room || room.status !== "live" || !room.members.some((m) => m.id === a.id)) return reply(origin, { error: "forbidden" }, 403);
    return reply(origin, { iceServers: await iceServers(env) }, 200);
  }

  if (action === "live-sfu") {
    const room = await stub.snapshot();
    if (!room || room.status !== "live" || !room.members.some((m) => m.id === a.id)) return reply(origin, { error: "forbidden" }, 403);
    const op = str(body.op, 20);
    const sessionId = str(body.sessionId, 80);
    if (op === "session-new") {
      const r = await sfuCall(env, "POST", "/sessions/new");
      return reply(origin, r.json, r.status);
    }
    if (!sessionId) return reply(origin, { error: "bad_session" }, 400);
    if (op === "tracks-new") {
      const tracks = Array.isArray(body.tracks) ? body.tracks as Record<string, unknown>[] : [];
      for (const tr of tracks) {
        if (String(tr.location) === "remote") {
          const pubSid = str(tr.sessionId, 80);
          if (!room.pubs.some((p) => p.sessionId === pubSid)) return reply(origin, { error: "forbidden" }, 403);
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

  return reply(origin, { error: "not_found" }, 404);
}

async function handleLiveWs(request: Request, env: LiveEnv): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
  const url = new URL(request.url);
  const id = str(url.searchParams.get("room"), 40);
  const raw = url.searchParams.get("t") || "";
  if (!ROOM_RE.test(id) || !raw) return new Response("forbidden", { status: 403 });
  const store = env.LMS.get(env.LMS.idFromName("main"));
  const a = await lmsActor(new Request(request.url, { headers: { Authorization: raw.startsWith("Bearer ") ? raw : `Bearer ${raw}` } }), env, store);
  if (!a || a.viewAs || a.role === "parent") return new Response("forbidden", { status: 403 });
  const row = await store.liveRow(id);
  if (!row || String(row.status) !== "live") return new Response("ended", { status: 410 });
  if (!(await store.liveVisible(a, row as never))) return new Response("forbidden", { status: 403 });
  const stub = roomStub(env, id);
  const snap = await stub.snapshot();
  const allowed = snap && (snap.teacherId === a.id || snap.members.some((m) => m.id === a.id) || snap.waiting.some((w) => w.id === a.id));
  if (!allowed) return new Response("forbidden", { status: 403 });
  const headers = new Headers(request.headers);
  headers.set("X-Live-User", a.id);
  headers.set("X-Live-Name", a.name);
  return stub.fetch(new Request("https://live/ws", { headers }));
}
