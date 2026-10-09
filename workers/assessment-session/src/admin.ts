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

export interface AdminEnv {
  ADMIN_GUARD: DurableObjectNamespace<AdminGuard>;
  FORUM_QUEUE: DurableObjectNamespace<import("./forum").ForumQueue>;
  GITHUB_PAT?: string;
  ADMIN_PASSWORD_SHA256?: string;
  SESSION_SIGNING_KEY?: string;
}

const REPO = "shaiqmuhammad/shaiqmuhammad-school-site";
const BRANCH = "main";
const SESSION_DAYS = 30;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
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

const ALLOWED_ORIGINS = new Set(["https://www.shaiqmuhammad.com", "https://shaiqmuhammad.com"]);

export function originAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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

async function issueToken(env: AdminEnv): Promise<{ token: string; exp: number }> {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = b64url(enc.encode(JSON.stringify({ sub: "admin", exp, n: b64url(crypto.getRandomValues(new Uint8Array(9))) })));
  const sig = b64url(await hmac(env.SESSION_SIGNING_KEY!, payload));
  return { token: `${payload}.${sig}`, exp };
}

export async function verifyToken(env: AdminEnv, header: string | null): Promise<{ exp: number } | null> {
  if (!env.SESSION_SIGNING_KEY || !header?.startsWith("Bearer ")) return null;
  const [payload, sig] = header.slice(7).trim().split(".");
  if (!payload || !sig) return null;
  const expected = b64url(await hmac(env.SESSION_SIGNING_KEY, payload));
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as { sub?: string; exp?: number };
    if (data.sub !== "admin" || !data.exp || data.exp < Date.now()) return null;
    return { exp: data.exp };
  } catch {
    return null;
  }
}

/** Per-IP failed-login counter (one tiny Durable Object per IP). */
export class AdminGuard extends DurableObject {
  private async recent(): Promise<number[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<number[]>("fails")) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  }
  async check(): Promise<number> {
    const list = await this.recent();
    return list.length >= MAX_FAILS ? Math.ceil((list[0] + FAIL_WINDOW_MS - Date.now()) / 1000) : 0;
  }
  async fail(): Promise<void> {
    const list = await this.recent();
    list.push(Date.now());
    await this.ctx.storage.put("fails", list.slice(-MAX_FAILS * 2));
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
}

type GhInit = { method?: string; body?: unknown };

export async function gh<T>(env: AdminEnv, path: string, init: GhInit = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
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
    const ref = await gh<{ object?: { sha: string } }>(env, `/git/ref/heads/${BRANCH}`);
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
    const upd = await gh(env, `/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: commit.data.sha, force: false } });
    if (upd.status === 200) {
      return {
        status: 200,
        body: { ok: true, commitSha: commit.data.sha, htmlUrl: `https://github.com/${REPO}/commit/${commit.data.sha}`, files: results },
      };
    }
    // 422 = main moved while we were working (another publish); rebuild on the new head.
    if (upd.status !== 422) return { status: 502, body: { error: "github_ref_update", githubStatus: upd.status } };
  }
  return { status: 409, body: { error: "busy_try_again" } };
}

export async function handleAdmin(request: Request, env: AdminEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(origin)) return reply(null, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const configured = Boolean(env.GITHUB_PAT && env.ADMIN_PASSWORD_SHA256 && env.SESSION_SIGNING_KEY);

  if (action === "ping") return reply(origin, { ok: true, configured });
  if (!configured) return reply(origin, { error: "not_configured" }, 503);

  if (action === "login") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const guard = env.ADMIN_GUARD.get(env.ADMIN_GUARD.idFromName(ip));
    const wait = await guard.check();
    if (wait > 0) return reply(origin, { error: "too_many_attempts", retryAfter: wait }, 429, { "Retry-After": String(wait) });
    let password = "";
    try {
      const body = (await request.json()) as { password?: unknown };
      password = typeof body?.password === "string" ? body.password : "";
    } catch {
      password = "";
    }
    const actual = password ? hex(await crypto.subtle.digest("SHA-256", enc.encode(password))) : "";
    if (!actual || !safeEqual(actual, env.ADMIN_PASSWORD_SHA256!.trim().toLowerCase())) {
      await guard.fail();
      return reply(origin, { error: "wrong_password" }, 401);
    }
    await guard.clear();
    return reply(origin, { ok: true, ...(await issueToken(env)) });
  }

  const session = await verifyToken(env, request.headers.get("Authorization"));
  if (!session) return reply(origin, { error: "unauthorized" }, 401);

  if (action === "status") return reply(origin, { ok: true, exp: session.exp, publishing: true });

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
