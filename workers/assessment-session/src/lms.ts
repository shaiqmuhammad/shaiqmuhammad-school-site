/**
 * LMS phase 1: student/teacher accounts (username + PIN), homework (Quran + general), review, tracker.
 *
 * One Durable Object ("main") with SQLite. PINs are stored as PBKDF2-SHA256 hashes (100k rounds, random salt).
 * Students/teachers get a signed 30-day token (HMAC with SESSION_SIGNING_KEY, sub "user"); the admin uses the
 * existing admin token. Files (recordings) go through ./storage.ts, which is disabled until R2 is bound.
 *
 *   POST /api/lms/login            {username, pin} -> {token, exp, user}
 *   GET  /api/lms/me               (user)            -> {user}
 *   GET  /api/lms/dashboard        (user)            -> student: {homework[], tracker[]} · teacher: {homework[], classes[]}
 *   GET  /api/lms/users            (admin | teacher+manageUsers)
 *   POST /api/lms/users            {users:[{id?, username, name, role, cls, perms, pin?, disabled?}]} -> {saved, pins:[{username,pin}]}
 *   POST /api/lms/user-delete      {id}
 *   POST /api/lms/users-status     {ids, disabled} bulk Activate/Block (blocked users get "blocked" at login)
 *   POST /api/lms/user-pin         {id, pin?} -> {pin}
 *   POST /api/lms/hw-save          (admin | teacher+assign) {id?, kind, title, cls, students?, due?, data}
 *   POST /api/lms/hw-delete        {id}
 *   GET  /api/lms/hw?id=           homework + my submission (student) or all submissions (staff)
 *   POST /api/lms/sub-save         (student) {hw, text, practised, submit}
 *   POST /api/lms/sub-review       (admin | teacher+review) {id, comment?, like?, status?: approved|returned}
 *   GET  /api/lms/export           (staff) everything as JSON (the site builds the ZIP)
 *   POST /api/lms/upload           501 until file storage (R2) is configured
 *   GET  /api/lms/catalog          (any user) subjects, classes, sections
 *   POST /api/lms/catalog-save     (admin) {kind: subject|class|section, id?, name, parent?}  (renames propagate)
 *   POST /api/lms/catalog-delete   (admin) {id}  (refused while in use)
 *   POST /api/lms/pins-view        (admin only) {ids?} -> {pins: {id: pin|null}}
 *   POST /api/lms/audio-upload?hw= (student: recitation/answer for that homework, replaces the previous one)
 *        /api/lms/audio-upload?sub= (teacher/admin: spoken feedback on a submission) — raw audio body, ≤1.6 MB
 *   GET  /api/lms/audio?id=        the recording (student owner or staff)
 *   POST /api/lms/audio-delete     {id}
 *   GET  /api/lms/notes            {items, unread} · POST /api/lms/notes-read {ids?} (none = all)
 *
 * PINs: the PBKDF2 hash is what login checks. A copy is also kept AES-GCM encrypted with the LMS_PIN_KEY secret
 * (32 random bytes, base64) so the admin can look a PIN up. Users created before that show "reset to view".
 */
import { buildFeedback, fromGrade, overallOf, parseScores, type Scores } from "./quranScore";
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply, verifyToken, type AdminEnv } from "./admin";
import { sendAuto, type MailEnv } from "./mail/mailbox";
import { blobStore, sqliteChunkStore, type BlobStore, type StorageEnv } from "./storage";

export interface LmsEnv extends AdminEnv, StorageEnv, MailEnv {
  LMS: DurableObjectNamespace<LmsStore>;
  /** base64 of 32 random bytes; enables admin PIN viewing. */
  LMS_PIN_KEY?: string;
}

type Json = Record<string, unknown>;
/** Actions allowed in admin read-only "view as" mode. */
const VIEW_AS_READ = new Set(["dashboard", "hw", "progress", "quran-map", "leaderboard", "notes", "catalog", "me"]);

/** Which LMS notifications also go out by email (when the user has an email and mail is configured). */
const EMAIL_KINDS: Record<string, [string, string]> = {
  hw_new: ["New homework", "You have new homework: {title}."],
  graded: ["Your Quran homework was graded", "{title} was graded by {by}."],
  feedback: ["New feedback from your teacher", "{by} left feedback on {title}."],
  feedback_audio: ["Voice feedback from your teacher", "{by} sent voice feedback on {title}."],
  returned: ["Please try again", "{title} was returned — please practise and hand it in again."],
  sub_new: ["New submission", "{student} handed in {title}."],
  reminder: ["Homework reminder", "{title} is due soon."],
};
type Reply = { status: number; body: unknown };
export type Role = "student" | "teacher";
export type Actor = { id: string; role: Role | "admin"; name: string; cls: string; perms: string[]; scope?: string[]; viewAs?: boolean };
type CatKind = "subject" | "class" | "section";

const TOKEN_DAYS = 30;
const MAX_USERS = 3000;
const MAX_HW = 2000;
const FAIL_WINDOW = 15 * 60_000;
const PERMS = ["assign", "review", "manageUsers", "viewAll", "staff"] as const;
/** Spaced revision after a pass: 1, 3, 7, 14, 30, then every 60 days. */
const REVISION_DAYS = [1, 3, 7, 14, 30, 60];
const MAX_AUDIO = 1_600_000; // ~3 min at 24 kbps + container overhead, with headroom
const USER_AUDIO_CAP = 30_000_000;
const TOTAL_AUDIO_CAP = 1_500_000_000;
const AUDIO_TYPES = /^audio\/(webm|mp4|ogg|aac|mpeg|x-m4a)(;.*)?$/;
const enc = new TextEncoder();

const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const rid = (p: string) => `${p}_${Date.now().toString(36)}${hex(crypto.getRandomValues(new Uint8Array(5)))}`;
export const normUser = (s: unknown) => str(s, 40).toLowerCase().replace(/[^a-z0-9._-]/g, "");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function hmac(key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, k, 256));
}
function newPin(): string {
  const b = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return String(100000 + b);
}
const validPin = (p: string) => /^\d{4,8}$/.test(p);

async function pinKey(env: LmsEnv) {
  if (!env.LMS_PIN_KEY) return null;
  try {
    const raw = Uint8Array.from(atob(env.LMS_PIN_KEY), (c) => c.charCodeAt(0));
    return raw.length === 32 ? await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]) : null;
  } catch {
    return null;
  }
}
async function sealPin(env: LmsEnv, pin: string): Promise<string | null> {
  const k = await pinKey(env);
  if (!k) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return `${b64url(iv)}.${b64url(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(pin))))}`;
}
async function openPin(env: LmsEnv, sealed: unknown): Promise<string | null> {
  const k = sealed ? await pinKey(env) : null;
  if (!k) return null;
  try {
    const [iv, ct] = String(sealed).split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, k, fromB64url(ct)));
  } catch {
    return null;
  }
}
const strList = (v: unknown, max = 40) => (Array.isArray(v) ? v.map((x) => str(x, 81)).filter(Boolean).slice(0, max) : []);

export async function issueUserToken(env: AdminEnv, uid: string) {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  const payload = b64url(enc.encode(JSON.stringify({ sub: "user", uid, exp })));
  return { token: `${payload}.${b64url(await hmac(env.SESSION_SIGNING_KEY!, payload))}`, exp };
}
async function verifyUserToken(env: AdminEnv, header: string | null): Promise<string | null> {
  if (!env.SESSION_SIGNING_KEY || !header?.startsWith("Bearer ")) return null;
  const [payload, sig] = header.slice(7).trim().split(".");
  if (!payload || !sig || !safeEqual(sig, b64url(await hmac(env.SESSION_SIGNING_KEY, payload)))) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { sub?: string; uid?: string; exp?: number };
    return d.sub === "user" && d.uid && d.exp && d.exp > Date.now() ? d.uid : null;
  } catch {
    return null;
  }
}

const can = (a: Actor, perm: (typeof PERMS)[number]) => a.role === "admin" || (a.role === "teacher" && a.perms.includes(perm));
const isStaff = (a: Actor) => a.role === "admin" || a.role === "teacher";

