/**
 * Server-side publishing for the site admin, so no device ever needs a GitHub key.
 *
 *   POST /api/admin/login    {password}              -> {token, exp}   (30-day HMAC-signed session)
 *   GET  /api/admin/status   Authorization: Bearer   -> {ok, exp, publishing}
 *   POST /api/admin/publish  Authorization: Bearer   {files:[{path, content, encoding?, delete?}], message?}
 *        -> one commit on main with every changed file; identical files are skipped (no empty commits).
 *
 * Secrets (wrangler secret put): GITHUB_PAT, ADMIN_PASSWORD_SHA256, SESSION_SIGNING_KEY.
 * Failed logins are limited per IP (10 per 15 minutes) by the AdminGuard Durable Object.
 */
import { DurableObject } from "cloudflare:workers";
import { DEPLOY, initDeployment, ownHosts, servesThisSite, verifiedCandidate } from "./deployment";
import { CONTACT, FROM_NAME, INFO, MAIL_FOOTER, MAIL_HEADER, MAIL_LOGO, MAIL_SUN, SITE_NAME, SITE_URL, renderEmail, renderText, setMailIdentity } from "./mail/template";
import { autoFrom, mailReady, publicMailAllowedFrom, type MailEnv } from "./mail/mailbox";
import { safeLogoPath } from "./mail/identity";
import {
  checkPassword, deviceOf, hashPassword, IDLE_MS, maskIp, MAX_SESSION_MS, newBackupCodes, newTotpSecret, normBackup,
  otpauthUri, passwordProblem, sha256Hex, totpMatch, type AuthState, type LogEntry,
} from "./security";

export interface AdminEnv {
  ADMIN_GUARD: DurableObjectNamespace<AdminGuard>;
  FORUM_QUEUE: DurableObjectNamespace<import("./forum").ForumQueue>;
  GITHUB_PAT?: string;
  ADMIN_PASSWORD_SHA256?: string;
  SESSION_SIGNING_KEY?: string;
  MIGRATE_KEY?: string;
}

// Publishing target (per deployment: CONTENT_REPO / CONTENT_BRANCH, see ./deployment.ts).
const repo = () => DEPLOY.repo;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
/** All IPs together: this many wrong passwords in 15 minutes pauses sign-in for everyone (slows a spread-out attack). */
const GLOBAL_MAX_FAILS = 60;
const GLOBAL_LOCK_MS = 10 * 60 * 1000;
const AUTH_DO = "__auth__";
const GLOBAL_DO = "__global__";
const MAX_BODY_BYTES = 16_000_000;
const MAX_FILE_BYTES = 6_000_000;
const MAX_FILES = 20;

/** Only these places can be written: site content JSON, branding, covers and uploaded images. */
const ALLOWED_PATHS = [
  /^public\/content\/[A-Za-z0-9._-]+\.json$/,
  /^public\/brand\/[A-Za-z0-9._-]+$/,
  /^public\/covers\/[A-Za-z0-9._-]+$/,
  /^public\/uploads\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/,
];


/** Extra site address saved in Admin → Site & branding (only after it already serves this website). */
const extraOrigins = new Set<string>();
let originsAt = 0;
let siteBase = "";
export const BRAND_KEY = "site:brand";

type KvStub = { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void> };
const siteKv = (env: AdminEnv): KvStub | null => {
  const ns = (env as unknown as { SITE?: DurableObjectNamespace }).SITE;
  return ns ? (ns.get(ns.idFromName("main")) as unknown as KvStub) : null;
};

function applyCanonical(host: string) {
  extraOrigins.clear();
  if (host) {
    const bare = host.replace(/^www\./, "");
    extraOrigins.add(`https://${bare}`);
    extraOrigins.add(`https://www.${bare}`);
    siteBase = `https://${host}`;
  } else siteBase = DEPLOY.siteUrl;
}

/** Email identity from Admin → Site & branding (empty fields fall back to today's deployment defaults). */
function applyMail(b: { mail?: MailCfg; nameEn?: string; nameAr?: string; theme?: { header?: string; sun?: string } } | undefined) {
  const m = b?.mail;
  setMailIdentity({
    siteUrl: siteBase || DEPLOY.siteUrl,
    contact: m?.contact || DEPLOY.mailContact,
    info: m?.info || m?.contact || DEPLOY.mailInfo,
    fromName: m?.fromName || DEPLOY.mailFromName,
    siteName: (typeof b?.nameEn === "string" && b.nameEn.trim()) || (typeof b?.nameAr === "string" && b.nameAr.trim()) || DEPLOY.siteName,
    header: b?.theme?.header || "",
    sun: b?.theme?.sun || "",
    logoPath: m?.logoPath || "",
    siteLogoPath: m?.siteLogoPath || "",
    footer: m?.footer || "",
  });
}

