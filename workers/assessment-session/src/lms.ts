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
 *
 * PINs: the PBKDF2 hash is what login checks. A copy is also kept AES-GCM encrypted with the LMS_PIN_KEY secret
 * (32 random bytes, base64) so the admin can look a PIN up. Users created before that show "reset to view".
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply, verifyToken, type AdminEnv } from "./admin";
import { blobStore, type StorageEnv } from "./storage";

export interface LmsEnv extends AdminEnv, StorageEnv {
  LMS: DurableObjectNamespace<LmsStore>;
  /** base64 of 32 random bytes; enables admin PIN viewing. */
  LMS_PIN_KEY?: string;
}

type Json = Record<string, unknown>;
type Reply = { status: number; body: unknown };
export type Role = "student" | "teacher";
export type Actor = { id: string; role: Role | "admin"; name: string; cls: string; perms: string[]; scope?: string[] };
type CatKind = "subject" | "class" | "section";

const TOKEN_DAYS = 30;
const MAX_USERS = 3000;
const MAX_HW = 2000;
const FAIL_WINDOW = 15 * 60_000;
const PERMS = ["assign", "review", "manageUsers", "viewAll"] as const;
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
  constructor(ctx: DurableObjectState, env: LmsEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, cls TEXT, salt TEXT, hash TEXT, perms TEXT, disabled INTEGER DEFAULT 0, created INTEGER, last_login INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS homework (id TEXT PRIMARY KEY, kind TEXT, title TEXT, cls TEXT, students TEXT, data TEXT, due INTEGER, created_by TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, hw TEXT, student TEXT, status TEXT, text TEXT, practised INTEGER DEFAULT 0, liked INTEGER DEFAULT 0, comments TEXT DEFAULT '[]', updated INTEGER, UNIQUE (hw, student))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tracker (id TEXT PRIMARY KEY, student TEXT, surah INTEGER, from_ayah INTEGER, to_ayah INTEGER, hw TEXT UNIQUE, approved INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS fails (k TEXT, t INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, kind TEXT, name TEXT, parent TEXT DEFAULT '', ord INTEGER DEFAULT 0)`);
    const cols = (t: string) => new Set(this.sql.exec(`PRAGMA table_info(${t})`).toArray().map((r) => String(r.name)));
    const uc = cols("users");
    for (const [c, def] of [["section", "TEXT DEFAULT ''"], ["subjects", "TEXT DEFAULT '[]'"], ["scope", "TEXT DEFAULT '[]'"], ["pin_enc", "TEXT"]] as const) if (!uc.has(c)) this.sql.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
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
    return { id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role) as Role, cls: String(r.cls || ""), section: String(r.section || ""), subjects: JSON.parse(String(r.subjects || "[]")) as string[], scope: JSON.parse(String(r.scope || "[]")) as string[], perms: JSON.parse(String(r.perms || "[]")) as string[], disabled: Boolean(r.disabled), hasPin: Boolean(r.pin_enc), created: Number(r.created), lastLogin: r.last_login ? Number(r.last_login) : null };
  }
  private failCount(k: string) {
    this.sql.exec(`DELETE FROM fails WHERE t < ?`, Date.now() - FAIL_WINDOW);
    return Number(this.sql.exec(`SELECT COUNT(*) AS n FROM fails WHERE k=?`, k).one().n);
  }

  /** Resolves a user id from a token into an actor (null when unknown or disabled). */
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
    const ok = r && !r.disabled && safeEqual(await hashPin(pin, fromB64url(String(r.salt))), String(r.hash));
    if (!ok) {
      this.sql.exec(`INSERT INTO fails (k, t) VALUES (?, ?), (?, ?)`, `u:${u}`, Date.now(), `ip:${ip}`, Date.now());
      return { status: 401, body: { error: "bad_login" } };
    }
    this.sql.exec(`DELETE FROM fails WHERE k=?`, `u:${u}`);
    this.sql.exec(`UPDATE users SET last_login=? WHERE id=?`, Date.now(), String(r.id));
    return { status: 200, body: { uid: String(r.id), user: this.publicUser(r) } };
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
          const perms = role === "teacher" ? (Array.isArray(raw.perms) ? (raw.perms as unknown[]).map(String).filter((p) => (PERMS as readonly string[]).includes(p)) : ["assign", "review"]) : [];
          const cls = str(raw.cls, 40);
          const section = role === "student" ? str(raw.section, 40) : "";
          const subjects = role === "teacher" ? strList(raw.subjects) : [];
          const scope = role === "teacher" ? strList(raw.scope, 80) : [];
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
            this.sql.exec(`UPDATE users SET username=?, name=?, role=?, cls=?, section=?, subjects=?, scope=?, perms=?, disabled=? WHERE id=?`, username, name, role, cls, section, JSON.stringify(subjects), JSON.stringify(scope), JSON.stringify(perms), raw.disabled ? 1 : 0, String(existing.id));
            if (pin) await this.setPin(String(existing.id), pin);
          } else {
            if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM users`).one().n) >= MAX_USERS) { errors.push({ row: i + 1, username, error: "full" }); continue; }
            if (!pin) pin = newPin();
            const id = rid("u");
            this.sql.exec(`INSERT INTO users (id, username, name, role, cls, section, subjects, scope, perms, disabled, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, username, name, role, cls, section, JSON.stringify(subjects), JSON.stringify(scope), JSON.stringify(perms), raw.disabled ? 1 : 0, Date.now());
            await this.setPin(id, pin);
            pins.push({ username, name, pin });
          }
          saved++;
        }
        return { status: 200, body: { saved, pins, errors } };
      }

      case "user-delete": {
        if (!can(a, "manageUsers")) return { status: 403, body: { error: "forbidden" } };
        const r = this.userRow("id=?", str(input.id, 40));
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (r.role === "teacher" && a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        this.sql.exec(`DELETE FROM users WHERE id=?`, String(r.id));
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
          data = { surah, from, to, reciter: str(d.reciter, 60) || "Alafasy_128kbps", notes: str(d.notes, 1000) };
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
          } else if (!cls || !(section ? inScope(cls, section) : a.scope.includes(cls))) return { status: 403, body: { error: "out_of_scope" } };
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
        return { status: 200, body: { ok: true, id } };
      }

      case "hw-delete": {
        if (!can(a, "assign")) return { status: 403, body: { error: "forbidden" } };
        const id = str(input.id, 40);
        const r = this.sql.exec(`SELECT created_by FROM homework WHERE id=?`, id).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (a.role !== "admin" && r.created_by !== a.id && !a.perms.includes("viewAll")) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`DELETE FROM homework WHERE id=?`, id);
        this.sql.exec(`DELETE FROM subs WHERE hw=?`, id);
        this.sql.exec(`DELETE FROM tracker WHERE hw=?`, id);
        return { status: 200, body: { ok: true } };
      }

      case "dashboard": {
        if (a.role === "student") {
          const hw = this.assignedTo(a).map((h) => ({ ...h, sub: this.sub(h.id, a.id) }));
          return { status: 200, body: { homework: hw, tracker: this.trackerOf(a.id) } };
        }
        const all = this.allHomework().filter((h) => a.role === "admin" || a.perms.includes("viewAll") || h.createdBy === a.id);
        const counts = new Map<string, Record<string, number>>();
        for (const s of this.sql.exec(`SELECT hw, status, COUNT(*) AS n FROM subs GROUP BY hw, status`).toArray()) {
          const c = counts.get(String(s.hw)) || {};
          c[String(s.status)] = Number(s.n);
          counts.set(String(s.hw), c);
        }
        const classes = this.sql.exec(`SELECT cls, COUNT(*) AS n FROM users WHERE role='student' AND disabled=0 GROUP BY cls ORDER BY cls`).toArray().map((r) => ({ cls: String(r.cls || ""), students: Number(r.n) }));
        const students = this.sql.exec(`SELECT id, name, cls, section FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || "") }));
        return { status: 200, body: { homework: all.map((h) => ({ ...h, counts: counts.get(h.id) || {}, assigned: this.assignees(h).length })), classes, students, catalog: this.catalog(), scope: a.scope || [] } };
      }

      case "hw": {
        const h = this.allHomework(str(input.id, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        if (a.role === "student") {
          if (!this.assignees(h).includes(a.id)) return { status: 403, body: { error: "forbidden" } };
          return { status: 200, body: { homework: h, sub: this.sub(h.id, a.id) } };
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
        const cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
        if (cur?.status === "approved") return { status: 409, body: { error: "already_approved" } };
        const status = input.submit === true ? "submitted" : cur?.status === "returned" ? "returned" : "draft";
        const text = str(input.text, 4000);
        const practised = input.practised === true ? 1 : 0;
        if (cur) this.sql.exec(`UPDATE subs SET status=?, text=?, practised=?, updated=? WHERE id=?`, status, text, practised, Date.now(), String(cur.id));
        else this.sql.exec(`INSERT INTO subs (id, hw, student, status, text, practised, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`, rid("s"), h.id, a.id, status, text, practised, Date.now());
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
        const status = input.status === "approved" || input.status === "returned" ? String(input.status) : String(r.status);
        this.sql.exec(`UPDATE subs SET comments=?, liked=?, status=?, updated=? WHERE id=?`, JSON.stringify(comments.slice(-50)), liked, status, Date.now(), String(r.id));
        // Approving a Quran homework updates the student's tracker automatically.
        const h = this.allHomework(String(r.hw))[0];
        if (h?.kind === "quran") {
          if (status === "approved") {
            const d = h.data as { surah: number; from: number; to: number };
            this.sql.exec(`INSERT OR REPLACE INTO tracker (id, student, surah, from_ayah, to_ayah, hw, approved) VALUES (?, ?, ?, ?, ?, ?, ?)`, rid("t"), String(r.student), d.surah, d.from, d.to, h.id, Date.now());
          } else this.sql.exec(`DELETE FROM tracker WHERE hw=? AND student=?`, h.id, String(r.student));
        }
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
    if (h.students.length) return h.students;
    const rows = h.cls
      ? h.section
        ? this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0 AND cls=? AND section=?`, h.cls, h.section).toArray()
        : this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0 AND cls=?`, h.cls).toArray()
      : this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0`).toArray();
    return rows.map((r) => String(r.id));
  }
  private assignedTo(a: Actor) {
    const sec = String(this.userRow("id=?", a.id)?.section || "");
    return this.allHomework().filter((h) => (h.students.length ? h.students.includes(a.id) : !h.cls || (h.cls === a.cls && (!h.section || h.section === sec))));
  }
  private subOut(r: Record<string, unknown>) {
    return { id: String(r.id), status: String(r.status), text: String(r.text || ""), practised: Boolean(r.practised), liked: Boolean(r.liked), comments: JSON.parse(String(r.comments || "[]")) as { by: string; text: string; at: number }[], updated: Number(r.updated) };
  }
  private sub(hw: string, student: string) {
    const r = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, hw, student).toArray()[0];
    return r ? this.subOut(r) : null;
  }
  private trackerOf(student: string) {
    return this.sql.exec(`SELECT surah, from_ayah, to_ayah, approved FROM tracker WHERE student=? ORDER BY surah, from_ayah`, student).toArray().map((r) => ({ surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), approved: Number(r.approved) }));
  }
}

export async function handleLms(request: Request, env: LmsEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const store = env.LMS.get(env.LMS.idFromName("main"));
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
  const auth = request.headers.get("Authorization");
  let actor: Actor | null = null;
  if (await verifyToken(env, auth)) actor = { id: "admin", role: "admin", name: "Admin", cls: "", perms: [...PERMS] };
  else {
    const uid = await verifyUserToken(env, auth);
    if (uid) actor = (await store.actor(uid)) as unknown as Actor | null;
  }
  if (!actor) return reply(origin, { error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const input: Json = { ...Object.fromEntries(url.searchParams), ...body, __method: request.method };
  const r = (await store.handle(action, actor, input)) as unknown as Reply;
  return reply(origin, r.body, r.status);
}