export class LmsStore extends DurableObject<LmsEnv> {
  private sql: SqlStorage;
  private files: BlobStore;
  constructor(ctx: DurableObjectState, env: LmsEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Recordings: R2 when bound, else chunked inside this Durable Object's SQLite.
    this.files = env.FILES ? blobStore(env) : sqliteChunkStore(this.sql);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, cls TEXT, salt TEXT, hash TEXT, perms TEXT, disabled INTEGER DEFAULT 0, created INTEGER, last_login INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS homework (id TEXT PRIMARY KEY, kind TEXT, title TEXT, cls TEXT, students TEXT, data TEXT, due INTEGER, created_by TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, hw TEXT, student TEXT, status TEXT, text TEXT, practised INTEGER DEFAULT 0, liked INTEGER DEFAULT 0, comments TEXT DEFAULT '[]', updated INTEGER, UNIQUE (hw, student))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tracker (id TEXT PRIMARY KEY, student TEXT, surah INTEGER, from_ayah INTEGER, to_ayah INTEGER, hw TEXT UNIQUE, approved INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS fails (k TEXT, t INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, owner TEXT, sub TEXT, kind TEXT, mime TEXT, size INTEGER, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, uid TEXT, kind TEXT, data TEXT, created INTEGER, read INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS notes_uid ON notes (uid, created)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, kind TEXT, name TEXT, parent TEXT DEFAULT '', ord INTEGER DEFAULT 0)`);
    const cols = (t: string) => new Set(this.sql.exec(`PRAGMA table_info(${t})`).toArray().map((r) => String(r.name)));
    const uc = cols("users");
    for (const [c, def] of [["section", "TEXT DEFAULT ''"], ["subjects", "TEXT DEFAULT '[]'"], ["scope", "TEXT DEFAULT '[]'"], ["pin_enc", "TEXT"]] as const) if (!uc.has(c)) this.sql.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
    if (!cols("subs").has("audio")) this.sql.exec(`ALTER TABLE subs ADD COLUMN audio TEXT DEFAULT ''`);
    // Quran traffic-light grade (green/yellow = passed, red = practise again) + every graded attempt kept.
    if (!cols("subs").has("grade")) this.sql.exec(`ALTER TABLE subs ADD COLUMN grade TEXT DEFAULT ''`);
    if (!cols("subs").has("attempts")) this.sql.exec(`ALTER TABLE subs ADD COLUMN attempts TEXT DEFAULT '[]'`);
    if (!cols("tracker").has("grade")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN grade TEXT DEFAULT 'green'`);
    // Phase 2: activity days (streaks), revision tracking, settings, parent links, mistake notes.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS activity (student TEXT, day TEXT, PRIMARY KEY (student, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS unlocks (hw TEXT, student TEXT, PRIMARY KEY (hw, student))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS qr (token TEXT PRIMARY KEY, hw TEXT, student TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS viewlog (id TEXT PRIMARY KEY, uid TEXT, name TEXT, role TEXT, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT, email TEXT, subject TEXT, message TEXT, created INTEGER, read INTEGER DEFAULT 0, emailed INTEGER DEFAULT 0, ip TEXT)`);
    if (!cols("users").has("parent_token")) this.sql.exec(`ALTER TABLE users ADD COLUMN parent_token TEXT DEFAULT ''`);
    if (!cols("users").has("email")) this.sql.exec(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`);
    if (!cols("subs").has("mistakes")) this.sql.exec(`ALTER TABLE subs ADD COLUMN mistakes TEXT DEFAULT '[]'`);
    if (!cols("subs").has("submitted_at")) this.sql.exec(`ALTER TABLE subs ADD COLUMN submitted_at INTEGER DEFAULT 0`);
    // Old schema had hw UNIQUE, so one student's approval overwrote another's on class homework: one row per (hw, student).
    const tsql = String(this.sql.exec(`SELECT sql FROM sqlite_master WHERE name='tracker'`).toArray()[0]?.sql || "");
    if (tsql.includes("hw TEXT UNIQUE")) {
      this.sql.exec(`CREATE TABLE tracker_new (id TEXT PRIMARY KEY, student TEXT, surah INTEGER, from_ayah INTEGER, to_ayah INTEGER, hw TEXT, approved INTEGER, grade TEXT DEFAULT 'green', UNIQUE (hw, student))`);
      this.sql.exec(`INSERT OR IGNORE INTO tracker_new SELECT id, student, surah, from_ayah, to_ayah, hw, approved, grade FROM tracker`);
      this.sql.exec(`DROP TABLE tracker`);
      this.sql.exec(`ALTER TABLE tracker_new RENAME TO tracker`);
    }
    // Three-criteria Quran scores (Makharij / Tajweed / Recitation). Older colour grades are backfilled as equal levels.
    if (!cols("subs").has("scores")) this.sql.exec(`ALTER TABLE subs ADD COLUMN scores TEXT DEFAULT ''`);
    if (!cols("tracker").has("scores")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN scores TEXT DEFAULT ''`);
    for (const tb of ["subs", "tracker"] as const) {
      for (const r of this.sql.exec(`SELECT id, grade FROM ${tb} WHERE (scores IS NULL OR scores='') AND grade IN ('green','yellow','red')`).toArray()) {
        const sc = fromGrade(String(r.grade))!;
        this.sql.exec(`UPDATE ${tb} SET scores=? WHERE id=?`, JSON.stringify({ ...sc, fb: buildFeedback(sc) }), String(r.id));
      }
    }
    if (!cols("tracker").has("rev_count")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN rev_count INTEGER DEFAULT 0`);
    if (!cols("tracker").has("rev_at")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN rev_at INTEGER DEFAULT 0`);
    if (!cols("homework").has("section")) this.sql.exec(`ALTER TABLE homework ADD COLUMN section TEXT DEFAULT ''`);
    // One-time migration: free-text class values become catalog classes (idempotent).
    for (const r of this.sql.exec(`SELECT DISTINCT cls FROM users WHERE cls != '' UNION SELECT DISTINCT cls FROM homework WHERE cls != ''`).toArray()) {
      const n = String(r.cls);
      if (!this.sql.exec(`SELECT id FROM catalog WHERE kind='class' AND name=?`, n).toArray().length) this.sql.exec(`INSERT INTO catalog (id, kind, name) VALUES (?, 'class', ?)`, rid("c"), n);
    }
  }

  private catalog() {
    const rows = this.sql.exec(`SELECT * FROM catalog ORDER BY kind, ord, name`).toArray().map((r) => ({ id: String(r.id), kind: String(r.kind) as CatKind, name: String(r.name), parent: String(r.parent || "") }));
    const className = new Map(rows.filter((r) => r.kind === "class").map((r) => [r.id, r.name]));
    return {
      subjects: rows.filter((r) => r.kind === "subject").map(({ id, name }) => ({ id, name })),
      classes: rows.filter((r) => r.kind === "class").map(({ id, name }) => ({ id, name })),
      sections: rows.filter((r) => r.kind === "section").map(({ id, name, parent }) => ({ id, name, classId: parent, cls: className.get(parent) || "" })),
    };
  }
  /** "" when ok, else an error code. Empty catalog lists don't restrict (fresh installs keep working). */
  private checkPlacement(cls: string, section: string, subjects: string[], scope: string[]) {
    const c = this.catalog();
    if (cls && c.classes.length && !c.classes.some((x) => x.name === cls)) return "unknown_class";
    if (section && !c.sections.some((x) => x.name === section && (!cls || x.cls === cls))) return "unknown_section";
    if (subjects.some((n) => !c.subjects.some((x) => x.name === n))) return "unknown_subject";
    for (const sc of scope) {
      const [k, sec] = sc.split("|");
      if (!c.classes.some((x) => x.name === k) || (sec && !c.sections.some((x) => x.name === sec && x.cls === k))) return "unknown_scope";
    }
    return "";
  }