/** Refreshes the saved main site address at most every 5 minutes per isolate (one small read). */
export async function loadSiteOrigin(env: AdminEnv, force = false): Promise<string> {
  initDeployment(env);
  if (!force && originsAt && Date.now() - originsAt < 300_000) return siteBase || DEPLOY.siteUrl;
  originsAt = Date.now();
  try {
    const raw = await siteKv(env)?.get(BRAND_KEY);
    const b = raw ? (JSON.parse(raw) as { canonical?: string; mail?: MailCfg; nameEn?: string; nameAr?: string; theme?: { header?: string; sun?: string } }) : {};
    const host = String(b.canonical || "");
    applyCanonical(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : "");
    applyMail(b);
  } catch {
    // keep the last known value
  }
  return siteBase || DEPLOY.siteUrl;
}
/** Main site address for links (default SITE_URL, school: https://www.shaiqmuhammad.com); refreshes in the background when stale. */
export function siteUrlFor(env: AdminEnv): string {
  initDeployment(env);
  if (Date.now() - originsAt >= 300_000) void loadSiteOrigin(env).catch(() => undefined);
  return siteBase || DEPLOY.siteUrl;
}

export function originAllowed(origin: string): boolean {
  if (DEPLOY.origins.includes(origin) || extraOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Other known addresses (e.g. almudarris.com) only while they really serve this website (live check, see ./deployment.ts).
  const m = /^https:\/\/([a-z0-9.-]+)$/.exec(origin);
  return Boolean(m && verifiedCandidate(m[1]));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-View-As",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && originAllowed(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function reply(origin: string | null, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin), ...extra },
  });
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return base64ToBytes(pad);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

type TokenData = { sub?: string; v?: number; exp?: number; lt?: number; pv?: number };

async function issueToken(env: AdminEnv, pv: number, lt = Date.now()): Promise<{ token: string; exp: number }> {
  const exp = Math.min(Date.now() + IDLE_MS, lt + MAX_SESSION_MS);
  const data: TokenData & { n: string } = { sub: "admin", v: 2, exp, lt, pv, n: b64url(crypto.getRandomValues(new Uint8Array(9))) };
  const payload = b64url(enc.encode(JSON.stringify(data)));
  const sig = b64url(await hmac(env.SESSION_SIGNING_KEY!, payload));
  return { token: `${payload}.${sig}`, exp };
}

const authStub = (env: AdminEnv) => env.ADMIN_GUARD.get(env.ADMIN_GUARD.idFromName(AUTH_DO));
let pvCache = { v: -1, at: 0 };
async function currentPv(env: AdminEnv): Promise<number> {
  if (pvCache.v >= 0 && Date.now() - pvCache.at < 10_000) return pvCache.v;
  const v = await authStub(env).pv();
  pvCache = { v, at: Date.now() };
  return v;
}

/**
 * Valid admin session: signed, v2, not expired (12 h idle / 7 days max) and issued for the current password
 * version (a password change or "sign out other devices" ends older sessions).
 */
export async function verifyToken(env: AdminEnv, header: string | null): Promise<{ exp: number; lt: number; pv: number } | null> {
  if (!env.SESSION_SIGNING_KEY || !header?.startsWith("Bearer ")) return null;
  const [payload, sig] = header.slice(7).trim().split(".");
  if (!payload || !sig) return null;
  const expected = b64url(await hmac(env.SESSION_SIGNING_KEY, payload));
  if (!safeEqual(sig, expected)) return null;
  let data: TokenData;
  try {
    data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as TokenData;
  } catch {
    return null;
  }
  const now = Date.now();
  if (data.sub !== "admin" || data.v !== 2 || !data.exp || data.exp < now || !data.lt || data.lt + MAX_SESSION_MS < now) return null;
  if (typeof data.pv !== "number" || data.pv !== (await currentPv(env))) return null;
  return { exp: data.exp, lt: data.lt, pv: data.pv };
}

/**
 * Failed-login counters (one tiny Durable Object per IP, plus "__global__" for all IPs together) and, in the
 * "__auth__" instance, the admin password hash / two-step secret / sign-in log. Never included in backups.
 */
