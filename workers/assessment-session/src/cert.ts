/**
 * Certificate designs (multiple, named) kept server-side in the SiteKV Durable Object.
 *  Public  GET  /api/cert/designs                  -> { designs[], defaultId, assign{quizId:{individual?,group?}} }
 *  Admin   POST /api/cert/admin/save   {designs, defaultId, assign}   (admin session token)
 * The PDF itself is drawn in the browser from the chosen design (see src/lib/certificateDesign.ts).
 */
import { corsHeaders, originAllowed, reply, verifyToken } from "./admin";
import type { YtEnv } from "./youtube";

const KEY = "certdesigns";
const MAX_BODY = 1_600_000;
const kv = (env: YtEnv) => env.SITE.get(env.SITE.idFromName("main"));

export async function handleCert(request: Request, env: YtEnv, parts: string[]): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(origin)) return reply(null, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  if (parts[0] === "designs" && request.method === "GET") {
    let data: unknown = { designs: [], defaultId: "", assign: {} };
    try { const v = await kv(env).get(KEY); if (v) data = JSON.parse(v); } catch { /* empty */ }
    return reply(origin, data, 200, { "Cache-Control": "no-store" });
  }

  if (parts[0] === "admin" && parts[1] === "save" && request.method === "POST") {
    const session = await verifyToken(env, request.headers.get("Authorization"));
    if (!session) return reply(origin, { error: "unauthorized" }, 401);
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(origin, { error: "too_large" }, 413);
    let b: { designs?: unknown; defaultId?: unknown; assign?: unknown };
    try { b = JSON.parse(text || "{}"); } catch { return reply(origin, { error: "bad_json" }, 400); }
    const designs = (Array.isArray(b.designs) ? b.designs : []).slice(0, 40).filter((d) => d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string");
    const ids = new Set(designs.map((d) => (d as { id: string }).id));
    const defaultId = typeof b.defaultId === "string" && ids.has(b.defaultId) ? b.defaultId : (designs[0] as { id?: string } | undefined)?.id || "";
    const assign: Record<string, { individual?: string; group?: string }> = {};
    if (b.assign && typeof b.assign === "object") {
      for (const [q, v] of Object.entries(b.assign as Record<string, { individual?: unknown; group?: unknown }>).slice(0, 500)) {
        const ind = typeof v?.individual === "string" && ids.has(v.individual) ? v.individual : undefined;
        const grp = typeof v?.group === "string" && ids.has(v.group) ? v.group : undefined;
        if (ind || grp) assign[String(q).slice(0, 80)] = { ...(ind ? { individual: ind } : {}), ...(grp ? { group: grp } : {}) };
      }
    }
    await kv(env).set(KEY, JSON.stringify({ designs, defaultId, assign, updatedAt: Date.now() }));
    return reply(origin, { ok: true, count: designs.length });
  }
  return reply(origin, { error: "not_found" }, 404);
}
