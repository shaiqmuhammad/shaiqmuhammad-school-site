/**
 * Classroom activities (Shared Wall, Word Cloud, Poll, Survey, Think/Pair/Share, Vote).
 *
 * One Durable Object per activity, named by its 5-character join code (assessment codes have 6),
 * so /join can tell them apart. Students join with code + name; the teacher's screen holds a hostKey.
 *
 *   POST /api/activity/create          (admin Bearer) {type, title, prompt?, settings?} -> {code, hostKey, ...info}
 *   GET  /api/activity/:code           public info
 *   POST /api/activity/:code/join      {name, deviceId?} -> {pid, token, name}
 *   GET  /api/activity/:code/state     ?pid=&token= | ?hostKey=  [&since=rev] -> full state (or {same:true})
 *   POST /api/activity/:code/post      {pid,token | hostKey, text?, link?, youtube?, image? (data:image/... <=200KB)}
 *   POST /api/activity/:code/respond   {pid,token, data}  (word cloud words / poll / vote / survey answers)
 *   POST /api/activity/:code/like      {pid,token | hostKey, id}  (one like per person per post; toggles)
 *   POST /api/activity/:code/comment   {hostKey, id, text}
 *   POST /api/activity/:code/moderate  {hostKey, id, action: approve|hide|delete|pin|unpin|highlight|unhighlight|color, color?}
 *   POST /api/activity/:code/settings  {hostKey, ...partial settings}
 *   POST /api/activity/:code/remove    {hostKey, pid, deleteItems?}
 *   POST /api/activity/:code/end       {hostKey}
 *   GET  /api/activity/:code/img?id=   picture bytes
 *
 * Limits: 200 participants, 600 items, 60 pictures (200 KB each), text 1000 chars, per-person rate limits,
 * everything is deleted automatically 7 days after creation.
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply, verifyToken, type AdminEnv } from "./admin";
import { teacherWithPerm, type LmsEnv } from "./lms";

export interface ActivityEnv extends AdminEnv {
  ACTIVITIES: DurableObjectNamespace<ClassActivity>;
}

export const ACTIVITY_TYPES = ["wall", "wordcloud", "poll", "survey", "tps", "vote"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_PARTS = 200;
const MAX_ITEMS = 600;
const MAX_IMAGES = 60;
const MAX_IMAGE_BYTES = 200 * 1024;
const MAX_TEXT = 1000;
const MAX_BODY = 400_000;
const RATE: Record<string, [number, number]> = { post: [8, 60_000], respond: [20, 60_000], like: [60, 60_000], join: [5, 60_000] };

type Reply = { status: number; body: unknown };
type Json = Record<string, unknown>;

export type Settings = {
  /** Wall: "live" shows posts at once; "approve" waits for the teacher. */
  moderation: "live" | "approve";
  hideNames: boolean;
  /** Students may like others' posts. */
  likes: boolean;
  /** Students may add pictures / links / YouTube (wall). */
  allowImages: boolean;
  allowLinks: boolean;
  /** Optional countdown end (ms) and its length for display. */
  timerEnd: number | null;
  /** Posting closed (students can still view). */
  locked: boolean;
  /** Type-specific options (poll/vote options, survey questions, TPS stages …). */
  options: Json;
};

const DEFAULT_SETTINGS: Settings = {
  moderation: "live",
  hideNames: false,
  likes: true,
  allowImages: true,
  allowLinks: true,
  timerEnd: null,
  locked: false,
  options: {},
};

type Meta = {
  code: string;
  type: ActivityType;
  title: string;
  prompt: string;
  hostKey: string;
  createdAt: number;
  expiresAt: number;
  endedAt: number | null;
  settings: Settings;
};

const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const rand = (n: number, alphabet = "abcdefghijklmnopqrstuvwxyz0123456789") => {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
};
const COLORS = ["", "yellow", "teal", "rose", "sky", "violet", "lime"];

