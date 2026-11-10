/**
 * t422: "Remember this iPad" — first-party, HttpOnly, Secure, SameSite=Strict cookie on shaiqmuhammad.com
 * (Safari wipes script storage / caps JS cookies at 7 days; a server-set first-party cookie survives).
 *  POST {token, device}  → verifies with the LMS Worker that the token is a STUDENT session, then stores it (180 days).
 *  GET  (header X-SM-Device optional) → {token} if a remembered student session exists on this device.
 *  POST {forget:true}    → clears it.
 * Teachers, admins and parents are never remembered here. A PIN change/reset invalidates the stored token server-side.
 */
// Per deployment: Pages variable ASSESSMENT_API_URL (a copy of the site points at its own worker). School default.
const DEFAULT_API = "https://assessment-session.shaiqmuhammad.workers.dev";
const NAME = "sm_rem";
const MAX_AGE = 180 * 86400;
type Ctx = { request: Request; env?: { ASSESSMENT_API_URL?: string } };
const cookieOf = (req: Request) => { const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)sm_rem=([^;]+)/); return m ? decodeURIComponent(m[1]) : ""; };
const set = (v: string, age: number) => `${NAME}=${encodeURIComponent(v)}; Max-Age=${age}; Path=/api/remember; HttpOnly; Secure; SameSite=Strict`;
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

export async function onRequestGet({ request }: Ctx) {
  const raw = cookieOf(request);
  if (!raw) return json({ token: null });
  const [token, device] = raw.split("~");
  const want = request.headers.get("X-SM-Device") || "";
  // Device binding: if this browser still knows its device id it must match the one the cookie was made for.
  if (want && device && want !== device) return json({ token: null });
  return json({ token, device });
}

export async function onRequestPost({ request, env }: Ctx) {
  const API = (env?.ASSESSMENT_API_URL || DEFAULT_API).replace(/\/$/, "");
  // Same-origin only (whatever address the site is opened on: shaiqmuhammad.com, almudarris.com, pages.dev …).
  const o = request.headers.get("Origin");
  if (o && o !== new URL(request.url).origin) return json({ error: "origin" }, 403);
  const b = (await request.json().catch(() => ({}))) as { token?: string; device?: string; forget?: boolean };
  if (b.forget) return json({ ok: true }, 200, { "Set-Cookie": set("", 0) });
  const token = String(b.token || "").slice(0, 2000), device = String(b.device || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  if (!token || !device) return json({ error: "bad_input" }, 400);
  const r = await fetch(`${API}/api/lms/me`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  const me = r && r.ok ? ((await r.json().catch(() => null)) as { user?: { role?: string } } | null) : null;
  if (me?.user?.role !== "student") return json({ error: "students_only" }, 403);
  return json({ ok: true }, 200, { "Set-Cookie": set(`${token}~${device}`, MAX_AGE) });
}
