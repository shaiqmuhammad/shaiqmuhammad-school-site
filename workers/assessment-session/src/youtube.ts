/**
 * YouTube library + site page manager.
 *
 *  Public   GET /api/yt/channel              all uploads + playlists of the channel (scraped worker-side, cached 30 min)
 *           GET /api/yt/playlist?id=         videos of one playlist (must belong to the channel)
 *           GET /api/yt/nav                  menu entries for playlists/pages the admin chose to show
 *           GET /api/yt/page?s=slug          one custom page
 *           GET /api/yt/oauth-callback       Google redirects here after the admin approves upload access
 *  Admin    /api/yt/admin/<action>           config, playlists, pages, OAuth connect, upload (resumable), finish
 *
 * Nothing here links out to YouTube: the site only plays videos through youtube-nocookie.com embeds.
 * Upload needs Google OAuth (secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET); everything else works without any key.
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply, verifyToken, type AdminEnv } from "./admin";

export interface YtEnv extends AdminEnv {
  SITE: DurableObjectNamespace<SiteKV>;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const HANDLE = "@shaiqmuhammad";
const SITE_ORIGIN = "https://www.shaiqmuhammad.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FRESH_S = 1800;

/** Small key-value store (SQLite-backed Durable Object) for YouTube settings, custom pages and the OAuth token. */
export class SiteKV extends DurableObject {
  private get sql() { return this.ctx.storage.sql; }
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
  }
  async get(k: string): Promise<string | null> { const r = this.sql.exec(`SELECT v FROM kv WHERE k=?`, k).toArray()[0]; return r ? String(r.v) : null; }
  async set(k: string, v: string): Promise<void> { this.sql.exec(`INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v); }
  async del(k: string): Promise<void> { this.sql.exec(`DELETE FROM kv WHERE k=?`, k); }
}

type Vid = { id: string; title: string; duration: string; published: string };
type Pl = { id: string; title: string; count: string; thumb: string };
export type PlCfg = { id: string; title: string; slug: string; order: number; visible: boolean };
export type PageRow = { id: string; slug: string; title: string; titleAr: string; body: string; bodyAr: string; place: "none" | "top" | "resources" | "footer"; order: number; visible: boolean; updated: number };

const kv = (env: YtEnv) => env.SITE.get(env.SITE.idFromName("main"));
const readJ = async <T>(env: YtEnv, k: string, d: T): Promise<T> => { try { const v = await kv(env).get(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const clean = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, n);
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---------- scraping ----------
type J = Record<string, unknown>;
function walk(o: unknown, f: (n: J) => void) {
  if (Array.isArray(o)) o.forEach((x) => walk(x, f));
  else if (o && typeof o === "object") { f(o as J); Object.values(o as J).forEach((x) => walk(x, f)); }
}
const txt = (v: unknown): string => {
  const o = v as { simpleText?: string; runs?: { text: string }[]; content?: string } | undefined;
  return o?.simpleText ?? o?.content ?? (o?.runs ? o.runs.map((r) => r.text).join("") : "");
};

function extract(data: unknown): { videos: Vid[]; playlists: Pl[]; next: string } {
  const videos: Vid[] = [], playlists: Pl[] = [];
  let next = "";
  walk(data, (n) => {
    const lv = n.lockupViewModel as J | undefined;
    if (lv && typeof lv.contentId === "string") {
      const title = txt(((lv.metadata as J)?.lockupMetadataViewModel as J)?.title);
      const badges: string[] = [];
      walk(lv.contentImage, (b) => { if (typeof b.text === "string" && "badgeStyle" in b) badges.push(b.text); });
      let published = "";
      walk((lv.metadata as J)?.lockupMetadataViewModel, (m) => { const c = txt(m.text); if (!published && / ago$/.test(c)) published = c; });
      if (lv.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") videos.push({ id: lv.contentId, title, duration: badges.find((b) => /^\d+(:\d+)+$/.test(b)) || "", published });
      else if (lv.contentType === "LOCKUP_CONTENT_TYPE_PLAYLIST") playlists.push({ id: lv.contentId, title, count: badges.find((b) => /video/i.test(b)) || "", thumb: "" });
    }
    for (const k of ["videoRenderer", "playlistVideoRenderer"]) {
      const r = n[k] as J | undefined;
      if (r && typeof r.videoId === "string" && r.title) videos.push({ id: r.videoId, title: txt(r.title), duration: txt(r.lengthText), published: txt(r.publishedTimeText) });
    }
    const cc = n.continuationCommand as { token?: string } | undefined;
    if (cc?.token && !next) next = cc.token;
  });
  return { videos, playlists, next };
}

async function ytGet(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en", Cookie: "CONSENT=YES+1; SOCS=CAI" } });
  if (!r.ok) throw new Error(`yt_${r.status}`);
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error("yt_parse");
  return { data: JSON.parse(m[1]) as unknown, key: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || "", ver: html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || "2.20240101.00.00", html };
}
async function ytMore(key: string, ver: string, token: string) {
  const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json", Cookie: "CONSENT=YES+1; SOCS=CAI" }, body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "en" } }, continuation: token }) });
  if (!r.ok) throw new Error(`yt_${r.status}`);
  return (await r.json()) as unknown;
}
async function collect(url: string, maxPages: number) {
  const first = await ytGet(url);
  let { videos, playlists, next } = extract(first.data);
  for (let i = 0; i < maxPages && next && first.key; i++) {
    const more = extract(await ytMore(first.key, first.ver, next));
    videos = videos.concat(more.videos); playlists = playlists.concat(more.playlists);
    next = more.next;
  }
  const uniq = <T extends { id: string }>(a: T[]) => [...new Map(a.map((x) => [x.id, x])).values()];
  return { videos: uniq(videos), playlists: uniq(playlists), channelId: first.html.match(/"externalId":"(UC[\w-]+)"/)?.[1] || "" };
}

async function cached<T>(key: string, fresh: number, load: () => Promise<T>): Promise<T> {
  const cache = caches.default;
  const k = new Request(`https://yt-cache.invalid/${key}`);
  const hit = await cache.match(k);
  if (hit) return (await hit.json()) as T;
  try {
    const v = await load();
    const body = JSON.stringify(v);
    await cache.put(k, new Response(body, { headers: { "Cache-Control": `max-age=${fresh}` } }));
    await cache.put(new Request(`https://yt-cache.invalid/stale/${key}`), new Response(body, { headers: { "Cache-Control": "max-age=604800" } }));
    return v;
  } catch (e) {
    const stale = await cache.match(new Request(`https://yt-cache.invalid/stale/${key}`));
    if (stale) return (await stale.json()) as T;
    throw e;
  }
}
const channel = () => cached("channel", FRESH_S, async () => {
  const [v, p] = await Promise.all([collect(`https://www.youtube.com/${HANDLE}/videos`, 14), collect(`https://www.youtube.com/${HANDLE}/playlists`, 4)]);
  return { channelId: v.channelId || p.channelId, videos: v.videos, playlists: p.playlists, updated: Date.now() };
});

// ---------- Google OAuth ----------
async function accessToken(env: YtEnv): Promise<string | null> {
  const rt = await kv(env).get("oauth-refresh");
  if (!rt || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rt, grant_type: "refresh_token" }) });
  const j = (await r.json()) as { access_token?: string };
  return j.access_token || null;
}