function cleanSettings(raw: unknown, base: Settings): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const s: Settings = { ...base };
  if (r.moderation === "live" || r.moderation === "approve") s.moderation = r.moderation;
  for (const k of ["hideNames", "likes", "allowImages", "allowLinks", "locked"] as const) if (typeof r[k] === "boolean") s[k] = r[k] as boolean;
  if (r.timerEnd === null || typeof r.timerEnd === "number") s.timerEnd = r.timerEnd === null ? null : Math.min(Number(r.timerEnd), Date.now() + 6 * 3600_000);
  if (r.options && typeof r.options === "object") {
    const o = JSON.stringify(r.options);
    if (o.length <= 30_000) s.options = r.options as Json;
  }
  return s;
}

function youtubeId(raw: string): string {
  const m = raw.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) || raw.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : "";
}

function cleanLink(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : "";
  } catch {
    return "";
  }
}

/** A tiny profanity guard for word clouds and posts (English + transliterated basics). */
const BAD = /\b(f+u+c+k+\w*|s+h+i+t+\w*|b+i+t+c+h+\w*|a+s+s+h+o+l+e+\w*|c+u+n+t+\w*|d+i+c+k+\w*|p+u+s+s+y+\w*|w+h+o+r+e+\w*|s+l+u+t+\w*|n+i+g+g+\w*|bastard\w*|wank\w*|twat\w*|kus\w*|sharmoot\w*)\b/i;
export const isProfane = (s: string) => BAD.test(s);