export class AdminGuard extends DurableObject {
  private async recent(windowMs = FAIL_WINDOW_MS): Promise<number[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<number[]>("fails")) ?? []).filter((t) => now - t < windowMs);
  }
  /** Seconds to wait. Per IP: 3+ wrong tries add a growing pause (2, 4, 8 … 60 s); 10 in 15 min lock that IP for 15 min. */
  async check(): Promise<number> {
    const list = await this.recent();
    const now = Date.now();
    if (list.length >= MAX_FAILS) return Math.max(1, Math.ceil((list[list.length - MAX_FAILS] + FAIL_WINDOW_MS - now) / 1000));
    if (list.length >= 3) {
      const until = list[list.length - 1] + Math.min(2 ** (list.length - 2), 60) * 1000;
      if (until > now) return Math.ceil((until - now) / 1000);
    }
    return 0;
  }
  /** All IPs together (instance "__global__"). */
  async checkGlobal(): Promise<number> {
    const list = await this.recent();
    if (list.length < GLOBAL_MAX_FAILS) return 0;
    const until = list[list.length - 1] + GLOBAL_LOCK_MS;
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
  }
  async fail(): Promise<void> {
    const list = await this.recent();
    list.push(Date.now());
    await this.ctx.storage.put("fails", list.slice(-GLOBAL_MAX_FAILS * 2));
  }
  async clear(): Promise<void> {
    await this.ctx.storage.delete("fails");
  }
  /** Generic sliding-window limiter (used by forum submissions): true when this hit is allowed. */
  async hit(max: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const list = ((await this.ctx.storage.get<number[]>("hits")) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return false;
    list.push(now);
    await this.ctx.storage.put("hits", list);
    return true;
  }

  // ---- "__auth__" instance ----
  private async state(): Promise<AuthState> {
    return (await this.ctx.storage.get<AuthState>("auth")) ?? { pv: 1, log: [] };
  }
  async authGet(): Promise<AuthState> {
    return this.state();
  }
  async pv(): Promise<number> {
    return (await this.state()).pv;
  }
  /** Merge a change; bump=true ends every existing session. Returns the new password version. */
  async authUpdate(patch: Partial<Omit<AuthState, "pv" | "log">> & { clearPw?: boolean; clearTotp?: boolean; clearPending?: boolean }, bump = false, log?: LogEntry): Promise<number> {
    const s = await this.state();
    const { clearPw, clearTotp, clearPending, ...rest } = patch;
    const next: AuthState = { ...s, ...rest };
    if (clearPw) delete next.pw;
    if (clearTotp) delete next.totp;
    if (clearPending) delete next.pending;
    if (bump) next.pv = (s.pv || 1) + 1;
    if (log) next.log = [log, ...(s.log || [])].slice(0, 40);
    await this.ctx.storage.put("auth", next);
    return next.pv;
  }
  async authLog(e: LogEntry): Promise<void> {
    await this.authUpdate({}, false, e);
  }
  /** Uses one backup code (by SHA-256) — true when it was unused. */
  async useBackup(hash: string): Promise<boolean> {
    const s = await this.state();
    if (!s.totp?.enabled) return false;
    const i = s.totp.backup.indexOf(hash);
    if (i < 0) return false;
    s.totp.backup.splice(i, 1);
    await this.ctx.storage.put("auth", s);
    return true;
  }
  /** Records the TOTP step just used; false when that code (or a later one) was already used. */
  async useStep(step: number): Promise<boolean> {
    const s = await this.state();
    if (!s.totp?.enabled || step <= (s.totp.lastStep || 0)) return false;
    s.totp.lastStep = step;
    await this.ctx.storage.put("auth", s);
    return true;
  }
}

type GhInit = { method?: string; body?: unknown };