export async function handleYt(request: Request, env: YtEnv, rest: string[]): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const url = new URL(request.url);
  const sub = rest[0] || "";
  const pub = (body: unknown, status = 200) => reply(origin, body, status, { "Cache-Control": "public, max-age=60" });
  try {
    if (sub === "channel") return pub(await channel());
    if (sub === "playlist") {
      const id = clean(url.searchParams.get("id"), 64);
      const ch = await channel();
      if (!ch.playlists.some((p) => p.id === id)) return reply(origin, { error: "not_found" }, 404);
      const pl = await cached(`pl-${id}`, FRESH_S, async () => ({ videos: (await collect(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`, 6)).videos }));
      return pub({ id, title: ch.playlists.find((p) => p.id === id)?.title || "", videos: pl.videos });
    }
    if (sub === "nav") {
      const cfg = await readJ<PlCfg[]>(env, "ytpl", []);
      const pages = await readJ<PageRow[]>(env, "pages", []);
      const items = [
        ...cfg.filter((c) => c.visible).map((c) => ({ href: `/videos/playlist?p=${c.slug}`, label: c.title, labelAr: c.title, place: "resources", order: c.order })),
        ...pages.filter((p) => p.visible && p.place !== "none").map((p) => ({ href: `/p?s=${p.slug}`, label: p.title, labelAr: p.titleAr || p.title, place: p.place, order: p.order })),
      ].sort((a, b) => a.order - b.order);
      return pub({ items, playlists: cfg.filter((c) => c.visible).map((c) => ({ id: c.id, slug: c.slug, title: c.title })) });
    }
    if (sub === "page") {
      const s = clean(url.searchParams.get("s"), 80);
      const pg = (await readJ<PageRow[]>(env, "pages", [])).find((p) => p.slug === s && p.visible);
      return pg ? pub({ page: pg }) : reply(origin, { error: "not_found" }, 404);
    }
    if (sub === "playlist-cfg") {
      const slug = clean(url.searchParams.get("p"), 80);
      const c = (await readJ<PlCfg[]>(env, "ytpl", [])).find((x) => x.slug === slug && x.visible);
      return c ? pub({ id: c.id, title: c.title }) : reply(origin, { error: "not_found" }, 404);
    }
    if (sub === "oauth-callback") {
      const code = url.searchParams.get("code") || "", state = url.searchParams.get("state") || "";
      const ok = state && (await kv(env).get(`oauth-state:${state}`));
      const back = (m: string) => Response.redirect(`${SITE_ORIGIN}/admin/#videos?yt=${m}`, 302);
      if (!ok || !code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return back("denied");
      await kv(env).del(`oauth-state:${state}`);
      const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/api/yt/oauth-callback`, grant_type: "authorization_code" }) });
      const j = (await r.json()) as { refresh_token?: string };
      if (!j.refresh_token) return back("norefresh");
      await kv(env).set("oauth-refresh", j.refresh_token);
      return back("connected");
    }

    if (sub === "admin") {
      if (!(await verifyToken(env, request.headers.get("Authorization")))) return reply(origin, { error: "unauthorized" }, 401);
      const action = rest[1] || "";
      const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as J) : {};
      if (action === "config") {
        const [cfg, pages, refresh] = [await readJ<PlCfg[]>(env, "ytpl", []), await readJ<PageRow[]>(env, "pages", []), await kv(env).get("oauth-refresh")];
        let ch: Awaited<ReturnType<typeof channel>> | null = null;
        try { ch = await channel(); } catch { /* shown as error in UI */ }
        return reply(origin, { playlists: ch?.playlists || [], videos: ch ? ch.videos.length : 0, channelOk: !!ch, config: cfg, pages, oauth: { configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), connected: !!refresh, redirectUri: `${url.origin}/api/yt/oauth-callback` } });
      }
      if (action === "refresh") { await caches.default.delete(new Request("https://yt-cache.invalid/channel")); return reply(origin, { ok: true }); }
      if (action === "playlists") {
        const items = (Array.isArray(body.items) ? body.items : []).slice(0, 60).map((x, i) => {
          const o = x as J; const title = clean(o.title, 120);
          return { id: clean(o.id, 64), title, slug: slugify(clean(o.slug, 80) || title) || `pl-${i}`, order: Number(o.order) || i, visible: !!o.visible } as PlCfg;
        }).filter((c) => /^PL[\w-]+$/.test(c.id) || /^[\w-]{10,64}$/.test(c.id));
        await kv(env).set("ytpl", JSON.stringify(items));
        return reply(origin, { ok: true });
      }
      if (action === "page") {
        const pages = await readJ<PageRow[]>(env, "pages", []);
        const id = clean(body.id, 40) || `pg_${Date.now().toString(36)}`;
        const title = clean(body.title, 120);
        if (!title) return reply(origin, { error: "title_required" }, 400);
        let slug = slugify(clean(body.slug, 80) || title) || id;
        if (pages.some((p) => p.slug === slug && p.id !== id)) slug = `${slug}-${id.slice(-4)}`;
        const place = (["none", "top", "resources", "footer"].includes(String(body.place)) ? String(body.place) : "none") as PageRow["place"];
        const row: PageRow = { id, slug, title, titleAr: clean(body.titleAr, 120), body: clean(body.body, 40000), bodyAr: clean(body.bodyAr, 40000), place, order: Number(body.order) || 50, visible: body.visible !== false, updated: Date.now() };
        const next = pages.some((p) => p.id === id) ? pages.map((p) => (p.id === id ? row : p)) : [...pages, row];
        await kv(env).set("pages", JSON.stringify(next.slice(0, 200)));
        return reply(origin, { ok: true, page: row });
      }
      if (action === "page-delete") {
        const id = clean(body.id, 40);
        await kv(env).set("pages", JSON.stringify((await readJ<PageRow[]>(env, "pages", [])).filter((p) => p.id !== id)));
        return reply(origin, { ok: true });
      }
      if (action === "auth-url") {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return reply(origin, { error: "oauth_not_configured" }, 400);
        const state = crypto.randomUUID();
        await kv(env).set(`oauth-state:${state}`, String(Date.now()));
        const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/yt/oauth-callback`, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube" });
        return reply(origin, { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
      }
      if (action === "disconnect") { await kv(env).del("oauth-refresh"); return reply(origin, { ok: true }); }
      if (action === "upload-init") {
        const at = await accessToken(env);
        if (!at) return reply(origin, { error: "not_connected" }, 400);
        const privacy = ["public", "unlisted", "private"].includes(String(body.privacy)) ? String(body.privacy) : "private";
        const meta = { snippet: { title: clean(body.title, 100) || "Untitled", description: clean(body.description, 4900), categoryId: "27" }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: body.madeForKids === true } };
        const r = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": clean(body.mime, 60) || "video/*", "X-Upload-Content-Length": String(Number(body.size) || 0), Origin: SITE_ORIGIN }, body: JSON.stringify(meta) });
        const loc = r.headers.get("Location");
        if (!r.ok || !loc) return reply(origin, { error: "init_failed", detail: (await r.text()).slice(0, 300) }, 502);
        return reply(origin, { uploadUrl: loc });
      }
      if (action === "finish") {
        const at = await accessToken(env);
        const vid = clean(body.videoId, 20), pl = clean(body.playlistId, 64);
        if (!at || !vid) return reply(origin, { error: "bad" }, 400);
        if (pl) {
          const r = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", { method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }, body: JSON.stringify({ snippet: { playlistId: pl, resourceId: { kind: "youtube#video", videoId: vid } } }) });
          if (!r.ok) return reply(origin, { error: "playlist_failed", detail: (await r.text()).slice(0, 300) }, 502);
        }
        await caches.default.delete(new Request("https://yt-cache.invalid/channel"));
        return reply(origin, { ok: true });
      }
      return reply(origin, { error: "not_found" }, 404);
    }
    return reply(origin, { error: "not_found" }, 404);
  } catch (e) {
    return reply(origin, { error: "upstream", detail: String((e as Error).message || e).slice(0, 80) }, 502);
  }
}