export class ClassActivity extends DurableObject<ActivityEnv> {
  private sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: ActivityEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, token TEXT, name TEXT, device TEXT, joined INTEGER, removed INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, pid TEXT, kind TEXT, data TEXT, status TEXT, created INTEGER, pinned INTEGER DEFAULT 0, color TEXT DEFAULT '', highlight INTEGER DEFAULT 0, img TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS likes (item TEXT, pid TEXT, PRIMARY KEY (item, pid))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, item TEXT, text TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS imgs (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB, size INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rl (who TEXT, kind TEXT, t INTEGER)`);
  }

  private meta(): Meta | null {
    const row = this.sql.exec(`SELECT v FROM meta WHERE k='meta'`).toArray()[0];
    return row ? (JSON.parse(String(row.v)) as Meta) : null;
  }
  private saveMeta(m: Meta) {
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('meta', ?)`, JSON.stringify(m));
    this.bump();
  }
  private rev(): number {
    const row = this.sql.exec(`SELECT v FROM meta WHERE k='rev'`).toArray()[0];
    return row ? Number(row.v) : 0;
  }
  private bump() {
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('rev', ?)`, String(this.rev() + 1));
  }
  private limited(who: string, kind: string): boolean {
    const [max, win] = RATE[kind] || [30, 60_000];
    const now = Date.now();
    this.sql.exec(`DELETE FROM rl WHERE t < ?`, now - 120_000);
    const n = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM rl WHERE who=? AND kind=? AND t>?`, who, kind, now - win).one().n);
    if (n >= max) return true;
    this.sql.exec(`INSERT INTO rl (who, kind, t) VALUES (?, ?, ?)`, who, kind, now);
    return false;
  }

  async alarm() {
    const m = this.meta();
    if (!m || Date.now() >= m.expiresAt) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(m.expiresAt);
  }

  /** Returns the image bytes (no JSON) for /img. */
  async image(id: string): Promise<{ mime: string; bytes: ArrayBuffer } | null> {
    const row = this.sql.exec(`SELECT mime, bytes FROM imgs WHERE id=?`, id).toArray()[0];
    if (!row) return null;
    return { mime: String(row.mime), bytes: row.bytes as ArrayBuffer };
  }

  async handle(action: string, method: string, input: Json): Promise<Reply> {
    if (action === "init") {
      if (this.meta()) return { status: 409, body: { error: "exists" } };
      const now = Date.now();
      const m: Meta = {
        code: String(input.code),
        type: input.type as ActivityType,
        title: str(input.title, 120) || "Class activity",
        prompt: str(input.prompt, 600),
        hostKey: rand(24),
        createdAt: now,
        expiresAt: now + TTL_MS,
        endedAt: null,
        settings: cleanSettings(input.settings, DEFAULT_SETTINGS),
      };
      this.saveMeta(m);
      await this.ctx.storage.setAlarm(m.expiresAt);
      return { status: 200, body: { hostKey: m.hostKey, ...this.info(m) } };
    }
    const m = this.meta();
    if (!m || Date.now() >= m.expiresAt) return { status: 404, body: { error: "not_found" } };
    const isHost = typeof input.hostKey === "string" && input.hostKey === m.hostKey;
    const hostOnly = () => (isHost ? null : { status: 403, body: { error: "host_only" } });
    const who = (): { id: string; name: string } | null => {
      if (isHost) return { id: "host", name: "Teacher" };
      const row = this.sql.exec(`SELECT id, name, removed FROM parts WHERE id=? AND token=?`, String(input.pid ?? ""), String(input.token ?? "")).toArray()[0];
      if (!row || row.removed) return null;
      return { id: String(row.id), name: String(row.name) };
    };
    const open = () => !m.endedAt && !m.settings.locked && !(m.settings.timerEnd && Date.now() > m.settings.timerEnd);

    switch (action) {
      case "info":
        return { status: 200, body: this.info(m) };

      case "join": {
        if (method !== "POST") return { status: 405, body: { error: "method" } };
        if (m.endedAt) return { status: 410, body: { error: "ended" } };
        const name = str(input.name, 40);
        if (!name) return { status: 400, body: { error: "name" } };
        const device = str(input.deviceId, 64);
        if (device) {
          const blocked = this.sql.exec(`SELECT id FROM parts WHERE device=? AND removed IS NOT NULL`, device).toArray()[0];
          if (blocked) return { status: 403, body: { error: "removed" } };
          if (this.limited(`d:${device}`, "join")) return { status: 429, body: { error: "slow_down" } };
        }
        const count = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM parts WHERE removed IS NULL`).one().n);
        if (count >= MAX_PARTS) return { status: 409, body: { error: "full" } };
        const id = rand(10);
        const token = rand(24);
        this.sql.exec(`INSERT INTO parts (id, token, name, device, joined, removed) VALUES (?, ?, ?, ?, ?, NULL)`, id, token, name, device, Date.now());
        this.bump();
        return { status: 200, body: { pid: id, token, name, ...this.info(m) } };
      }

      case "state": {
        const me = who();
        if (!me) {
          if (isHost) return { status: 403, body: { error: "host_only" } };
          const known = this.sql.exec(`SELECT removed FROM parts WHERE id=? AND token=?`, String(input.pid ?? ""), String(input.token ?? "")).toArray()[0];
          return { status: 403, body: { error: known ? "removed" : "unauthorized" } };
        }
        const rev = this.rev();
        if (Number(input.since) === rev) return { status: 200, body: { same: true, rev, now: Date.now() } };
        return { status: 200, body: this.state(m, me.id, isHost, rev) };
      }

      case "post": {
        const me = who();
        if (!me) return { status: 403, body: { error: "removed" } };
        if (!isHost && !open()) return { status: 409, body: { error: "closed" } };
        if (!isHost && this.limited(me.id, "post")) return { status: 429, body: { error: "slow_down" } };
        const nItems = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM items`).one().n);
        if (nItems >= MAX_ITEMS) return { status: 409, body: { error: "full" } };
        const text = str(input.text, MAX_TEXT);
        const link = isHost || m.settings.allowLinks ? cleanLink(str(input.link, 600)) : "";
        const yt = isHost || m.settings.allowLinks ? youtubeId(str(input.youtube, 200)) : "";
        let imgId: string | null = null;
        const image = typeof input.image === "string" ? input.image : "";
        if (image) {
          if (!isHost && !m.settings.allowImages) return { status: 403, body: { error: "no_images" } };
          const mt = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
          if (!mt) return { status: 400, body: { error: "bad_image" } };
          const bin = Uint8Array.from(atob(mt[2]), (c) => c.charCodeAt(0));
          if (bin.byteLength > MAX_IMAGE_BYTES) return { status: 413, body: { error: "image_too_large" } };
          const nImg = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM imgs`).one().n);
          if (nImg >= MAX_IMAGES) return { status: 409, body: { error: "images_full" } };
          imgId = rand(16);
          this.sql.exec(`INSERT INTO imgs (id, mime, bytes, size) VALUES (?, ?, ?, ?)`, imgId, mt[1], bin, bin.byteLength);
        }
        if (!text && !link && !yt && !imgId) return { status: 400, body: { error: "empty" } };
        if (!isHost && isProfane(text)) return { status: 400, body: { error: "language" } };
        const id = rand(12);
        const status = isHost || m.settings.moderation === "live" ? "approved" : "pending";
        const kind = str(input.kind, 20) || "post";
        const data = { text, link, youtube: yt, stage: str(input.stage, 20) };
        this.sql.exec(`INSERT INTO items (id, pid, kind, data, status, created, img) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, me.id, kind, JSON.stringify(data), status, Date.now(), imgId);
        this.bump();
        return { status: 200, body: { ok: true, id, status } };
      }

      case "respond": {
        const me = who();
        if (!me || isHost) return { status: 403, body: { error: "removed" } };
        if (!open()) return { status: 409, body: { error: "closed" } };
        if (this.limited(me.id, "respond")) return { status: 429, body: { error: "slow_down" } };
        const r = this.cleanResponse(m, input.data);
        if ("error" in r) return { status: 400, body: r };
        if (m.type === "wordcloud") {
          const max = Number((m.settings.options as Json).maxPerStudent) || 3;
          const mine = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM items WHERE pid=? AND kind='word'`, me.id).one().n);
          if (mine >= max) return { status: 409, body: { error: "limit_reached" } };
          const nItems = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM items`).one().n);
          if (nItems >= MAX_ITEMS) return { status: 409, body: { error: "full" } };
          this.sql.exec(`INSERT INTO items (id, pid, kind, data, status, created) VALUES (?, ?, 'word', ?, 'approved', ?)`, rand(12), me.id, JSON.stringify(r), Date.now());
        } else if (m.type === "tps") {
          // Private "think" note: one per student, visible to the student, their partner and the teacher.
          this.sql.exec(`DELETE FROM items WHERE pid=? AND kind='think'`, me.id);
          this.sql.exec(`INSERT INTO items (id, pid, kind, data, status, created) VALUES (?, ?, 'think', ?, 'approved', ?)`, rand(12), me.id, JSON.stringify(r), Date.now());
        } else {
          // One response per student (poll / vote / survey): replace the previous one.
          this.sql.exec(`DELETE FROM items WHERE pid=? AND kind='response'`, me.id);
          this.sql.exec(`INSERT INTO items (id, pid, kind, data, status, created) VALUES (?, ?, 'response', ?, 'approved', ?)`, rand(12), me.id, JSON.stringify(r), Date.now());
        }
        this.bump();
        return { status: 200, body: { ok: true } };
      }

      case "like": {
        const me = who();
        if (!me) return { status: 403, body: { error: "removed" } };
        if (!isHost && !m.settings.likes) return { status: 403, body: { error: "likes_off" } };
        if (!isHost && this.limited(me.id, "like")) return { status: 429, body: { error: "slow_down" } };
        const id = str(input.id, 20);
        const item = this.sql.exec(`SELECT pid, status FROM items WHERE id=?`, id).toArray()[0];
        if (!item || item.status !== "approved") return { status: 404, body: { error: "no_item" } };
        if (!isHost && item.pid === me.id) return { status: 400, body: { error: "own_post" } };
        const had = this.sql.exec(`SELECT 1 FROM likes WHERE item=? AND pid=?`, id, me.id).toArray().length > 0;
        if (had) this.sql.exec(`DELETE FROM likes WHERE item=? AND pid=?`, id, me.id);
        else this.sql.exec(`INSERT INTO likes (item, pid) VALUES (?, ?)`, id, me.id);
        this.bump();
        return { status: 200, body: { ok: true, liked: !had } };
      }

      case "comment": {
        const h = hostOnly();
        if (h) return h;
        const id = str(input.id, 20);
        const text = str(input.text, 500);
        if (!text || !this.sql.exec(`SELECT 1 FROM items WHERE id=?`, id).toArray().length) return { status: 400, body: { error: "bad" } };
        this.sql.exec(`INSERT INTO comments (id, item, text, created) VALUES (?, ?, ?, ?)`, rand(10), id, text, Date.now());
        this.bump();
        return { status: 200, body: { ok: true } };
      }

      case "moderate": {
        const h = hostOnly();
        if (h) return h;
        const id = str(input.id, 20);
        const act = str(input.action, 20);
        const cid = str(input.commentId, 20);
        if (act === "delete-comment") this.sql.exec(`DELETE FROM comments WHERE id=?`, cid);
        else if (act === "delete") this.deleteItems(`id=?`, id);
        else if (act === "approve") this.sql.exec(`UPDATE items SET status='approved' WHERE id=?`, id);
        else if (act === "hide") this.sql.exec(`UPDATE items SET status='pending' WHERE id=?`, id);
        else if (act === "pin" || act === "unpin") this.sql.exec(`UPDATE items SET pinned=? WHERE id=?`, act === "pin" ? Date.now() : 0, id);
        else if (act === "highlight" || act === "unhighlight") this.sql.exec(`UPDATE items SET highlight=? WHERE id=?`, act === "highlight" ? 1 : 0, id);
        else if (act === "color") this.sql.exec(`UPDATE items SET color=? WHERE id=?`, COLORS.includes(String(input.color)) ? String(input.color) : "", id);
        else if (act === "approve-all") this.sql.exec(`UPDATE items SET status='approved' WHERE status='pending'`);
        else if (act === "clear") this.deleteItems(`kind=?`, str(input.kind, 20) || "response");
        else return { status: 400, body: { error: "bad_action" } };
        this.bump();
        return { status: 200, body: { ok: true } };
      }

      case "settings": {
        const h = hostOnly();
        if (h) return h;
        if (typeof input.title === "string") m.title = str(input.title, 120) || m.title;
        if (typeof input.prompt === "string") m.prompt = str(input.prompt, 600);
        m.settings = cleanSettings(input.settings, m.settings);
        if (input.reopen === true) m.endedAt = null;
        this.saveMeta(m);
        return { status: 200, body: { ok: true, ...this.info(m) } };
      }

      case "remove": {
        const h = hostOnly();
        if (h) return h;
        const pid = str(input.pid, 20);
        if (input.restore === true) this.sql.exec(`UPDATE parts SET removed=NULL WHERE id=?`, pid);
        else this.sql.exec(`UPDATE parts SET removed=? WHERE id=?`, Date.now(), pid);
        if (input.deleteItems === true) {
          this.deleteItems(`pid=?`, pid);
          this.sql.exec(`DELETE FROM likes WHERE pid=?`, pid);
        }
        if (input.forget === true) this.sql.exec(`DELETE FROM parts WHERE id=?`, pid);
        this.bump();
        return { status: 200, body: { ok: true } };
      }

      case "end": {
        const h = hostOnly();
        if (h) return h;
        m.endedAt = Date.now();
        this.saveMeta(m);
        return { status: 200, body: { ok: true } };
      }

      case "destroy": {
        const h = hostOnly();
        if (h) return h;
        await this.ctx.storage.deleteAll();
        return { status: 200, body: { ok: true } };
      }
    }
    return { status: 404, body: { error: "unknown_action" } };
  }

  private deleteItems(where: string, arg: string) {
    const rows = this.sql.exec(`SELECT id, img FROM items WHERE ${where}`, arg).toArray();
    for (const r of rows) {
      if (r.img) this.sql.exec(`DELETE FROM imgs WHERE id=?`, String(r.img));
      this.sql.exec(`DELETE FROM likes WHERE item=?`, String(r.id));
      this.sql.exec(`DELETE FROM comments WHERE item=?`, String(r.id));
    }
    this.sql.exec(`DELETE FROM items WHERE ${where}`, arg);
  }

  private cleanResponse(m: Meta, raw: unknown): Json | { error: string } {
    const d = (raw && typeof raw === "object" ? raw : {}) as Json;
    const opts = m.settings.options as Json;
    if (m.type === "wordcloud") {
      const w = str(d.word, 40).replace(/\s+/g, " ");
      const words = w.split(" ").filter(Boolean);
      if (!w || words.length > 3) return { error: "one_to_three_words" };
      if (isProfane(w)) return { error: "language" };
      return { word: w };
    }
    if (m.type === "poll" || m.type === "vote") {
      const n = Array.isArray(opts.choices) ? (opts.choices as unknown[]).length : 0;
      const max = m.type === "poll" ? (opts.multiple ? n : 1) : Math.max(1, Number(opts.votesEach) || 1);
      const picks = (Array.isArray(d.picks) ? d.picks : [d.pick]).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < n);
      const uniq = [...new Set(picks)];
      if (!uniq.length || uniq.length > max) return { error: "bad_choice" };
      return { picks: uniq };
    }
    if (m.type === "survey") {
      const qs = Array.isArray(opts.questions) ? (opts.questions as Json[]) : [];
      const ans = Array.isArray(d.answers) ? (d.answers as unknown[]) : [];
      const out = qs.map((q, i) => {
        const a = ans[i];
        if (q.kind === "text") return str(a, 300);
        if (q.kind === "choice") {
          const n = Array.isArray(q.choices) ? (q.choices as unknown[]).length : 0;
          const v = Number(a);
          return Number.isInteger(v) && v >= 0 && v < n ? v : null;
        }
        const v = Number(a); // rating / emoji 1..5
        return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
      });
      return { answers: out };
    }
    if (m.type === "tps") {
      const text = str(d.text, 600);
      if (!text) return { error: "empty" };
      if (isProfane(text)) return { error: "language" };
      return { text };
    }
    return { error: "not_supported" };
  }

  private info(m: Meta) {
    return {
      code: m.code,
      type: m.type,
      title: m.title,
      prompt: m.prompt,
      settings: m.settings,
      ended: Boolean(m.endedAt),
      createdAt: m.createdAt,
      expiresAt: m.expiresAt,
      now: Date.now(),
      participantCount: Number(this.sql.exec(`SELECT COUNT(*) AS n FROM parts WHERE removed IS NULL`).one().n),
    };
  }

  private state(m: Meta, meId: string, isHost: boolean, rev: number) {
    const parts = this.sql.exec(`SELECT id, name, joined, removed FROM parts ORDER BY joined`).toArray();
    const visibleParts = parts.filter((p) => isHost || !p.removed);
    const nameOf = new Map<string, string>();
    visibleParts.forEach((p, i) => nameOf.set(String(p.id), m.settings.hideNames && !isHost && p.id !== meId ? `Student ${i + 1}` : String(p.name)));
    const likeRows = this.sql.exec(`SELECT item, pid FROM likes`).toArray();
    const likeCount = new Map<string, number>();
    const mine = new Set<string>();
    for (const l of likeRows) {
      likeCount.set(String(l.item), (likeCount.get(String(l.item)) || 0) + 1);
      if (l.pid === meId) mine.add(String(l.item));
    }
    const comments = new Map<string, { id: string; text: string; created: number }[]>();
    for (const c of this.sql.exec(`SELECT id, item, text, created FROM comments ORDER BY created`).toArray()) {
      const arr = comments.get(String(c.item)) || [];
      arr.push({ id: String(c.id), text: String(c.text), created: Number(c.created) });
      comments.set(String(c.item), arr);
    }
    // Poll/vote/survey: students only see their own response; results are summarised for everyone when shown.
    const rows = this.sql.exec(`SELECT * FROM items ORDER BY created`).toArray();
    const opts = m.settings.options as Json;
    const pairs = Array.isArray(opts.pairs) ? (opts.pairs as unknown[]).filter(Array.isArray).map((g) => (g as unknown[]).map(String)) : [];
    const partners = new Set<string>(pairs.find((g) => g.includes(meId)) ?? [meId]);
    const anonymous = m.type === "vote" && opts.anonymous === true;
    const items = rows
      .filter((r) => isHost || r.status === "approved" || r.pid === meId)
      .filter((r) => isHost || r.kind !== "response" || r.pid === meId)
      .filter((r) => isHost || r.kind !== "think" || partners.has(String(r.pid)))
      .map((r) => ({
        id: String(r.id),
        pid: anonymous && r.kind === "response" && r.pid !== meId ? "" : String(r.pid),
        mine: r.pid === meId,
        author: anonymous && r.kind === "response" ? "Anonymous" : r.pid === "host" ? "Teacher" : nameOf.get(String(r.pid)) ?? "Student",
        kind: String(r.kind),
        data: JSON.parse(String(r.data || "{}")),
        status: String(r.status),
        created: Number(r.created),
        pinned: Number(r.pinned) || 0,
        color: String(r.color || ""),
        highlight: Boolean(r.highlight),
        img: r.img ? String(r.img) : null,
        likes: likeCount.get(String(r.id)) || 0,
        liked: mine.has(String(r.id)),
        comments: comments.get(String(r.id)) || [],
      }));
    const responses = rows.filter((r) => r.kind === "response").map((r) => JSON.parse(String(r.data || "{}")) as Json);
    const showResults = isHost || (m.settings.options as Json).showResults === true || Boolean(m.endedAt);
    return {
      ...this.info(m),
      rev,
      me: isHost ? { id: "host", name: "Teacher" } : { id: meId, name: nameOf.get(meId) ?? "" },
      participants: visibleParts.map((p) => ({ id: String(p.id), name: nameOf.get(String(p.id)) ?? "", joined: Number(p.joined), removed: Boolean(p.removed) })),
      items,
      summary: showResults ? this.summary(m, responses) : null,
      responseCount: responses.length,
    };
  }

  private summary(m: Meta, responses: Json[]) {
    const opts = m.settings.options as Json;
    if (m.type === "poll" || m.type === "vote") {
      const n = Array.isArray(opts.choices) ? (opts.choices as unknown[]).length : 0;
      const counts = Array.from({ length: n }, () => 0);
      for (const r of responses) for (const p of (r.picks as number[]) || []) if (p < n) counts[p]++;
      return { counts, voters: responses.length };
    }
    if (m.type === "survey") {
      const qs = Array.isArray(opts.questions) ? (opts.questions as Json[]) : [];
      return {
        questions: qs.map((q, i) => {
          const vals = responses.map((r) => ((r.answers as unknown[]) || [])[i]).filter((v) => v !== null && v !== undefined && v !== "");
          if (q.kind === "text") return { texts: vals.map(String) };
          if (q.kind === "choice") {
            const n = Array.isArray(q.choices) ? (q.choices as unknown[]).length : 0;
            const counts = Array.from({ length: n }, () => 0);
            vals.forEach((v) => counts[Number(v)]++);
            return { counts };
          }
          const counts = [0, 0, 0, 0, 0];
          vals.forEach((v) => counts[Number(v) - 1]++);
          const avg = vals.length ? vals.reduce((a: number, v) => a + Number(v), 0) / vals.length : 0;
          return { counts, avg: Math.round(avg * 100) / 100 };
        }),
        respondents: responses.length,
      };
    }
    return null;
  }
}

