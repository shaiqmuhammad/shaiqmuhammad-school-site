/**
 * /api/mail/*  (admin only): status, folders, list, message, part, seen, send.
 * /api/contact (public):     website contact form -> stored in admin + emailed to contact@ (Reply-To sender) + auto-ack from info@.
 */
import { corsHeaders, reply, verifyToken } from "../admin";
import type { LmsEnv } from "../lms";
import { folders, getMessage, getPart, listMessages, mailReady, sendAuto, sendPersonal, sendToContact, setSeen, unreadInbox } from "./mailbox";

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const emailOk = (v: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(v);
const list = (v: unknown) => String(v ?? "").split(/[;,]/).map((x) => x.replace(/.*<([^>]+)>.*/, "$1").trim()).filter(emailOk).slice(0, 20);

export async function handleMail(request: Request, env: LmsEnv, action: string, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!(await verifyToken(env, request.headers.get("Authorization")))) return reply(origin, { error: "unauthorized" }, 401);
  const q = new URL(request.url).searchParams;
  const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
  if (action === "status") return reply(origin, { ready: mailReady(env), unread: mailReady(env) ? await unreadInbox(env).catch(() => null) : null });
  if (!mailReady(env)) return reply(origin, { error: "mail_not_configured" }, 503);
  try {
    switch (action) {
      case "folders": return reply(origin, { folders: await folders(env) });
      case "list": return reply(origin, await listMessages(env, str(q.get("folder") || "INBOX", 200), Math.max(0, Number(q.get("page")) || 0)));
      case "message": {
        const m = await getMessage(env, str(q.get("folder") || "INBOX", 200), Number(q.get("uid")));
        return m ? reply(origin, m) : reply(origin, { error: "not_found" }, 404);
      }
      case "part": {
        const p = await getPart(env, str(q.get("folder") || "INBOX", 200), Number(q.get("uid")), str(q.get("part"), 20));
        if (!p) return reply(origin, { error: "not_found" }, 404);
        return new Response(p.bytes, { headers: { ...corsHeaders(origin), "Content-Type": p.mime, "Content-Disposition": `attachment; filename="${p.filename.replace(/[^\w.\- ]/g, "_")}"` } });
      }
      case "seen": {
        await setSeen(env, str(body.folder || "INBOX", 200), (Array.isArray(body.uids) ? body.uids : []).map(Number).filter(Boolean), body.seen !== false);
        return reply(origin, { ok: true });
      }
      case "send": {
        const to = list(body.to);
        if (!to.length) return reply(origin, { error: "no_recipients" }, 400);
        const subject = str(body.subject, 200);
        const text = str(body.text, 100_000);
        if (!subject || !text) return reply(origin, { error: "empty" }, 400);
        const atts = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 5).map((a: Record<string, unknown>) => ({ filename: str(a.filename, 120), contentType: str(a.contentType, 100), base64: String(a.base64 || "") })).filter((a) => a.base64.length < 7_000_000);
        await sendPersonal(env, { to, cc: list(body.cc), subject, text, inReplyTo: str(body.inReplyTo, 300) || undefined, attachments: atts });
        return reply(origin, { ok: true });
      }
    }
    return reply(origin, { error: "not_found" }, 404);
  } catch (e) {
    // Never echo credentials; server reply text only.
    return reply(origin, { error: "mail_error", detail: e instanceof Error ? e.message.slice(0, 200) : "failed" }, 502);
  }
  void ctx;
}

export async function handleContact(request: Request, env: LmsEnv, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // Honeypot: bots fill the hidden "website" field. Pretend success.
  if (str(b.website, 200)) return reply(origin, { ok: true });
  const m = { name: str(b.name, 80), email: str(b.email, 120), subject: str(b.subject, 150), message: str(b.message, 5000) };
  if (!m.name || !emailOk(m.email) || m.message.length < 5) return reply(origin, { error: "invalid" }, 400);
  const store = env.LMS.get(env.LMS.idFromName("main"));
  const saved = (await store.contactSave(request.headers.get("CF-Connecting-IP") || "?", m)) as { ok: boolean; id?: string; error?: string };
  if (!saved.ok) return reply(origin, { error: saved.error || "failed" }, 429);
  if (mailReady(env)) {
    ctx.waitUntil((async () => {
      try {
        await sendToContact(env, m);
        await store.contactEmailed(saved.id!);
        await sendAuto(env, m.email, "We received your message — Shaiq Muhammad", {
          heading: `Thank you, ${m.name}!`,
          paragraphs: ["We received your message and will reply soon, in shaa Allah.", `Your message:\n${m.message.slice(0, 1000)}`],
          note: "This is an automatic acknowledgement. To add anything, write to contact@shaiqmuhammad.com.",
        });
      } catch { /* stored in admin regardless */ }
    })());
  }
  return reply(origin, { ok: true });
}