  private userRow(where: string, arg: string) {
    return this.sql.exec(`SELECT * FROM users WHERE ${where}`, arg).toArray()[0];
  }
  private publicUser(r: Record<string, unknown>) {
    return { id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role) as Role, cls: String(r.cls || ""), section: String(r.section || ""), subjects: JSON.parse(String(r.subjects || "[]")) as string[], scope: JSON.parse(String(r.scope || "[]")) as string[], perms: JSON.parse(String(r.perms || "[]")) as string[], disabled: Boolean(r.disabled), hasPin: Boolean(r.pin_enc), email: String(r.email || ""), created: Number(r.created), lastLogin: r.last_login ? Number(r.last_login) : null };
  }
  private failCount(k: string) {
    this.sql.exec(`DELETE FROM fails WHERE t < ?`, Date.now() - FAIL_WINDOW);
    return Number(this.sql.exec(`SELECT COUNT(*) AS n FROM fails WHERE k=?`, k).one().n);
  }

  /** Resolves a user id from a token into an actor (null when unknown or disabled). */
  private actorOf(r: Record<string, unknown>): Actor {
    const u = this.publicUser(r);
    return { id: u.id, role: u.role, name: u.name, cls: u.cls, perms: u.perms, scope: u.scope };
  }

  /** RPC for the mail routes: small admin settings (e.g. the email signature). */
  async getSetting(k: string): Promise<string> { return this.setting(k, ""); }
  async putSetting(k: string, v: string): Promise<void> { this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)`, k, v.slice(0, 20000)); }

  private setting(k: string, def = ""): string {
    return String(this.sql.exec(`SELECT v FROM settings WHERE k=?`, k).toArray()[0]?.v ?? def);
  }

  async actor(uid: string): Promise<Actor | null> {
    const r = this.userRow("id=?", uid);
    if (!r || r.disabled) return null;
    const u = this.publicUser(r);
    return { id: u.id, role: u.role, name: u.name, cls: u.cls, perms: u.perms, scope: u.scope };
  }

  async login(username: string, pin: string, ip: string): Promise<Reply> {
    const u = normUser(username);
    if (this.failCount(`u:${u}`) >= 5 || this.failCount(`ip:${ip}`) >= 25) return { status: 429, body: { error: "too_many_attempts" } };
    const r = this.userRow("username=?", u);
    const pinOk = !!r && safeEqual(await hashPin(pin, fromB64url(String(r.salt))), String(r.hash));
    // Blocked accounts are told so — only after a correct PIN, so it can't be used to probe usernames.
    if (pinOk && r.disabled) return { status: 403, body: { error: "blocked" } };
    const ok = pinOk;
    if (!ok) {
      this.sql.exec(`INSERT INTO fails (k, t) VALUES (?, ?), (?, ?)`, `u:${u}`, Date.now(), `ip:${ip}`, Date.now());
      return { status: 401, body: { error: "bad_login" } };
    }
    this.sql.exec(`DELETE FROM fails WHERE k=?`, `u:${u}`);
    this.sql.exec(`UPDATE users SET last_login=? WHERE id=?`, Date.now(), String(r.id));
    return { status: 200, body: { uid: String(r.id), user: this.publicUser(r) } };
  }

  /** In-app notifications (bell). uid "admin" is the admin. Keeps the newest 100 per person, 60 days. */
  private notify(uids: string[], kind: string, data: Json) {
    const now = Date.now();
    for (const uid of [...new Set(uids)].filter(Boolean)) {
      this.sql.exec(`INSERT INTO notes (id, uid, kind, data, created) VALUES (?, ?, ?, ?, ?)`, rid("n"), uid, kind, JSON.stringify(data), now);
      this.sql.exec(`DELETE FROM notes WHERE uid=? AND id NOT IN (SELECT id FROM notes WHERE uid=? ORDER BY created DESC LIMIT 100)`, uid, uid);
    }
    this.sql.exec(`DELETE FROM notes WHERE created < ?`, now - 60 * 864e5);
    // Email copy (info@ no-reply, Reply-To contact@) for users with an email address.
    const tpl = EMAIL_KINDS[kind];
    if (tpl) {
      const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => String(data[k] ?? ""));
      for (const uid of [...new Set(uids)]) {
        const u = this.userRow("id=?", uid);
        const to = String(u?.email || "");
        if (!to || u?.disabled) continue;
        const link = data.hw ? `https://www.shaiqmuhammad.com/lms/homework?id=${encodeURIComponent(String(data.hw))}` : "https://www.shaiqmuhammad.com/lms";
        this.ctx.waitUntil(sendAuto(this.env as LmsEnv, to, `${tpl[0]} — ${String(u?.name || "")}`.slice(0, 150), { heading: tpl[0], paragraphs: [`Assalamu alaikum,`, `${fill(tpl[1])}${u?.role === "student" ? ` (${String(u?.name)})` : ""}`], button: { label: "Open", url: link }, note: "This is an automatic message — please don't reply. Questions: contact@shaiqmuhammad.com" }).catch(() => false));
      }
    }
  }
  private studentName(id: string) {
    return String(this.userRow("id=?", id)?.name ?? "?");
  }

  /** Raw audio upload (see header). Body is the recording; caps per person and in total. */
  async audioUpload(a: Actor, q: Json, data: ArrayBuffer, mime: string): Promise<Reply> {
    if (!AUDIO_TYPES.test(mime)) return { status: 415, body: { error: "audio_type" } };
    if (!data.byteLength) return { status: 400, body: { error: "empty" } };
    if (data.byteLength > MAX_AUDIO) return { status: 413, body: { error: "audio_too_long" } };
    const used = Number(this.sql.exec(`SELECT COALESCE(SUM(size),0) AS n FROM blobs WHERE owner=?`, a.id).one().n);
    const total = Number(this.sql.exec(`SELECT COALESCE(SUM(size),0) AS n FROM blobs`).one().n);
    if (used + data.byteLength > USER_AUDIO_CAP) return { status: 409, body: { error: "audio_user_full" } };
    if (total + data.byteLength > TOTAL_AUDIO_CAP) return { status: 409, body: { error: "audio_full" } };
    const id = rid("a");
    const type = mime.split(";")[0];
    if (a.role === "student") {
      const h = this.allHomework(str(q.hw, 40))[0];
      if (!h || !this.assignees(h).includes(a.id)) return { status: 404, body: { error: "not_found" } };
      if (this.lockedFor(h, a.id)) return { status: 409, body: { error: "locked" } };
      let cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
      if (cur?.status === "approved") return { status: 409, body: { error: "already_approved" } };
      if (!cur) {
        this.sql.exec(`INSERT INTO subs (id, hw, student, status, text, practised, updated) VALUES (?, ?, ?, 'draft', '', 0, ?)`, rid("s"), h.id, a.id, Date.now());
        cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
      }
      // Keep recordings that belong to a graded attempt (history); replace an ungraded draft recording.
      const kept = (JSON.parse(String(cur.attempts || "[]")) as { audio: string }[]).some((x) => x.audio === cur.audio);
      if (cur.audio && !kept) await this.dropBlob(String(cur.audio));
      await this.files.put(id, data, type);
      this.sql.exec(`INSERT INTO blobs (id, owner, sub, kind, mime, size, created) VALUES (?, ?, ?, 'rec', ?, ?, ?)`, id, a.id, String(cur.id), type, data.byteLength, Date.now());
      // Saving a recording hands it in: the teacher sees it straight away ("Sent to teacher ✓").
      const was = String(cur.status);
      this.sql.exec(`UPDATE subs SET audio=?, status='submitted', submitted_at=COALESCE(NULLIF(submitted_at,0), ?), updated=? WHERE id=?`, id, Date.now(), Date.now(), String(cur.id));
      if (was !== "submitted") this.notify([String(h.createdBy), "admin"], "sub_new", { hw: h.id, title: h.title, student: a.name });
      this.touch(a.id);
      return { status: 200, body: { ok: true, id, sub: this.sub(h.id, a.id) } };
    }
    if (!can(a, "review")) return { status: 403, body: { error: "forbidden" } };
    const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, str(q.sub, 40)).toArray()[0];
    if (!r) return { status: 404, body: { error: "not_found" } };
    await this.files.put(id, data, type);
    this.sql.exec(`INSERT INTO blobs (id, owner, sub, kind, mime, size, created) VALUES (?, ?, ?, 'fb', ?, ?, ?)`, id, a.id, String(r.id), type, data.byteLength, Date.now());
    const comments = JSON.parse(String(r.comments || "[]")) as Json[];
    comments.push({ by: a.name, text: "", audio: id, at: Date.now() });
    this.sql.exec(`UPDATE subs SET comments=?, updated=? WHERE id=?`, JSON.stringify(comments.slice(-50)), Date.now(), String(r.id));
    const h = this.allHomework(String(r.hw))[0];
    this.notify([String(r.student)], "feedback_audio", { hw: String(r.hw), title: h?.title || "", by: a.name });
    return { status: 200, body: { ok: true, id } };
  }

  async audioGet(a: Actor, id: string): Promise<{ status: number; mime?: string; data?: ArrayBuffer; error?: string }> {
    const b = this.sql.exec(`SELECT * FROM blobs WHERE id=?`, id).toArray()[0];
    if (!b) return { status: 404, error: "not_found" };
    const sub = this.sql.exec(`SELECT student FROM subs WHERE id=?`, String(b.sub)).toArray()[0];
    if (!isStaff(a) && sub?.student !== a.id) return { status: 403, error: "forbidden" };
    const f = await this.files.get(id);
    if (!f) return { status: 404, error: "not_found" };
    const data = f.body instanceof ArrayBuffer ? f.body : await new Response(f.body).arrayBuffer();
    return { status: 200, mime: String(b.mime), data };
  }

  private async dropBlob(id: string) {
    await this.files.delete(id);
    this.sql.exec(`DELETE FROM blobs WHERE id=?`, id);
  }
  private async dropBlobsOfSubs(subIds: string[]) {
    for (const s of subIds) for (const b of this.sql.exec(`SELECT id FROM blobs WHERE sub=?`, s).toArray()) await this.dropBlob(String(b.id));
  }

  async handle(action: string, a: Actor, input: Json): Promise<Reply> {
    switch (action) {
      case "me":
        return { status: 200, body: { user: a } };

      case "users": {
        if (!can(a, "manageUsers")) return { status: 403, body: { error: "forbidden" } };
        if (input.__method !== "POST") {
          return { status: 200, body: { users: this.sql.exec(`SELECT * FROM users ORDER BY role DESC, cls, name`).toArray().map((r) => this.publicUser(r)) } };
        }
        const list = Array.isArray(input.users) ? (input.users as Json[]).slice(0, 1000) : [];
        const pins: { username: string; name: string; pin: string }[] = [];
        const errors: { row: number; username: string; error: string }[] = [];
        let saved = 0;
        for (const [i, raw] of list.entries()) {
          const username = normUser(raw.username);
          const name = str(raw.name, 80);
          const role: Role = raw.role === "teacher" ? "teacher" : "student";
          // Only the admin can create or edit teachers.
          if (role === "teacher" && a.role !== "admin") { errors.push({ row: i + 1, username, error: "admin_only" }); continue; }
          const perms = role === "teacher" ? (Array.isArray(raw.perms) ? (raw.perms as unknown[]).map(String).filter((p) => (PERMS as readonly string[]).includes(p) || /^(act|host):[\w*-]{1,80}$/.test(p)).slice(0, 80) : ["assign", "review"]) : [];
          const cls = str(raw.cls, 40);
          const section = role === "student" ? str(raw.section, 40) : "";
          const subjects = role === "teacher" ? strList(raw.subjects) : [];
          const scope = role === "teacher" ? strList(raw.scope, 80) : [];
          const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw.email || "").trim()) ? String(raw.email).trim().slice(0, 120) : "";
          const placement = this.checkPlacement(cls, section, subjects, scope);
          if (placement) { errors.push({ row: i + 1, username, error: placement }); continue; }
          const existing = raw.id ? this.userRow("id=?", String(raw.id)) : this.userRow("username=?", username);
          if (!username || username.length < 3) { errors.push({ row: i + 1, username, error: "username" }); continue; }
          if (!name) { errors.push({ row: i + 1, username, error: "name" }); continue; }
          const clash = this.userRow("username=?", username);
          if (clash && (!existing || clash.id !== existing.id)) { errors.push({ row: i + 1, username, error: "username_taken" }); continue; }
          let pin = str(raw.pin, 8);
          if (pin && !validPin(pin)) { errors.push({ row: i + 1, username, error: "pin_digits" }); continue; }
          if (existing) {
            if (existing.role === "teacher" && a.role !== "admin") { errors.push({ row: i + 1, username, error: "admin_only" }); continue; }
            this.sql.exec(`UPDATE users SET username=?, name=?, role=?, cls=?, section=?, subjects=?, scope=?, perms=?, disabled=?, email=? WHERE id=?`, username, name, role, cls, section, JSON.stringify(subjects), JSON.stringify(scope), JSON.stringify(perms), raw.disabled ? 1 : 0, raw.email === undefined ? String(existing.email || "") : email, String(existing.id));
            if (pin) await this.setPin(String(existing.id), pin);
          } else {
            if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM users`).one().n) >= MAX_USERS) { errors.push({ row: i + 1, username, error: "full" }); continue; }
            if (!pin) pin = newPin();
            const id = rid("u");
            this.sql.exec(`INSERT INTO users (id, username, name, role, cls, section, subjects, scope, perms, disabled, created, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, username, name, role, cls, section, JSON.stringify(subjects), JSON.stringify(scope), JSON.stringify(perms), raw.disabled ? 1 : 0, Date.now(), email);
            await this.setPin(id, pin);
            pins.push({ username, name, pin });
          }
          saved++;
        }
        return { status: 200, body: { saved, pins, errors } };
      }

      case "users-status": {
        // Bulk Activate / Block. Teachers can only be changed by the admin.
        if (!can(a, "manageUsers")) return { status: 403, body: { error: "forbidden" } };
        const ids = strList(input.ids, 1000);
        const off = input.disabled ? 1 : 0;
        let changed = 0;
        for (const id of ids) {
          const r = this.userRow("id=?", id);
          if (!r || (r.role === "teacher" && a.role !== "admin")) continue;
          this.sql.exec(`UPDATE users SET disabled=? WHERE id=?`, off, id);
          changed++;
        }
        return { status: 200, body: { ok: true, changed } };
      }

      case "user-delete": {
        if (!can(a, "manageUsers")) return { status: 403, body: { error: "forbidden" } };
        const r = this.userRow("id=?", str(input.id, 40));
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (r.role === "teacher" && a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        this.sql.exec(`DELETE FROM users WHERE id=?`, String(r.id));
        await this.dropBlobsOfSubs(this.sql.exec(`SELECT id FROM subs WHERE student=?`, String(r.id)).toArray().map((x) => String(x.id)));
        this.sql.exec(`DELETE FROM notes WHERE uid=?`, String(r.id));
        this.sql.exec(`DELETE FROM subs WHERE student=?`, String(r.id));
        this.sql.exec(`DELETE FROM tracker WHERE student=?`, String(r.id));
        return { status: 200, body: { ok: true } };
      }

      case "user-pin": {
        if (!can(a, "manageUsers")) return { status: 403, body: { error: "forbidden" } };
        const r = this.userRow("id=?", str(input.id, 40));
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (r.role === "teacher" && a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const pin = str(input.pin, 8) || newPin();
        if (!validPin(pin)) return { status: 400, body: { error: "pin_digits" } };
        await this.setPin(String(r.id), pin);
        return { status: 200, body: { pin } };
      }

      case "catalog":
        return { status: 200, body: this.catalog() };

      case "notes": {
        const items = this.sql.exec(`SELECT * FROM notes WHERE uid=? ORDER BY created DESC LIMIT 30`, a.id).toArray().map((r) => ({ id: String(r.id), kind: String(r.kind), data: JSON.parse(String(r.data || "{}")) as Json, created: Number(r.created), read: Boolean(r.read) }));
        const unread = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM notes WHERE uid=? AND read=0`, a.id).one().n);
        return { status: 200, body: { items, unread } };
      }

      case "notes-read": {
        const ids = strList(input.ids, 100);
        if (ids.length) for (const id of ids) this.sql.exec(`UPDATE notes SET read=1 WHERE uid=? AND id=?`, a.id, id);
        else this.sql.exec(`UPDATE notes SET read=1 WHERE uid=?`, a.id);
        return { status: 200, body: { ok: true } };
      }

      case "audio-delete": {
        const b = this.sql.exec(`SELECT * FROM blobs WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!b) return { status: 404, body: { error: "not_found" } };
        const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, String(b.sub)).toArray()[0];
        if (b.kind === "rec") {
          if (!(a.role === "student" && r?.student === a.id) && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
          if (a.role === "student" && r?.status === "approved") return { status: 409, body: { error: "already_approved" } };
          if (r) this.sql.exec(`UPDATE subs SET audio='' WHERE id=?`, String(r.id));
        } else {
          if (b.owner !== a.id && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
          if (r) this.sql.exec(`UPDATE subs SET comments=? WHERE id=?`, JSON.stringify((JSON.parse(String(r.comments || "[]")) as Json[]).filter((c) => c.audio !== b.id)), String(r.id));
        }
        await this.dropBlob(String(b.id));
        return { status: 200, body: { ok: true } };
      }

      case "catalog-save": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const kind = (["subject", "class", "section"] as const).find((k) => k === input.kind);
        const name = str(input.name, 40);
        if (!kind || !name) return { status: 400, body: { error: "name" } };
        const parent = kind === "section" ? str(input.parent, 40) : "";
        if (kind === "section" && !this.sql.exec(`SELECT id FROM catalog WHERE id=? AND kind='class'`, parent).toArray().length) return { status: 400, body: { error: "unknown_class" } };
        const id = str(input.id, 40);
        const dup = this.sql.exec(`SELECT id FROM catalog WHERE kind=? AND name=? AND parent=?`, kind, name, parent).toArray()[0];
        if (dup && String(dup.id) !== id) return { status: 409, body: { error: "duplicate" } };
        if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM catalog`).one().n) >= 500 && !id) return { status: 409, body: { error: "full" } };
        if (!id) {
          const nid = rid(kind[0]);
          this.sql.exec(`INSERT INTO catalog (id, kind, name, parent) VALUES (?, ?, ?, ?)`, nid, kind, name, parent);
          return { status: 200, body: { ok: true, id: nid, ...this.catalog() } };
        }
        const old = this.sql.exec(`SELECT * FROM catalog WHERE id=?`, id).toArray()[0];
        if (!old || old.kind !== kind) return { status: 404, body: { error: "not_found" } };
        const was = String(old.name);
        this.sql.exec(`UPDATE catalog SET name=?, parent=? WHERE id=?`, name, parent || String(old.parent || ""), id);
        if (was !== name) this.renameEverywhere(kind, was, name, kind === "section" ? this.className(String(old.parent)) : "");
        return { status: 200, body: { ok: true, id, ...this.catalog() } };
      }

      case "catalog-delete": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const r = this.sql.exec(`SELECT * FROM catalog WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        const n = String(r.name);
        const users = this.sql.exec(`SELECT cls, section, subjects, scope FROM users`).toArray();
        const scopeHas = (u: Record<string, unknown>, f: (s: string) => boolean) => (JSON.parse(String(u.scope || "[]")) as string[]).some(f);
        let used = 0;
        if (r.kind === "subject") used = users.filter((u) => (JSON.parse(String(u.subjects || "[]")) as string[]).includes(n)).length;
        if (r.kind === "class") used = users.filter((u) => u.cls === n || scopeHas(u, (s) => s.split("|")[0] === n)).length + Number(this.sql.exec(`SELECT COUNT(*) AS c FROM catalog WHERE parent=?`, String(r.id)).one().c) + Number(this.sql.exec(`SELECT COUNT(*) AS c FROM homework WHERE cls=?`, n).one().c);
        if (r.kind === "section") { const k = this.className(String(r.parent)); used = users.filter((u) => (u.cls === k && u.section === n) || scopeHas(u, (s) => s === `${k}|${n}`)).length + Number(this.sql.exec(`SELECT COUNT(*) AS c FROM homework WHERE cls=? AND section=?`, k, n).one().c); }
        if (used) return { status: 409, body: { error: "in_use", count: used } };
        this.sql.exec(`DELETE FROM catalog WHERE id=?`, String(r.id));
        return { status: 200, body: { ok: true, ...this.catalog() } };
      }

      case "pins-view": {
        // Admin only, deliberately not a teacher permission.
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        if (!(await pinKey(this.env))) return { status: 503, body: { error: "pin_key_missing" } };
        const ids = strList(input.ids, 3000);
        const rows = ids.length ? this.sql.exec(`SELECT id, pin_enc FROM users`).toArray().filter((r) => ids.includes(String(r.id))) : this.sql.exec(`SELECT id, pin_enc FROM users`).toArray();
        const pins: Record<string, string | null> = {};
        for (const r of rows) pins[String(r.id)] = await openPin(this.env, r.pin_enc);
        return { status: 200, body: { pins } };
      }

      case "hw-save": {
        if (!can(a, "assign")) return { status: 403, body: { error: "forbidden" } };
        const kind = input.kind === "quran" ? "quran" : "general";
        const title = str(input.title, 160);
        if (!title) return { status: 400, body: { error: "title" } };
        const d = (input.data && typeof input.data === "object" ? input.data : {}) as Json;
        let data: Json;
        if (kind === "quran") {
          const surah = Math.trunc(Number(d.surah));
          const from = Math.trunc(Number(d.from));
          const to = Math.trunc(Number(d.to));
          if (!(surah >= 1 && surah <= 114) || !(from >= 1) || !(to >= from) || to - from > 300) return { status: 400, body: { error: "verses" } };
          data = { surah, from, to, reciter: str(d.reciter, 60) || "Alafasy_128kbps", notes: str(d.notes, 1000), translit: d.translit === true, translation: d.translation === true };
        } else {
          const slides = (Array.isArray(d.slides) ? (d.slides as Json[]) : []).slice(0, 30).map((s) => ({ title: str(s.title, 160), text: str(s.text, 3000), image: /^https:\/\//.test(String(s.image || "")) ? str(s.image, 500) : "" }));
          data = { slides, question: str(d.question, 1000) };
        }
        const students = Array.isArray(input.students) ? (input.students as unknown[]).map((x) => str(x, 40)).filter(Boolean).slice(0, 500) : [];
        const cls = str(input.cls, 40);
        const section = cls ? str(input.section, 40) : "";
        if (a.role === "teacher" && a.scope?.length) {
          // Teachers limited to their classes/sections; picked students must be in scope too.
          const inScope = (c: string, sec: string) => a.scope!.some((x) => { const [k, s2] = x.split("|"); return k === c && (!s2 || s2 === sec); });
          if (students.length) {
            const rows = this.sql.exec(`SELECT id, cls, section FROM users WHERE role='student'`).toArray().filter((r) => students.includes(String(r.id)));
            if (rows.some((r) => !inScope(String(r.cls || ""), String(r.section || "")))) return { status: 403, body: { error: "out_of_scope" } };
          }
          if (cls && !(section ? inScope(cls, section) : a.scope.includes(cls))) return { status: 403, body: { error: "out_of_scope" } };
          if (!cls && !students.length) return { status: 403, body: { error: "out_of_scope" } };
        }
        const due = Number(input.due) > 0 ? Number(input.due) : null;
        const blob = JSON.stringify(data);
        if (input.id) {
          const r = this.sql.exec(`SELECT created_by FROM homework WHERE id=?`, str(input.id, 40)).toArray()[0];
          if (!r) return { status: 404, body: { error: "not_found" } };
          if (a.role !== "admin" && r.created_by !== a.id && !a.perms.includes("viewAll")) return { status: 403, body: { error: "forbidden" } };
          this.sql.exec(`UPDATE homework SET kind=?, title=?, cls=?, section=?, students=?, data=?, due=? WHERE id=?`, kind, title, cls, section, JSON.stringify(students), blob, due, str(input.id, 40));
          return { status: 200, body: { ok: true, id: str(input.id, 40) } };
        }
        if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM homework`).one().n) >= MAX_HW) return { status: 409, body: { error: "full" } };
        const id = rid("hw");
        this.sql.exec(`INSERT INTO homework (id, kind, title, cls, section, students, data, due, created_by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, kind, title, cls, section, JSON.stringify(students), blob, due, a.id, Date.now());
        this.notify(this.assignees({ cls, section, students }), "hw_new", { hw: id, title, by: a.name });
        return { status: 200, body: { ok: true, id } };
      }

      case "hw-delete": {
        if (!can(a, "assign")) return { status: 403, body: { error: "forbidden" } };
        const id = str(input.id, 40);
        const r = this.sql.exec(`SELECT created_by FROM homework WHERE id=?`, id).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (a.role !== "admin" && r.created_by !== a.id && !a.perms.includes("viewAll")) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`DELETE FROM homework WHERE id=?`, id);
        await this.dropBlobsOfSubs(this.sql.exec(`SELECT id FROM subs WHERE hw=?`, id).toArray().map((x) => String(x.id)));
        this.sql.exec(`DELETE FROM subs WHERE hw=?`, id);
        this.sql.exec(`DELETE FROM tracker WHERE hw=?`, id);
        return { status: 200, body: { ok: true } };
      }

      case "dashboard": {
        if (a.role === "student") {
          if (!a.viewAs) { this.touch(a.id); this.remind(a); }
          const hw = this.assignedTo(a).map((h) => { const sb = this.sub(h.id, a.id); return { ...h, sub: sb, locked: this.lockedFor(h, a.id), lockedBy: this.lockInfo(h, a.id), late: !!(h.due && ((sb?.submittedAt || 0) > h.due || (!(sb?.submittedAt) && h.due < Date.now()))) }; });
          return { status: 200, body: { homework: hw, tracker: this.trackerOf(a.id), progress: this.progressOf(a.id), leaderboard: this.setting("leaderboard", "off") !== "off" } };
        }
        const all = this.allHomework().filter((h) => a.role === "admin" || a.perms.includes("viewAll") || h.createdBy === a.id);
        const counts = new Map<string, Record<string, number>>();
        for (const s of this.sql.exec(`SELECT hw, status, COUNT(*) AS n FROM subs GROUP BY hw, status`).toArray()) {
          const c = counts.get(String(s.hw)) || {};
          c[String(s.status)] = Number(s.n);
          counts.set(String(s.hw), c);
        }
        const classes = this.sql.exec(`SELECT cls, COUNT(*) AS n FROM users WHERE role='student' AND disabled=0 GROUP BY cls ORDER BY cls`).toArray().map((r) => ({ cls: String(r.cls || ""), students: Number(r.n) }));
        const allStudents = this.sql.exec(`SELECT id, name, cls, section FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || "") }));
        // Teachers with a class/section scope only see their own pupils (admins and unscoped teachers see all).
        const scoped = a.role === "teacher" && (a.scope || []).length > 0;
        const okFor = (c: string, sec: string) => (a.scope || []).some((x) => { const [k, s2] = x.split("|"); return k === c && (!s2 || s2 === sec); });
        const students = scoped ? allStudents.filter((x) => okFor(x.cls, x.section)) : allStudents;
        const classesOut = scoped ? classes.map((c) => ({ ...c, students: students.filter((x) => x.cls === c.cls).length })).filter((c) => c.students > 0) : classes;
        return { status: 200, body: { homework: all.map((h) => ({ ...h, counts: counts.get(h.id) || {}, assigned: this.assignees(h).length })), classes: classesOut, students, catalog: this.catalog(), scope: a.scope || [] } };
      }

      case "hw": {
        const h = this.allHomework(str(input.id, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        if (a.role === "student") {
          if (!this.assignees(h).includes(a.id)) return { status: 403, body: { error: "forbidden" } };
          return { status: 200, body: { homework: { ...h, locked: this.lockedFor(h, a.id), lockedBy: this.lockInfo(h, a.id) }, sub: this.sub(h.id, a.id) } };
        }
        const names = new Map(this.sql.exec(`SELECT id, name, cls FROM users`).toArray().map((r) => [String(r.id), { name: String(r.name), cls: String(r.cls || "") }]));
        const subs = this.sql.exec(`SELECT * FROM subs WHERE hw=? ORDER BY updated DESC`, h.id).toArray().map((r) => ({ ...this.subOut(r), student: String(r.student), name: names.get(String(r.student))?.name ?? "?", cls: names.get(String(r.student))?.cls ?? "" }));
        const pending = this.assignees(h).filter((id) => !subs.some((s) => s.student === id)).map((id) => ({ id, name: names.get(id)?.name ?? "?" }));
        return { status: 200, body: { homework: h, subs, notStarted: pending } };
      }

      case "sub-save": {
        if (a.role !== "student") return { status: 403, body: { error: "students_only" } };
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h || !this.assignees(h).includes(a.id)) return { status: 404, body: { error: "not_found" } };
        if (this.lockedFor(h, a.id)) return { status: 409, body: { error: "locked" } };
        const cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
        if (cur?.status === "approved") return { status: 409, body: { error: "already_approved" } };
        const status = input.submit === true ? "submitted" : cur?.status === "returned" ? "returned" : "draft";
        const text = str(input.text, 4000);
        const practised = input.practised === true ? 1 : 0;
        if (cur) this.sql.exec(`UPDATE subs SET status=?, text=?, practised=?, updated=? WHERE id=?`, status, text, practised, Date.now(), String(cur.id));
        else this.sql.exec(`INSERT INTO subs (id, hw, student, status, text, practised, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`, rid("s"), h.id, a.id, status, text, practised, Date.now());
        this.touch(a.id);
        if (status === "submitted") this.sql.exec(`UPDATE subs SET submitted_at=? WHERE hw=? AND student=?`, Date.now(), h.id, a.id);
        if (status === "submitted" && cur?.status !== "submitted") this.notify([h.createdBy, "admin"], "sub_new", { hw: h.id, title: h.title, student: a.name });
        return { status: 200, body: { ok: true, sub: this.sub(h.id, a.id) } };
      }

      case "sub-review": {
        if (!can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        const comments = JSON.parse(String(r.comments || "[]")) as { by: string; text: string; at: number }[];
        const c = str(input.comment, 1000);
        if (c) comments.push({ by: a.name, text: c, at: Date.now() });
        const liked = typeof input.like === "boolean" ? (input.like ? 1 : 0) : Number(r.liked);
        const hq = this.allHomework(String(r.hw))[0];
        // Quran: three criteria (or a legacy colour) -> overall grade + generated feedback.
        let scores: Scores | null = hq?.kind === "quran" ? parseScores(input.scores) || (["green", "yellow", "red"].includes(String(input.grade)) ? fromGrade(String(input.grade)) : null) : null;
        const grade = scores ? overallOf(scores) : "";
        if (scores) scores = { ...scores, fb: buildFeedback(scores, JSON.parse(String(r.mistakes || "[]")) as { text: string; note?: string }[], c) };
        // Green/Yellow = passed (approved); Red = back to the student to practise the same verses again.
        let status = input.status === "approved" || input.status === "returned" ? String(input.status) : String(r.status);
        if (grade) status = grade === "red" ? "returned" : "approved";
        const attempts = JSON.parse(String(r.attempts || "[]")) as { n: number; audio: string; grade: string; by: string; at: number; scores?: Scores }[];
        if (grade) attempts.push({ n: attempts.length + 1, audio: String(r.audio || ""), grade, by: a.name, at: Date.now(), scores: scores || undefined });
        if (scores) this.sql.exec(`UPDATE subs SET scores=? WHERE id=?`, JSON.stringify(scores), String(r.id));
        this.sql.exec(`UPDATE subs SET comments=?, liked=?, status=?, grade=?, attempts=?, updated=? WHERE id=?`, JSON.stringify(comments.slice(-50)), liked, status, grade || String(r.grade || ""), JSON.stringify(attempts.slice(-30)), Date.now(), String(r.id));
        if (grade === "red") this.sql.exec(`UPDATE subs SET audio='', practised=0 WHERE id=?`, String(r.id));
        {
          const hh = this.allHomework(String(r.hw))[0];
          const nd = { hw: String(r.hw), title: hh?.title || "", by: a.name };
          if (grade) this.notify([String(r.student)], "graded", { ...nd, grade });
          else if (status !== String(r.status) && (status === "approved" || status === "returned")) this.notify([String(r.student)], status, nd);
          else if (c) this.notify([String(r.student)], "feedback", nd);
        }
        // Approving a Quran homework updates the student's tracker automatically.
        const h = this.allHomework(String(r.hw))[0];
        if (h?.kind === "quran") {
          // Tracker row per homework with its latest grade (red rows show as "needs practice", not learned).
          const d = h.data as { surah: number; from: number; to: number };
          const g = grade || (status === "approved" ? "green" : "");
          this.sql.exec(`DELETE FROM tracker WHERE hw=? AND student=?`, h.id, String(r.student));
          const sc = scores || parseScores(r.scores) || fromGrade(g);
          if (g) this.sql.exec(`INSERT INTO tracker (id, student, surah, from_ayah, to_ayah, hw, approved, grade, scores) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, rid("t"), String(r.student), d.surah, d.from, d.to, h.id, Date.now(), g, sc ? JSON.stringify(sc.fb ? sc : { ...sc, fb: buildFeedback(sc) }) : "");
        }
        return { status: 200, body: { ok: true } };
      }

      case "email-pin": {
        // Admin emails a user their username + PIN (from info@, Reply-To contact@).
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const u = this.userRow("id=?", str(input.id, 40));
        if (!u?.email) return { status: 400, body: { error: "no_email" } };
        const pin = u.pin_enc ? await openPin(this.env as LmsEnv, String(u.pin_enc)).catch(() => "") : "";
        if (!pin) return { status: 409, body: { error: "reset_pin_first" } };
        const ok = await sendAuto(this.env as LmsEnv, String(u.email), "Your sign-in details — Shaiq Muhammad", { heading: `Sign-in details for ${String(u.name)}`, paragraphs: ["Assalamu alaikum,", `Username: ${String(u.username)}`, `PIN: ${pin}`, "Keep this PIN private."], button: { label: "Sign in", url: "https://www.shaiqmuhammad.com/lms/login" }, note: "Automatic message — please don't reply. Questions: contact@shaiqmuhammad.com" }).catch(() => false);
        return ok ? { status: 200, body: { ok: true } } : { status: 503, body: { error: "mail_not_configured" } };
      }

      case "hw-unlock": {
        // Teacher/admin override: let one student work on a Quran homework even though earlier verses aren't passed yet (or re-lock).
        if (!can(a, "assign") && !can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        const sid = str(input.student, 40);
        if (input.__method === "POST") {
          if (input.unlock === false) this.sql.exec(`DELETE FROM unlocks WHERE hw=? AND student=?`, h.id, sid);
          else this.sql.exec(`INSERT OR IGNORE INTO unlocks (hw, student) VALUES (?, ?)`, h.id, sid);
        }
        const locks = this.assignees(h).map((s2) => ({ student: s2, name: String(this.userRow("id=?", s2)?.name || s2), section: String(this.userRow("id=?", s2)?.section || ""), lockedBy: this.lockInfo(h, s2), unlocked: this.sql.exec(`SELECT 1 FROM unlocks WHERE hw=? AND student=?`, h.id, s2).toArray().length > 0 }));
        return { status: 200, body: { ok: true, locks } };
      }
      case "qr-links": {
        // Teacher/admin: per-student QR tokens for one homework (created on demand; reset/revoke one).
        if (!can(a, "assign") && !can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        if (input.__method === "POST") {
          const sid = str(input.student, 40);
          if (input.revoke === true || input.reset === true) this.sql.exec(`DELETE FROM qr WHERE hw=? AND student=?`, h.id, sid);
          if (input.revoke === true) this.sql.exec(`INSERT INTO qr (token, hw, student, created) VALUES (?, ?, ?, 0)`, "revoked:" + rid("x"), h.id, sid);
        }
        const out = this.assignees(h).map((sid) => {
          const u = this.userRow("id=?", sid);
          let row = this.sql.exec(`SELECT token FROM qr WHERE hw=? AND student=?`, h.id, sid).toArray()[0];
          if (!row) {
            const tok = b64url(crypto.getRandomValues(new Uint8Array(18)));
            this.sql.exec(`INSERT INTO qr (token, hw, student, created) VALUES (?, ?, ?, ?)`, tok, h.id, sid, Date.now());
            row = { token: tok };
          }
          const t = String(row.token);
          return { student: sid, name: String(u?.name || "?"), cls: String(u?.cls || ""), section: String(u?.section || ""), token: t.startsWith("revoked:") ? "" : t };
        });
        return { status: 200, body: { links: out, teacher: a.name } };
      }

      case "viewas-log": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        return { status: 200, body: { items: this.sql.exec(`SELECT * FROM viewlog ORDER BY at DESC LIMIT 200`).toArray().map((r) => ({ uid: String(r.uid), name: String(r.name), role: String(r.role), at: Number(r.at) })) } };
      }

      case "contacts": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        if (input.__method === "POST" && input.id) {
          if (input.delete === true) this.sql.exec(`DELETE FROM contacts WHERE id=?`, str(input.id, 40));
          else this.sql.exec(`UPDATE contacts SET read=1 WHERE id=?`, str(input.id, 40));
        }
        const items = this.sql.exec(`SELECT * FROM contacts ORDER BY created DESC LIMIT 200`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email), subject: String(r.subject), message: String(r.message), created: Number(r.created), read: Boolean(r.read), emailed: Boolean(r.emailed) }));
        return { status: 200, body: { items, unread: items.filter((x) => !x.read).length } };
      }

      case "progress": {
        // Per-student tracker screen for teachers (in scope) and admin.
        const sid = str(input.id, 40);
        if (!this.canSeeStudent(a, sid)) return { status: 403, body: { error: "forbidden" } };
        const u = this.userRow("id=?", sid);
        if (!u || u.role !== "student") return { status: 404, body: { error: "not_found" } };
        const sa = this.actorOf(u);
        const hw = this.assignedTo(sa).map((h) => { const sb = this.sub(h.id, sid); return { id: h.id, title: h.title, kind: h.kind, data: h.data, due: h.due, status: sb?.status || "none", grade: sb?.grade || "", attempts: sb?.attempts?.length || 0, late: !!(h.due && ((sb?.submittedAt || 0) > h.due || (!(sb?.submittedAt) && h.due < Date.now()))) }; });
        return { status: 200, body: { student: this.publicUser(u), homework: hw, tracker: this.trackerOf(sid), progress: this.progressOf(sid), parentLink: String(u.parent_token || "") } };
      }

      case "quran-map": {
        // Class heatmap: students × surahs with best grade.
        if (!can(a, "review") && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
        const cls = str(input.cls, 40);
        const section = str(input.section, 40);
        const students = this.sql.exec(`SELECT * FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().filter((u) => (!cls || u.cls === cls) && (!section || u.section === section) && this.canSeeStudent(a, String(u.id)));
        const rank: Record<string, number> = { red: 1, yellow: 2, green: 3 };
        const rows = students.map((u) => {
          const cells: Record<number, { grade: string; verses: number; m?: number; t?: number; r?: number }> = {};
          for (const t of this.trackerOf(String(u.id))) {
            const c = cells[t.surah] || { grade: "", verses: 0 };
            // Per-criterion cell level = weakest level across that surah's passages (for the criterion filter).
            if (t.scores) for (const k of ["m", "t", "r"] as const) c[k] = Math.min(c[k] ?? 3, t.scores[k]);
            if (t.grade !== "red") c.verses += t.to - t.from + 1;
            if ((rank[t.grade] || 0) > (rank[c.grade] || 0)) c.grade = t.grade;
            cells[t.surah] = c;
          }
          return { id: String(u.id), name: String(u.name), cls: String(u.cls || ""), section: String(u.section || ""), cells };
        });
        const surahs = [...new Set(rows.flatMap((r) => Object.keys(r.cells).map(Number)))].sort((x, y) => y - x);
        return { status: 200, body: { rows, surahs } };
      }

      case "revise": {
        // Student marks a passed passage as revised -> next spaced interval.
        if (a.role !== "student") return { status: 403, body: { error: "students_only" } };
        const hw = str(input.hw, 40);
        this.sql.exec(`UPDATE tracker SET rev_count=rev_count+1, rev_at=? WHERE hw=? AND student=? AND grade!='red'`, Date.now(), hw, a.id);
        this.touch(a.id);
        return { status: 200, body: { ok: true, tracker: this.trackerOf(a.id) } };
      }

      case "practice": {
        // Any practice (repeat-after-me / memorisation test) counts for the streak.
        if (a.role === "student") this.touch(a.id);
        return { status: 200, body: { ok: true } };
      }

      case "settings": {
        if (input.__method === "POST") {
          if (!can(a, "assign") && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
          const v = ["off", "on", "top3"].includes(String(input.leaderboard)) ? String(input.leaderboard) : "off";
          this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('leaderboard', ?)`, v);
        }
        return { status: 200, body: { leaderboard: this.setting("leaderboard", "off") } };
      }

      case "leaderboard": {
        // Weekly stars within the student's class (or a chosen class for staff). Hidden unless a teacher turned it on.
        const mode = this.setting("leaderboard", "off");
        if (a.role === "student" && mode === "off") return { status: 403, body: { error: "leaderboard_off" } };
        const cls = a.role === "student" ? a.cls : str(input.cls, 40);
        const since = Date.now() - 7 * 864e5;
        const list = this.sql.exec(`SELECT id, name, cls FROM users WHERE role='student' AND disabled=0`).toArray().filter((u) => !cls || u.cls === cls).filter((u) => a.role === "student" || this.canSeeStudent(a, String(u.id)))
          .map((u) => ({ id: String(u.id), name: String(u.name), stars: this.progressOf(String(u.id), since).stars }))
          .filter((x) => x.stars > 0).sort((x, y) => y.stars - x.stars);
        const top = mode === "top3" && a.role === "student" ? list.slice(0, 3) : list.slice(0, 20);
        return { status: 200, body: { mode, cls, list: top.map((x, i) => ({ rank: i + 1, name: x.name, stars: x.stars, me: x.id === a.id })) } };
      }

      case "parent-link": {
        const sid = str(input.id, 40);
        if (!this.canSeeStudent(a, sid)) return { status: 403, body: { error: "forbidden" } };
        const u = this.userRow("id=?", sid);
        if (!u || u.role !== "student") return { status: 404, body: { error: "not_found" } };
        let tok = String(u.parent_token || "");
        if (!tok || input.reset === true || input.revoke === true) {
          tok = input.revoke === true ? "" : b64url(crypto.getRandomValues(new Uint8Array(24)));
          this.sql.exec(`UPDATE users SET parent_token=? WHERE id=?`, tok, sid);
        }
        return { status: 200, body: { token: tok } };
      }

      case "mistakes": {
        // Teacher marks mistakes on an exact verse/word of a Quran submission.
        if (!can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        const list = (Array.isArray(input.mistakes) ? (input.mistakes as Json[]) : []).slice(0, 100).map((m) => ({ ayah: Math.trunc(Number(m.ayah)) || 0, word: Math.trunc(Number(m.word)), text: str(m.text, 80), note: str(m.note, 300) })).filter((m) => m.ayah > 0);
        this.sql.exec(`UPDATE subs SET mistakes=?, updated=? WHERE id=?`, JSON.stringify(list), Date.now(), String(r.id));
        const h = this.allHomework(String(r.hw))[0];
        if (list.length) this.notify([String(r.student)], "mistakes", { hw: String(r.hw), title: h?.title || "", by: a.name, count: list.length });
        return { status: 200, body: { ok: true } };
      }

      case "export": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        const hw = this.allHomework().filter((h) => a.role === "admin" || a.perms.includes("viewAll") || h.createdBy === a.id);
        const ids = new Set(hw.map((h) => h.id));
        const users = this.sql.exec(`SELECT id, username, name, role, cls, section FROM users`).toArray().map((r) => ({ id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), cls: String(r.cls || ""), section: String(r.section || "") }));
        const subs = this.sql.exec(`SELECT * FROM subs ORDER BY updated`).toArray().filter((r) => ids.has(String(r.hw))).map((r) => ({ ...this.subOut(r), hw: String(r.hw), student: String(r.student) }));
        const tracker = this.sql.exec(`SELECT * FROM tracker ORDER BY approved`).toArray().map((r) => ({ student: String(r.student), surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), hw: String(r.hw), approved: Number(r.approved) }));
        return { status: 200, body: { exportedAt: Date.now(), homework: hw, subs, users, tracker } };
      }
    }
    return { status: 404, body: { error: "unknown_action" } };
  }

  private className(id: string) {
    return String(this.sql.exec(`SELECT name FROM catalog WHERE id=?`, id).toArray()[0]?.name ?? "");
  }
  /** Keeps users, homework and teacher scopes pointing at a renamed subject/class/section. */
  private renameEverywhere(kind: CatKind, was: string, now: string, inClass: string) {
    const users = this.sql.exec(`SELECT id, subjects, scope FROM users`).toArray();
    if (kind === "subject") {
      for (const u of users) { const l = JSON.parse(String(u.subjects || "[]")) as string[]; if (l.includes(was)) this.sql.exec(`UPDATE users SET subjects=? WHERE id=?`, JSON.stringify(l.map((x) => (x === was ? now : x))), String(u.id)); }
      return;
    }
    if (kind === "class") {
      this.sql.exec(`UPDATE users SET cls=? WHERE cls=?`, now, was);
      this.sql.exec(`UPDATE homework SET cls=? WHERE cls=?`, now, was);
    } else {
      this.sql.exec(`UPDATE users SET section=? WHERE cls=? AND section=?`, now, inClass, was);
      this.sql.exec(`UPDATE homework SET section=? WHERE cls=? AND section=?`, now, inClass, was);
    }
    for (const u of users) {
      const l = JSON.parse(String(u.scope || "[]")) as string[];
      const next = l.map((x) => { const [k, s2] = x.split("|"); if (kind === "class") return k === was ? [now, s2].filter(Boolean).join("|") : x; return k === inClass && s2 === was ? `${k}|${now}` : x; });
      if (next.join() !== l.join()) this.sql.exec(`UPDATE users SET scope=? WHERE id=?`, JSON.stringify(next), String(u.id));
    }
  }

  private async setPin(id: string, pin: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    this.sql.exec(`UPDATE users SET salt=?, hash=?, pin_enc=? WHERE id=?`, b64url(salt), await hashPin(pin, salt), await sealPin(this.env, pin), id);
    // A new PIN from the teacher/admin also lifts any sign-in lockout for that username.
    const u = this.sql.exec(`SELECT username FROM users WHERE id=?`, id).toArray()[0];
    if (u) this.sql.exec(`DELETE FROM fails WHERE k=?`, `u:${u.username}`);
  }
  private allHomework(id?: string) {
    const rows = id ? this.sql.exec(`SELECT * FROM homework WHERE id=?`, id).toArray() : this.sql.exec(`SELECT * FROM homework ORDER BY created DESC`).toArray();
    return rows.map((r) => ({ id: String(r.id), kind: String(r.kind) as "quran" | "general", title: String(r.title), cls: String(r.cls || ""), section: String(r.section || ""), students: JSON.parse(String(r.students || "[]")) as string[], data: JSON.parse(String(r.data || "{}")) as Json, due: r.due ? Number(r.due) : null, createdBy: String(r.created_by), created: Number(r.created) }));
  }
  /** Students a homework is for: the listed students, else everyone in its class ("" = all students). */
  private assignees(h: { cls: string; section: string; students: string[] }): string[] {
    // Target = individual students ∪ class/section members (no class and no students = everyone).
    if (!h.cls && h.students.length) return h.students;
    const rows = h.cls
      ? h.section
        ? this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0 AND cls=? AND section=?`, h.cls, h.section).toArray()
        : this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0 AND cls=?`, h.cls).toArray()
      : this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0`).toArray();
    return [...new Set([...h.students, ...rows.map((r) => String(r.id))])];
  }
  private assignedTo(a: Actor) {
    const sec = String(this.userRow("id=?", a.id)?.section || "");
    return this.allHomework().filter((h) => (h.students.includes(a.id) || (h.cls ? h.cls === a.cls && (!h.section || h.section === sec) : !h.students.length)));
  }
  private subOut(r: Record<string, unknown>) {
    return { id: String(r.id), status: String(r.status), text: String(r.text || ""), practised: Boolean(r.practised), liked: Boolean(r.liked), comments: JSON.parse(String(r.comments || "[]")) as { by: string; text: string; at: number; audio?: string }[], audio: String(r.audio || ""), grade: String(r.grade || ""), scores: parseScores(r.scores) || fromGrade(String(r.grade || "")), mistakes: JSON.parse(String(r.mistakes || "[]")) as { ayah: number; word: number; text: string; note: string }[], submittedAt: Number(r.submitted_at || 0), attempts: (JSON.parse(String(r.attempts || "[]")) as { n: number; audio: string; grade: string; by: string; at: number; scores?: Scores }[]).map((x) => ({ ...x, scores: x.scores || fromGrade(x.grade) || undefined })), updated: Number(r.updated) };
  }
  private sub(hw: string, student: string) {
    const r = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, hw, student).toArray()[0];
    return r ? this.subOut(r) : null;
  }
  private trackerOf(student: string) {
    return this.sql.exec(`SELECT surah, from_ayah, to_ayah, approved, grade, hw, rev_count, rev_at, scores FROM tracker WHERE student=? ORDER BY surah, from_ayah`, student).toArray().map((r) => {
      const revCount = Number(r.rev_count || 0);
      const last = Number(r.rev_at || 0) || Number(r.approved);
      const g = String(r.grade || "green");
      const revDue = g !== "red" ? last + REVISION_DAYS[Math.min(revCount, REVISION_DAYS.length - 1)] * 864e5 : 0;
      return { surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), approved: Number(r.approved), grade: g, hw: String(r.hw), revCount, revDue, scores: parseScores(r.scores) || fromGrade(g) };
    });
  }

  /** Marks today as an active day for streaks (Dubai day boundary). */
  private touch(student: string) {
    const day = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
    this.sql.exec(`INSERT OR IGNORE INTO activity (student, day) VALUES (?, ?)`, student, day);
  }

  /** Stars, streak and badges, computed from grades/submissions/activity. */
  private progressOf(student: string, since = 0) {
    const subs = this.sql.exec(`SELECT status, grade, updated FROM subs WHERE student=?`, student).toArray().filter((r) => Number(r.updated) >= since);
    const greens = subs.filter((r) => r.grade === "green").length;
    const yellows = subs.filter((r) => r.grade === "yellow").length;
    const handed = subs.filter((r) => r.status === "submitted" || r.status === "approved").length;
    const stars = greens * 3 + yellows * 2 + handed;
    const days = new Set(this.sql.exec(`SELECT day FROM activity WHERE student=?`, student).toArray().map((r) => String(r.day)));
    let streak = 0;
    const d0 = new Date(Date.now() + 4 * 3600e3);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    if (!days.has(key(d0))) d0.setUTCDate(d0.getUTCDate() - 1); // today not done yet: count up to yesterday
    while (days.has(key(d0))) { streak++; d0.setUTCDate(d0.getUTCDate() - 1); }
    const tracker = this.trackerOf(student).filter((t) => t.grade !== "red");
    const badges: string[] = [];
    if (handed >= 1) badges.push("first_step");
    if (greens >= 1) badges.push("first_green");
    if (greens >= 5) badges.push("five_greens");
    if (streak >= 3) badges.push("streak_3");
    if (streak >= 7) badges.push("streak_7");
    if (tracker.reduce((n, t) => n + (t.to - t.from + 1), 0) >= 50) badges.push("fifty_verses");
    if (tracker.some((t) => t.revCount >= 3)) badges.push("reviser");
    return { stars, streak, greens, yellows, handed, badges, activeDays: days.size };
  }

  /** Lazy reminders when a student opens the LMS: due within 24h / overdue, and revision due. One note per item per day. */
  private remind(a: Actor) {
    const now = Date.now();
    const today = new Date(now + 4 * 3600e3).toISOString().slice(0, 10);
    const sent = new Set(this.sql.exec(`SELECT data FROM notes WHERE uid=? AND kind IN ('reminder','revise') AND created > ?`, a.id, now - 864e5).toArray().map((r) => String((JSON.parse(String(r.data || "{}")) as Json).key || "")));
    for (const h of this.assignedTo(a)) {
      if (!h.due || this.lockedFor(h, a.id)) continue;
      const st = this.sql.exec(`SELECT status FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0]?.status;
      if (st === "submitted" || st === "approved") continue;
      if (h.due - now < 864e5) {
        const key = `due:${h.id}:${today}`;
        if (!sent.has(key)) this.notify([a.id], "reminder", { hw: h.id, title: h.title, key, overdue: h.due < now });
      }
    }
    for (const t of this.trackerOf(a.id)) {
      if (t.revDue && t.revDue <= now) {
        const key = `rev:${t.hw}:${today}`;
        if (!sent.has(key)) this.notify([a.id], "revise", { hw: t.hw, title: `${t.surah}:${t.from}-${t.to}`, surah: t.surah, from: t.from, to: t.to, key });
      }
    }
  }

  private canSeeStudent(a: Actor, sid: string): boolean {
    if (a.role === "admin") return true;
    if (a.role !== "teacher" || !can(a, "review")) return false;
    if (!a.scope?.length) return true;
    const u = this.userRow("id=?", sid);
    return !!u && a.scope.some((x) => { const [k, s2] = x.split("|"); return k === String(u.cls || "") && (!s2 || s2 === String(u.section || "")); });
  }

  /** Public contact form: store (always), rate-limit per IP (5/hour, 20/day site-wide per IP). */
  contactSave(ip: string, m: { name: string; email: string; subject: string; message: string }): { ok: boolean; id?: string; error?: string } {
    const now = Date.now();
    const recent = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM contacts WHERE ip=? AND created>?`, ip, now - 3600e3).one().n);
    const day = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM contacts WHERE ip=? AND created>?`, ip, now - 864e5).one().n);
    if (recent >= 5 || day >= 20) return { ok: false, error: "rate_limited" };
    const id = rid("c");
    this.sql.exec(`INSERT INTO contacts (id, name, email, subject, message, created, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, m.name, m.email, m.subject, m.message, now, ip);
    this.sql.exec(`DELETE FROM contacts WHERE created < ?`, now - 365 * 864e5);
    return { ok: true, id };
  }
  contactEmailed(id: string) {
    this.sql.exec(`UPDATE contacts SET emailed=1 WHERE id=?`, id);
  }

  /** Admin "view as" access log. */
  logViewAs(uid: string) {
    const u = this.userRow("id=?", uid);
    if (!u) return;
    const now = Date.now();
    // One log row per user per 10 minutes is enough.
    const last = this.sql.exec(`SELECT at FROM viewlog WHERE uid=? ORDER BY at DESC LIMIT 1`, uid).toArray()[0];
    if (!last || now - Number(last.at) > 600e3) this.sql.exec(`INSERT INTO viewlog (id, uid, name, role, at) VALUES (?, ?, ?, ?, ?)`, rid("v"), uid, String(u.name), String(u.role), now);
    this.sql.exec(`DELETE FROM viewlog WHERE at < ?`, now - 180 * 864e5);
  }

  /** QR token page: strictly one student + one homework, read-only. */
  qrView(token: string) {
    if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) return { status: 404, body: { error: "not_found" } };
    const q = this.sql.exec(`SELECT * FROM qr WHERE token=?`, token).toArray()[0];
    if (!q) return { status: 404, body: { error: "not_found" } };
    const h = this.allHomework(String(q.hw))[0];
    const u = this.userRow("id=?", String(q.student));
    if (!h || !u || u.disabled) return { status: 404, body: { error: "not_found" } };
    const sb = this.sub(h.id, String(u.id));
    const recs = [...new Set([...(sb?.attempts || []).map((x) => x.audio), sb?.audio || ""].filter(Boolean))];
    const d = h.data as { surah?: number; from?: number; to?: number; reciter?: string; translit?: boolean; translation?: boolean };
    const tracker = h.kind === "quran" ? this.trackerOf(String(u.id)).filter((t) => t.surah === d.surah) : [];
    return { status: 200, body: {
      student: String(u.name), cls: String(u.cls || ""), section: String(u.section || ""),
      homework: { title: h.title, kind: h.kind, data: h.kind === "quran" ? { surah: d.surah, from: d.from, to: d.to, reciter: d.reciter, translit: d.translit, translation: d.translation } : {} },
      status: sb?.status || "none", grade: sb?.grade || "", scores: sb?.scores || null,
      recordings: recs, attempts: (sb?.attempts || []).map((x) => ({ n: x.n, grade: x.grade, audio: x.audio, at: x.at, scores: x.scores })),
      feedback: (sb?.comments || []).map((c) => ({ by: c.by, text: c.text, audio: c.audio || "", at: c.at })),
      tracker,
    } };
  }

  async qrAudio(token: string, id: string): Promise<{ status: number; mime?: string; data?: ArrayBuffer }> {
    const q = this.sql.exec(`SELECT * FROM qr WHERE token=?`, token).toArray()[0];
    if (!q || !/^[A-Za-z0-9_-]{22,64}$/.test(token)) return { status: 404 };
    const b = this.sql.exec(`SELECT b.* FROM blobs b JOIN subs s ON s.id=b.sub WHERE b.id=? AND s.hw=? AND s.student=?`, id, String(q.hw), String(q.student)).toArray()[0];
    if (!b) return { status: 404 };
    const f = await this.files.get(id);
    if (!f) return { status: 404 };
    return { status: 200, mime: String(b.mime), data: f.body instanceof ArrayBuffer ? f.body : await new Response(f.body).arrayBuffer() };
  }

  /** Read-only parent view by secret token. */
  parentView(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 404, body: { error: "not_found" } };
    const u = this.sql.exec(`SELECT * FROM users WHERE parent_token=? AND role='student'`, token).toArray()[0];
    if (!u) return { status: 404, body: { error: "not_found" } };
    const a = this.actorOf(u);
    const hw = this.assignedTo(a).map((h) => { const sb = this.sub(h.id, a.id); return { id: h.id, title: h.title, kind: h.kind, due: h.due, status: sb?.status || "none", grade: sb?.grade || "", late: !!(h.due && ((sb?.submittedAt || 0) > h.due || (!sb?.submittedAt && h.due < Date.now()))), comments: (sb?.comments || []).filter((c) => c.text).map((c) => ({ by: c.by, text: c.text, at: c.at })) }; });
    return { status: 200, body: { name: String(u.name), cls: String(u.cls || ""), section: String(u.section || ""), homework: hw, tracker: this.trackerOf(a.id), progress: this.progressOf(a.id) } };
  }

  /** A Quran homework stays locked until every earlier Quran homework on the same surah is passed (green/yellow), unless staff unlocked it. */
  private lockedFor(h: ReturnType<LmsStore["allHomework"]>[number], student: string): boolean { return !!this.lockInfo(h, student); }
  private lockInfo(h: ReturnType<LmsStore["allHomework"]>[number], student: string): { surah: number; from: number; to: number; title: string } | null {
    if (h.kind !== "quran") return null;
    if (this.sql.exec(`SELECT 1 FROM unlocks WHERE hw=? AND student=?`, h.id, student).toArray().length) return null;
    const surah = Number((h.data as { surah?: number }).surah);
    const o = this.allHomework().filter((o) => {
      if (o.id === h.id || o.kind !== "quran" || o.created >= h.created || Number((o.data as { surah?: number }).surah) !== surah) return false;
      if (!this.assignees(o).includes(student)) return false;
      const st = this.sql.exec(`SELECT status FROM subs WHERE hw=? AND student=?`, o.id, student).toArray()[0];
      return st?.status !== "approved";
    }).sort((x, y) => x.created - y.created)[0];
    if (!o) return null;
    const d = o.data as { surah?: number; from?: number; to?: number };
    return { surah, from: Number(d.from) || 1, to: Number(d.to) || Number(d.from) || 1, title: o.title };
  }
}

export async function handleLms(request: Request, env: LmsEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const store = env.LMS.get(env.LMS.idFromName("main"));
  if (action === "qr-audio") {
    const q = new URL(request.url).searchParams;
    const r = (await store.qrAudio(str(q.get("t"), 80), str(q.get("id"), 40))) as unknown as { status: number; mime?: string; data?: ArrayBuffer };
    if (r.status !== 200 || !r.data) return reply(origin, { error: "not_found" }, 404);
    return new Response(r.data, { headers: { ...corsHeaders(origin), "Content-Type": r.mime || "audio/mpeg", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
  }
  if (action === "audio-upload" || action === "audio") {
    const a = await lmsActor(request, env, store);
    if (!a) return reply(origin, { error: "unauthorized" }, 401);
    if (a.viewAs && action !== "audio") return reply(origin, { error: "read_only" }, 403);
    const q = Object.fromEntries(new URL(request.url).searchParams) as Json;
    if (action === "audio") {
      const r = (await store.audioGet(a, str(q.id, 40))) as unknown as { status: number; mime?: string; data?: ArrayBuffer; error?: string };
      if (r.status !== 200 || !r.data) return reply(origin, { error: r.error }, r.status);
      return new Response(r.data, { headers: { ...corsHeaders(origin), "Content-Type": r.mime || "application/octet-stream", "Cache-Control": "private, max-age=86400" } });
    }
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (Number(request.headers.get("Content-Length") || 0) > MAX_AUDIO) return reply(origin, { error: "audio_too_long" }, 413);
    const buf = await request.arrayBuffer();
    const r = (await store.audioUpload(a, q, buf, request.headers.get("Content-Type") || "")) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  let body: Json = {};
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 200_000) return reply(origin, { error: "too_large" }, 413);
    try {
      body = JSON.parse(text || "{}") as Json;
    } catch {
      return reply(origin, { error: "bad_json" }, 400);
    }
  }
  if (action === "login") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (!env.SESSION_SIGNING_KEY) return reply(origin, { error: "not_configured" }, 503);
    const pin = str(body.pin, 8);
    if (!normUser(body.username) || !validPin(pin)) return reply(origin, { error: "bad_login" }, 401);
    const r = (await store.login(String(body.username), pin, request.headers.get("CF-Connecting-IP") || "?")) as unknown as Reply;
    if (r.status !== 200) return reply(origin, r.body, r.status);
    const ok = r.body as { uid: string; user: unknown };
    const t = await issueUserToken(env, ok.uid);
    return reply(origin, { ...t, user: ok.user });
  }
  if (action === "upload") {
    if (!blobStore(env).enabled) return reply(origin, { error: "storage_not_configured" }, 501);
    return reply(origin, { error: "not_implemented" }, 501);
  }
  if (action === "parent") {
    const r = (await store.parentView(str(new URL(request.url).searchParams.get("t") || body.t, 80))) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  if (action === "qr") {
    const r = (await store.qrView(str(new URL(request.url).searchParams.get("t") || body.t, 80))) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  const actor = await lmsActor(request, env, store);
  if (!actor) return reply(origin, { error: "unauthorized" }, 401);
  if (actor.viewAs && !VIEW_AS_READ.has(action)) return reply(origin, { error: "read_only" }, 403);
  const url = new URL(request.url);
  const input: Json = { ...Object.fromEntries(url.searchParams), ...body, __method: request.method };
  const r = (await store.handle(action, actor, input)) as unknown as Reply;
  return reply(origin, r.body, r.status);
}

/** A signed-in, active teacher holding an extra permission like "act:wall" or "host:<quiz>" (Classroom Activities access). */
export async function teacherWithPerm(request: Request, env: LmsEnv, perm: string): Promise<boolean> {
  const uid = await verifyUserToken(env, request.headers.get("Authorization"));
  if (!uid) return false;
  const u = (await env.LMS.get(env.LMS.idFromName("main")).actor(uid)) as unknown as Actor | null;
  return !!u && u.role === "teacher" && (u.perms.includes(perm) || u.perms.includes(perm.split(":")[0] + ":*"));
}

async function lmsActor(request: Request, env: LmsEnv, store: DurableObjectStub<LmsStore>): Promise<Actor | null> {
  const auth = request.headers.get("Authorization");
  if (await verifyToken(env, auth)) {
    // Admin "view as": read-only impersonation using ONLY the admin session (logged).
    const as = str(request.headers.get("X-View-As"), 40);
    if (as) {
      const u = (await store.actor(as)) as unknown as Actor | null;
      if (!u) return null;
      await store.logViewAs(as);
      return { ...u, viewAs: true };
    }
    return { id: "admin", role: "admin", name: "Admin", cls: "", perms: [...PERMS] };
  }
  const uid = await verifyUserToken(env, auth);
  return uid ? ((await store.actor(uid)) as unknown as Actor | null) : null;
}