export async function gh<T>(env: AdminEnv, path: string, init: GhInit = {}): Promise<{ status: number; data: T }> {
  if (!env.GITHUB_PAT) return { status: 503, data: { error: "publishing_off", message: "Publishing is not set up for this site (no GitHub key)." } as unknown as T };
  const res = await fetch(`https://api.github.com/repos/${repo()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shaiqmuhammad-admin-worker",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 200) };
  }
  return { status: res.status, data: data as T };
}

/** Git's blob id for these bytes (lets us skip files that are already identical on main). */
async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = enc.encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header);
  all.set(bytes, header.length);
  return hex(await crypto.subtle.digest("SHA-1", all));
}

export type InFile = { path?: unknown; content?: unknown; encoding?: unknown; delete?: unknown; message?: unknown };
type FileResult = { path: string; status: "created" | "updated" | "deleted" | "unchanged" };

export async function publish(env: AdminEnv, files: InFile[], message: string): Promise<{ status: number; body: unknown }> {
  if (!Array.isArray(files) || files.length === 0) return { status: 400, body: { error: "no_files" } };
  if (files.length > MAX_FILES) return { status: 400, body: { error: "too_many_files" } };

  const prepared: { path: string; bytes: Uint8Array | null }[] = [];
  for (const f of files) {
    const path = String(f.path ?? "").replace(/^\/+/, "");
    if (path.includes("..") || !ALLOWED_PATHS.some((re) => re.test(path))) {
      return { status: 403, body: { error: "path_not_allowed", path } };
    }
    if (f.delete === true) {
      prepared.push({ path, bytes: null });
      continue;
    }
    if (typeof f.content !== "string") return { status: 400, body: { error: "missing_content", path } };
    let bytes: Uint8Array;
    try {
      bytes = f.encoding === "base64" ? base64ToBytes(f.content.replace(/^data:[^,]*,/, "")) : enc.encode(f.content);
    } catch {
      return { status: 400, body: { error: "bad_base64", path } };
    }
    if (bytes.length > MAX_FILE_BYTES) return { status: 413, body: { error: "file_too_large", path } };
    prepared.push({ path, bytes });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh<{ object?: { sha: string } }>(env, `/git/ref/heads/${DEPLOY.branch}`);
    if (ref.status !== 200 || !ref.data.object) return { status: 502, body: { error: "github_ref", githubStatus: ref.status } };
    const headSha = ref.data.object.sha;
    const head = await gh<{ tree?: { sha: string } }>(env, `/git/commits/${headSha}`);
    if (head.status !== 200 || !head.data.tree) return { status: 502, body: { error: "github_commit", githubStatus: head.status } };

    const results: FileResult[] = [];
    const tree: { path: string; mode: string; type: string; sha: string | null }[] = [];
    for (const f of prepared) {
      const cur = await gh<{ sha?: string; type?: string }>(env, `/contents/${f.path.split("/").map(encodeURIComponent).join("/")}?ref=${headSha}`);
      const existing = cur.status === 200 && cur.data && cur.data.type === "file" ? cur.data.sha : undefined;
      if (cur.status !== 200 && cur.status !== 404) return { status: 502, body: { error: "github_read", path: f.path, githubStatus: cur.status } };
      if (f.bytes === null) {
        if (!existing) results.push({ path: f.path, status: "unchanged" });
        else {
          tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
          results.push({ path: f.path, status: "deleted" });
        }
        continue;
      }
      if (existing && existing === (await gitBlobSha(f.bytes))) {
        results.push({ path: f.path, status: "unchanged" });
        continue;
      }
      const blob = await gh<{ sha?: string }>(env, `/git/blobs`, { method: "POST", body: { content: bytesToBase64(f.bytes), encoding: "base64" } });
      if (blob.status !== 201 || !blob.data.sha) return { status: 502, body: { error: "github_blob", path: f.path, githubStatus: blob.status } };
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.data.sha });
      results.push({ path: f.path, status: existing ? "updated" : "created" });
    }

    if (tree.length === 0) return { status: 200, body: { ok: true, unchanged: true, files: results } };

    const newTree = await gh<{ sha?: string }>(env, `/git/trees`, { method: "POST", body: { base_tree: head.data.tree.sha, tree } });
    if (newTree.status !== 201 || !newTree.data.sha) return { status: 502, body: { error: "github_tree", githubStatus: newTree.status } };
    const commit = await gh<{ sha?: string; html_url?: string }>(env, `/git/commits`, {
      method: "POST",
      body: { message, tree: newTree.data.sha, parents: [headSha] },
    });
    if (commit.status !== 201 || !commit.data.sha) return { status: 502, body: { error: "github_commit_create", githubStatus: commit.status } };
    const upd = await gh(env, `/git/refs/heads/${DEPLOY.branch}`, { method: "PATCH", body: { sha: commit.data.sha, force: false } });
    if (upd.status === 200) {
      return {
        status: 200,
        body: { ok: true, commitSha: commit.data.sha, htmlUrl: `https://github.com/${repo()}/commit/${commit.data.sha}`, files: results },
      };
    }
    // 422 = main moved while we were working (another publish); rebuild on the new head.
    if (upd.status !== 422) return { status: 502, body: { error: "github_ref_update", githubStatus: upd.status } };
  }
  return { status: 409, body: { error: "busy_try_again" } };
}