async function readJson(request: Request): Promise<Json | null> {
  if (request.method !== "POST") return {};
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" ? (v as Json) : {};
  } catch {
    return {};
  }
}

export async function handleActivity(request: Request, env: ActivityEnv, parts: string[]): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const body = await readJson(request);
  if (body === null) return reply(origin, { error: "too_large" }, 413);

  if (parts[2] === "create") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    const type = String(body.type) as ActivityType;
    if (!ACTIVITY_TYPES.includes(type)) return reply(origin, { error: "bad_type" }, 400);
    // Admin, or a teacher the admin granted this activity type to.
    if (!(await verifyToken(env, request.headers.get("Authorization"))) && !(await teacherWithPerm(request, env as unknown as LmsEnv, `act:${type}`))) return reply(origin, { error: "unauthorized" }, 401);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = rand(5, ALPHABET);
      const stub = env.ACTIVITIES.get(env.ACTIVITIES.idFromName(code));
      const r = (await stub.handle("init", "POST", { ...body, code, type })) as unknown as Reply;
      if (r.status !== 409) return reply(origin, r.body, r.status);
    }
    return reply(origin, { error: "try_again" }, 503);
  }

  const code = String(parts[2] || "").toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return reply(origin, { error: "bad_code" }, 400);
  const action = parts[3] || "info";
  const stub = env.ACTIVITIES.get(env.ACTIVITIES.idFromName(code));
  const url = new URL(request.url);
  if (action === "img") {
    const img = (await stub.image(String(url.searchParams.get("id") || "").slice(0, 32))) as unknown as { mime: string; bytes: ArrayBuffer } | null;
    if (!img) return new Response("not found", { status: 404 });
    return new Response(img.bytes, { headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=604800, immutable", "Access-Control-Allow-Origin": "*" } });
  }
  const input: Json = { ...Object.fromEntries(url.searchParams), ...body };
  const r = (await stub.handle(action, request.method, input)) as unknown as Reply;
  return reply(origin, r.body, r.status);
}
