/**
 * Moderated kids forum: students submit, the teacher approves.
 *
 *   POST /api/forum/submit   (public)  {kind:"thread"|"reply", threadId?, author, title?, body, website?, elapsedMs?}
 *        -> {ok:true, pending:true}. Limits: 5 per 10 min per IP, length checks, link/spam checks,
 *           honeypot field "website" and a minimum fill time (bots get a silent ok and are dropped).
 *   GET  /api/forum/count    (admin Bearer) -> {count}
 *   GET  /api/forum/pending  (admin Bearer) -> {items}
 *   POST /api/forum/approve  (admin Bearer) {id, edits?:{author,title,body}}
 *        -> merges the post into public/content/forum.json on main (one commit) -> {ok, commitSha, forum}
 *   POST /api/forum/reject   (admin Bearer) {id} -> {ok}
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, gh, originAllowed, publish, reply, verifyToken, type AdminEnv } from "./admin";

const FORUM_PATH = "public/content/forum.json";
const MAX_PENDING = 500;
const SUBMIT_MAX = 5;
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
const MIN_FILL_MS = 2500;
const DEDUPE_MS = 60 * 60 * 1000;

export type PendingPost = {
  id: string;
  kind: "thread" | "reply";
  threadId?: string;
  author: string;
  title?: string;
  body: string;
  createdAt: string;
};

/** Single instance ("queue") holding posts that wait for the teacher. */
export class ForumQueue extends DurableObject {
  async add(post: PendingPost, fingerprint: string): Promise<"ok" | "duplicate" | "full"> {
    const now = Date.now();
    const seen = (await this.ctx.storage.get<Record<string, number>>("seen")) ?? {};
    for (const [k, t] of Object.entries(seen)) if (now - t > DEDUPE_MS) delete seen[k];
    if (seen[fingerprint]) return "duplicate";
    const count = (await this.ctx.storage.list({ prefix: "p:" })).size;
    if (count >= MAX_PENDING) return "full";
    seen[fingerprint] = now;
    await this.ctx.storage.put({ seen, [`p:${post.id}`]: post });
    return "ok";
  }
  async list(): Promise<PendingPost[]> {
    const map = await this.ctx.storage.list<PendingPost>({ prefix: "p:" });
    return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async count(): Promise<number> {
    return (await this.ctx.storage.list({ prefix: "p:" })).size;
  }
  async get(id: string): Promise<PendingPost | undefined> {
    return this.ctx.storage.get<PendingPost>(`p:${id}`);
  }
  async remove(id: string): Promise<boolean> {
    return this.ctx.storage.delete(`p:${id}`);
  }
}

function clean(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

function newId(prefix: string): string {
  const rand = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(36).padStart(2, "0")).join("");
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

/** Basic spam signals. Returns a reason code, or "" when the text looks fine. */
function spamReason(text: string): string {
  const links = (text.match(/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|xyz|info|biz|top|io)\b/gi) || []).length;
  if (links > 1) return "too_many_links";
  if (/(.)\1{14,}/u.test(text)) return "repeated_characters";
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length > 40 && letters === letters.toUpperCase()) return "all_caps";
  if (/\b(viagra|casino|crypto ?airdrop|loan offer|bitcoin giveaway|porn|xxx)\b/i.test(text)) return "blocked_words";
  return "";
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ForumFile = { threads: { id: string; title: string; author: string; body: string; createdAt: string; hidden: boolean; replies: { id: string; author: string; body: string; createdAt: string; hidden: boolean }[] }[] };

async function readForum(env: AdminEnv): Promise<ForumFile | null> {
  const r = await gh<{ content?: string; encoding?: string }>(env, `/contents/${FORUM_PATH}?ref=main`);
  if (r.status === 404) return { threads: [] };
  if (r.status !== 200 || !r.data.content) return null;
  const bin = atob(r.data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ForumFile>;
    return { ...parsed, threads: Array.isArray(parsed.threads) ? parsed.threads : [] } as ForumFile;
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 20_000) return {};
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleForum(request: Request, env: AdminEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(origin)) return reply(null, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const queue = env.FORUM_QUEUE.get(env.FORUM_QUEUE.idFromName("queue"));

  if (action === "submit") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    const body = await readJson(request);
    // Honeypot / too-fast form: pretend success so bots learn nothing.
    if (clean(body.website, 200) || (typeof body.elapsedMs === "number" && body.elapsedMs < MIN_FILL_MS)) {
      return reply(origin, { ok: true, pending: true });
    }
    const kind = body.kind === "reply" ? "reply" : "thread";
    const author = clean(body.author, 40);
    const title = kind === "thread" ? clean(body.title, 120) : "";
    const text = clean(body.body, 2000);
    const threadId = kind === "reply" ? clean(body.threadId, 80) : "";
    if (author.length < 1) return reply(origin, { error: "name_required" }, 400);
    if (kind === "thread" && title.length < 3) return reply(origin, { error: "title_too_short" }, 400);
    if (text.length < 2) return reply(origin, { error: "message_too_short" }, 400);
    if (kind === "reply" && !/^[A-Za-z0-9_-]{3,80}$/.test(threadId)) return reply(origin, { error: "bad_thread" }, 400);
    const spam = spamReason(`${author}\n${title}\n${text}`);
    if (spam) return reply(origin, { error: "rejected", reason: spam }, 422);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const guard = env.ADMIN_GUARD.get(env.ADMIN_GUARD.idFromName(`forum:${ip}`));
    if (!(await guard.hit(SUBMIT_MAX, SUBMIT_WINDOW_MS))) return reply(origin, { error: "too_many_posts" }, 429, { "Retry-After": "600" });

    const post: PendingPost = {
      id: newId(kind),
      kind,
      ...(threadId ? { threadId } : {}),
      author,
      ...(title ? { title } : {}),
      body: text,
      createdAt: new Date().toISOString(),
    };
    const added = await queue.add(post, await sha256(`${kind}|${threadId}|${title}|${text}`.toLowerCase()));
    if (added === "full") return reply(origin, { error: "queue_full" }, 503);
    return reply(origin, { ok: true, pending: true });
  }

  const session = await verifyToken(env, request.headers.get("Authorization"));
  if (!session) return reply(origin, { error: "unauthorized" }, 401);

  if (action === "count") return reply(origin, { count: await queue.count() });
  if (action === "pending") return reply(origin, { items: await queue.list() });

  if (action === "reject") {
    const body = await readJson(request);
    const ok = await queue.remove(clean(body.id, 80));
    return reply(origin, { ok }, ok ? 200 : 404);
  }

  if (action === "approve") {
    const body = await readJson(request);
    const id = clean(body.id, 80);
    const post = await queue.get(id);
    if (!post) return reply(origin, { error: "not_found" }, 404);
    const edits = (body.edits && typeof body.edits === "object" ? body.edits : {}) as Record<string, unknown>;
    const author = clean(edits.author ?? post.author, 40) || post.author;
    const text = clean(edits.body ?? post.body, 2000) || post.body;
    const title = clean(edits.title ?? post.title, 120) || post.title || "Untitled";

    const forum = await readForum(env);
    if (!forum) return reply(origin, { error: "forum_read_failed" }, 502);
    if (post.kind === "thread") {
      if (!forum.threads.some((t) => t.id === post.id)) {
        forum.threads.push({ id: post.id, title, author, body: text, createdAt: post.createdAt, hidden: false, replies: [] });
      }
    } else {
      const thread = forum.threads.find((t) => t.id === post.threadId);
      if (!thread) return reply(origin, { error: "thread_missing" }, 409);
      thread.replies = Array.isArray(thread.replies) ? thread.replies : [];
      if (!thread.replies.some((r) => r.id === post.id)) {
        thread.replies.push({ id: post.id, author, body: text, createdAt: post.createdAt, hidden: false });
      }
    }
    const r = await publish(env, [{ path: FORUM_PATH, content: JSON.stringify(forum, null, 2) + "\n" }], `chore(forum): approve ${post.kind} by ${author} via admin`);
    if (r.status !== 200) return reply(origin, r.body, r.status);
    await queue.remove(id);
    return reply(origin, { ...(r.body as object), forum });
  }

  return reply(origin, { error: "not_found" }, 404);
}