type Body = Record<string, unknown>;
async function bodyOf(request: Request): Promise<Body> {
  try {
    const b = (await request.json()) as Body;
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}
const sv = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

function logEntry(request: Request, ok: boolean, what: string): LogEntry {
  const cf = (request as unknown as { cf?: { country?: string; city?: string } }).cf;
  return {
    t: Date.now(),
    ok,
    what,
    ua: deviceOf(request.headers.get("User-Agent") || ""),
    ip: maskIp(request.headers.get("CF-Connecting-IP") || ""),
    where: [cf?.city, cf?.country].filter(Boolean).join(", ").slice(0, 60),
  };
}

/** Rate limits shared by sign-in and every "confirm your password" step. Returns a 429 Response or null. */
async function guardWait(request: Request, env: AdminEnv, origin: string | null) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const guard = env.ADMIN_GUARD.get(env.ADMIN_GUARD.idFromName(ip));
  const global = env.ADMIN_GUARD.get(env.ADMIN_GUARD.idFromName(GLOBAL_DO));
  const wait = Math.max(await guard.check(), await global.checkGlobal());
  const res = wait > 0 ? reply(origin, { error: "too_many_attempts", retryAfter: wait }, 429, { "Retry-After": String(wait) }) : null;
  return { res, fail: async () => { await guard.fail(); await global.fail(); }, clear: () => guard.clear() };
}

/** Two-step code (6 digits) or a one-time backup code. */
async function checkSecondStep(env: AdminEnv, st: AuthState, code: string): Promise<boolean> {
  if (!st.totp?.enabled) return true;
  const c = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    const step = await totpMatch(st.totp.secret, c, st.totp.lastStep || 0);
    return step > 0 && (await authStub(env).useStep(step));
  }
  const n = normBackup(c);
  return n.length === 8 && (await authStub(env).useBackup(await sha256Hex(n)));
}

/* ---------- Site & branding (public read, admin write) ---------- */
export type MailCfg = { fromName?: string; contact?: string; info?: string; footer?: string; logoPath?: string; siteLogoPath?: string };
const EMAIL = /^[^\s@<>"]{1,64}@[a-z0-9.-]+\.[a-z]{2,24}$/i;
function normMail(raw: unknown): MailCfg {
  const r = (raw && typeof raw === "object" ? raw : {}) as Body;
  const e = (v: unknown) => (EMAIL.test(sv(v, 120).trim()) ? sv(v, 120).trim().toLowerCase() : "");
  const logo = (v: unknown) => safeLogoPath(sv(v, 80));
  return {
    fromName: clean(r.fromName, 60),
    contact: e(r.contact),
    info: e(r.info),
    footer: clean(r.footer, 200),
    logoPath: logo(r.logoPath),
    siteLogoPath: logo(r.siteLogoPath),
  };
}
function normPresets(raw: unknown): Body[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((p, i) => {
    const r = (p && typeof p === "object" ? p : {}) as Body;
    const th = (r.theme && typeof r.theme === "object" ? r.theme : {}) as Body;
    return {
      id: clean(r.id, 30).replace(/[^a-z0-9-]/gi, "") || `p${i + 1}`,
      label: clean(r.label, 40) || `Preset ${i + 1}`,
      nameEn: clean(r.nameEn, 60), nameAr: clean(r.nameAr, 60), taglineEn: clean(r.taglineEn, 140), taglineAr: clean(r.taglineAr, 140),
      theme: { preset: clean(th.preset, 30), header: HEX.test(sv(th.header)) ? sv(th.header).toLowerCase() : "", sun: HEX.test(sv(th.sun)) ? sv(th.sun).toLowerCase() : "", mode: th.mode === "dark" ? "dark" : "light" },
    };
  });
}
const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v: unknown, max: number) => sv(v, max).replace(/[<>\u0000-\u001f]/g, "").trim();
function normBrand(raw: Body, prevCanonical = "", prev: Body = {}): Body {
  const th = (raw.theme && typeof raw.theme === "object" ? raw.theme : {}) as Body;
  return {
    nameEn: clean(raw.nameEn, 60),
    nameAr: clean(raw.nameAr, 60),
    taglineEn: clean(raw.taglineEn, 140),
    taglineAr: clean(raw.taglineAr, 140),
    theme: {
      preset: clean(th.preset, 30),
      header: HEX.test(sv(th.header)) ? sv(th.header).toLowerCase() : "",
      sun: HEX.test(sv(th.sun)) ? sv(th.sun).toLowerCase() : "",
      mode: th.mode === "dark" ? "dark" : "light",
    },
    canonical: prevCanonical,
    mail: normMail(raw.mail !== undefined ? raw.mail : prev.mail),
    presets: normPresets(raw.presets !== undefined ? raw.presets : prev.presets),
    updatedAt: Date.now(),
  };
}
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export async function handleAdmin(request: Request, env: AdminEnv, action: string): Promise<Response> {
  initDeployment(env);
  const origin = request.headers.get("Origin");
  await loadSiteOrigin(env);
  if (origin && !originAllowed(origin)) return reply(null, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  // Sign-in only needs the password + signing key; publishing to GitHub is optional per deployment (GITHUB_PAT).
  const configured = Boolean(env.ADMIN_PASSWORD_SHA256 && env.SESSION_SIGNING_KEY);

  if (action === "ping") return reply(origin, { ok: true, configured, publishing: Boolean(env.GITHUB_PAT), site: DEPLOY.siteId });

  // Public: site name, tagline, colours and main address (read by every page at runtime).
  if (action === "brand" && request.method === "GET") {
    const raw = await siteKv(env)?.get(BRAND_KEY);
    return new Response(JSON.stringify({ ok: true, brand: raw ? JSON.parse(raw) : null }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60", ...corsHeaders(origin) },
    });
  }

  if (!configured) return reply(origin, { error: "not_configured" }, 503);

  // Emergency reset (assistant only, with the deploy-time MIGRATE_KEY): forget the changed password and two-step
  // sign-in so the original ADMIN_PASSWORD_SHA256 secret works again. Ends every session.
  if (action === "reset-auth") {
    if (request.method !== "POST" || !env.MIGRATE_KEY || request.headers.get("X-Migrate-Key") !== env.MIGRATE_KEY) return reply(origin, { error: "not_found" }, 404);
    await authStub(env).authUpdate({ clearPw: true, clearTotp: true, clearPending: true }, true, logEntry(request, true, "reset"));
    pvCache = { v: -1, at: 0 };
    return reply(origin, { ok: true });
  }

  if (action === "login") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    const g = await guardWait(request, env, origin);
    if (g.res) return g.res;
    const body = await bodyOf(request);
    const password = sv(body.password);
    const st = await authStub(env).authGet();
    if (!(await checkPassword(st, env.ADMIN_PASSWORD_SHA256, password))) {
      await g.fail();
      await authStub(env).authLog(logEntry(request, false, "wrong_password"));
      return reply(origin, { error: "wrong_password" }, 401);
    }
    if (st.totp?.enabled) {
      const code = sv(body.code, 40);
      if (!code) return reply(origin, { error: "code_required" }, 401);
      if (!(await checkSecondStep(env, st, code))) {
        await g.fail();
        await authStub(env).authLog(logEntry(request, false, "wrong_code"));
        return reply(origin, { error: "wrong_code" }, 401);
      }
    }
    await g.clear();
    await authStub(env).authLog(logEntry(request, true, st.totp?.enabled ? "signin_2step" : "signin"));
    return reply(origin, { ok: true, ...(await issueToken(env, st.pv)) });
  }

  const session = await verifyToken(env, request.headers.get("Authorization"));
  if (!session) return reply(origin, { error: "unauthorized" }, 401);

  if (action === "status") return reply(origin, { ok: true, exp: session.exp, publishing: Boolean(env.GITHUB_PAT) });

  // Mail account: connected or not only (never the app password or the Apple ID). Allowed From list is the public aliases.
  if (action === "mail-status") {
    const menv = env as unknown as MailEnv;
    return reply(origin, {
      ok: true,
      mailConnected: mailReady(menv),
      allowedFrom: publicMailAllowedFrom(menv),
    });
  }

  // Main address card: which known addresses open THIS website right now (live check) and are accepted here.
  if (action === "domain-status") {
    const kv = siteKv(env);
    const raw = kv ? await kv.get(BRAND_KEY) : null;
    const canonical = raw ? sv((JSON.parse(raw) as Body).canonical, 253) : "";
    const hosts = [...new Set([...ownHosts(), ...DEPLOY.candidates, ...(canonical ? [canonical] : [])])].slice(0, 12);
    const rows = await Promise.all(hosts.map(async (h) => {
      const own = ownHosts().includes(h);
      const serves = await servesThisSite(h, true);
      return { host: h, own, serves, accepted: serves && (own || DEPLOY.candidates.includes(h) || h === canonical) };
    }));
    return reply(origin, { ok: true, site: DEPLOY.siteId, main: canonical || DEPLOY.siteUrl.replace(/^https:\/\//, ""), defaultMain: DEPLOY.siteUrl.replace(/^https:\/\//, ""), hosts: rows });
  }

  // Sliding 12-hour session (never past 7 days from sign-in).
  if (action === "refresh") return reply(origin, { ok: true, ...(await issueToken(env, session.pv, session.lt)) });

  if (action === "security" && request.method === "GET") {
    const st = await authStub(env).authGet();
    return reply(origin, {
      ok: true,
      changedPassword: Boolean(st.pw),
      changedAt: st.pw?.changedAt || 0,
      twoStep: Boolean(st.totp?.enabled),
      twoStepSince: st.totp?.enabledAt || 0,
      backupLeft: st.totp?.backup.length || 0,
      log: (st.log || []).slice(0, 20),
      session: { since: session.lt, exp: session.exp, maxEnd: session.lt + MAX_SESSION_MS },
      policy: { minLength: 10, idleHours: IDLE_MS / 3600_000, maxDays: MAX_SESSION_MS / 864e5 },
    });
  }

  const POST_ONLY = ["change-password", "signout-all", "totp-setup", "totp-enable", "totp-disable", "totp-backup", "brand-save", "domain-check", "mail-preview"];
  if (POST_ONLY.includes(action)) {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    const body = await bodyOf(request);
    const auth = authStub(env);

    if (action === "brand-save" || action === "domain-check") {
      const kv = siteKv(env);
      if (!kv) return reply(origin, { error: "not_configured" }, 503);
      const prevRaw = await kv.get(BRAND_KEY);
      const prev = prevRaw ? (JSON.parse(prevRaw) as Body) : {};
      if (action === "brand-save") {
        const b = normBrand((body.brand && typeof body.brand === "object" ? body.brand : {}) as Body, sv(prev.canonical, 253), prev);
        await kv.set(BRAND_KEY, JSON.stringify(b));
        await loadSiteOrigin(env, true);
        return reply(origin, { ok: true, brand: b });
      }
      // Main site address: only saved once the new address already opens this website (so links never break).
      const host = sv(body.domain, 260).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const defHost = DEPLOY.siteUrl.replace(/^https:\/\//, "");
      if (body.clear === true || host === "" || host === defHost) {
        const b = { ...prev, canonical: "", updatedAt: Date.now() };
        await kv.set(BRAND_KEY, JSON.stringify(b));
        await loadSiteOrigin(env, true);
        return reply(origin, { ok: true, brand: b, connected: true });
      }
      if (!HOST_RE.test(host)) return reply(origin, { error: "bad_domain" }, 400);
      const connected = await servesThisSite(host, true);
      if (!connected) return reply(origin, { ok: false, error: "not_connected", domain: host }, 409);
      const b = { ...prev, canonical: host, updatedAt: Date.now() };
      await kv.set(BRAND_KEY, JSON.stringify(b));
      await loadSiteOrigin(env, true);
      return reply(origin, { ok: true, brand: b, connected: true });
    }

    if (action === "mail-preview") {
      const menv = env as unknown as MailEnv;
      const kv = siteKv(env);
      const prevRaw = kv ? await kv.get(BRAND_KEY) : null;
      const saved = prevRaw ? (JSON.parse(prevRaw) as Body) : {};
      const draft = (body.brand && typeof body.brand === "object" ? body.brand : null) as Body | null;
      applyMail(draft ? normBrand(draft, sv(saved.canonical, 253), saved) : saved);
      const from = autoFrom(menv);
      const sample = {
        heading: "Sample email",
        paragraphs: ["Assalamu alaikum,", "This is a preview of how automatic emails look with the current name, colours and logo. Nothing was sent."],
        button: { label: "Open the website", url: SITE_URL },
        note: "Preview only — this message was not sent.",
      };
      const html = renderEmail(sample);
      const text = renderText(sample);
      applyMail(saved);
      return reply(origin, {
        ok: true,
        html,
        text,
        from: from.from,
        fromFellBack: from.fellBack,
        fromName: `${FROM_NAME} (no-reply)`,
        replyTo: CONTACT,
        info: INFO,
        contact: CONTACT,
        siteName: SITE_NAME,
        siteUrl: SITE_URL,
        logoUrl: MAIL_LOGO,
        footer: MAIL_FOOTER,
        header: MAIL_HEADER,
        sun: MAIL_SUN,
        mailConnected: mailReady(menv),
        allowedFrom: publicMailAllowedFrom(menv),
      });
    }

    if (action === "signout-all") {
      const pv = await auth.authUpdate({}, true, logEntry(request, true, "signout_all"));
      pvCache = { v: pv, at: Date.now() };
      return reply(origin, { ok: true, ...(await issueToken(env, pv)) });
    }

    // Everything below re-checks the password (rate-limited like sign-in).
    const g = await guardWait(request, env, origin);
    if (g.res) return g.res;
    const st = await auth.authGet();
    if (action !== "totp-enable") {
      if (!(await checkPassword(st, env.ADMIN_PASSWORD_SHA256, sv(body.current ?? body.password)))) {
        await g.fail();
        await auth.authLog(logEntry(request, false, `${action}:wrong_password`));
        return reply(origin, { error: "wrong_password" }, 401);
      }
    }

    if (action === "change-password") {
      const next = sv(body.next, 300);
      const problem = passwordProblem(next);
      if (problem) return reply(origin, { error: problem }, 400);
      if (await checkPassword(st, env.ADMIN_PASSWORD_SHA256, next)) return reply(origin, { error: "same_as_old" }, 400);
      if (st.totp?.enabled && !(await checkSecondStep(env, st, sv(body.code, 40)))) {
        await g.fail();
        return reply(origin, { error: body.code ? "wrong_code" : "code_required" }, 401);
      }
      const pw = await hashPassword(next);
      const pv = await auth.authUpdate({ pw }, true, logEntry(request, true, "password_changed"));
      pvCache = { v: pv, at: Date.now() };
      await g.clear();
      return reply(origin, { ok: true, ...(await issueToken(env, pv)) });
    }

    if (action === "totp-setup") {
      if (st.totp?.enabled) return reply(origin, { error: "already_on" }, 409);
      const secret = newTotpSecret();
      await auth.authUpdate({ pending: { secret, at: Date.now() } });
      return reply(origin, { ok: true, secret, uri: otpauthUri(secret, "admin", DEPLOY.siteId === "shaiqmuhammad-school-site" ? "Shaiq Admin" : `${DEPLOY.siteName} Admin`) });
    }
    if (action === "totp-enable") {
      const pend = st.pending;
      if (!pend || Date.now() - pend.at > 30 * 60_000) return reply(origin, { error: "setup_expired" }, 400);
      const step = await totpMatch(pend.secret, sv(body.code, 20), 0);
      if (step < 0) {
        await g.fail();
        return reply(origin, { error: "wrong_code" }, 401);
      }
      const codes = newBackupCodes();
      const backup = await Promise.all(codes.map((c) => sha256Hex(normBackup(c))));
      await auth.authUpdate({ totp: { secret: pend.secret, enabled: true, backup, lastStep: step, enabledAt: Date.now() }, clearPending: true }, false, logEntry(request, true, "two_step_on"));
      await g.clear();
      return reply(origin, { ok: true, backupCodes: codes });
    }
    if (action === "totp-disable" || action === "totp-backup") {
      if (!st.totp?.enabled) return reply(origin, { error: "not_on" }, 409);
      if (!(await checkSecondStep(env, st, sv(body.code, 40)))) {
        await g.fail();
        return reply(origin, { error: "wrong_code" }, 401);
      }
      await g.clear();
      if (action === "totp-disable") {
        await auth.authUpdate({ clearTotp: true }, false, logEntry(request, true, "two_step_off"));
        return reply(origin, { ok: true });
      }
      const fresh = await auth.authGet();
      const codes = newBackupCodes();
      const backup = await Promise.all(codes.map((c) => sha256Hex(normBackup(c))));
      if (fresh.totp) await auth.authUpdate({ totp: { ...fresh.totp, backup } }, false, logEntry(request, true, "backup_codes_new"));
      return reply(origin, { ok: true, backupCodes: codes });
    }
  }

  if (action === "publish") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) return reply(origin, { error: "too_large" }, 413);
    let body: { files?: InFile[]; message?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return reply(origin, { error: "bad_json" }, 400);
    }
    const files = body?.files ?? [];
    const first = Array.isArray(files) && files[0] && typeof files[0].message === "string" ? files[0].message : "";
    const message = String((typeof body.message === "string" && body.message) || first || "chore(admin): publish via admin").slice(0, 500);
    const r = await publish(env, files, message);
    return reply(origin, r.body, r.status);
  }

  return reply(origin, { error: "not_found" }, 404);
}
