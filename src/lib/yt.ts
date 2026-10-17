import { getServerSession } from "@/lib/adminServer";

export const API = "https://assessment-session.hidden-wildflower-498c.workers.dev/api/yt";
export type YtVideo = { id: string; title: string; duration: string; published: string };
export type YtPlaylist = { id: string; title: string; count: string };
export type PlCfg = { id: string; title: string; slug: string; order: number; visible: boolean };
export type PageRow = { id: string; slug: string; title: string; titleAr: string; body: string; bodyAr: string; place: "none" | "top" | "resources" | "footer"; order: number; visible: boolean; updated: number };
export type YtAdminConfig = { playlists: YtPlaylist[]; videos: number; channelOk: boolean; config: PlCfg[]; pages: PageRow[]; oauth: { configured: boolean; connected: boolean; redirectUri: string } };

export const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
/** Privacy-enhanced embed: the only way videos are shown on this site (no links out to YouTube). */
export const embed = (id: string) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1`;

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/${path}`);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}
export const ytApi = {
  channel: () => get<{ videos: YtVideo[]; playlists: YtPlaylist[]; updated: number }>("channel"),
  playlist: (id: string) => get<{ id: string; title: string; videos: YtVideo[] }>(`playlist?id=${encodeURIComponent(id)}`),
  playlistBySlug: (slug: string) => get<{ id: string; title: string }>(`playlist-cfg?p=${encodeURIComponent(slug)}`),
  page: (slug: string) => get<{ page: PageRow }>(`page?s=${encodeURIComponent(slug)}`),
};

async function admin<T>(action: string, body?: unknown): Promise<T> {
  const token = getServerSession()?.token;
  const r = await fetch(`${API}/admin/${action}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}
export const ytAdmin = {
  config: () => admin<YtAdminConfig>("config"),
  refresh: () => admin<{ ok: true }>("refresh", {}),
  savePlaylists: (items: PlCfg[]) => admin<{ ok: true }>("playlists", { items }),
  savePage: (p: Partial<PageRow>) => admin<{ ok: true; page: PageRow }>("page", p),
  deletePage: (id: string) => admin<{ ok: true }>("page-delete", { id }),
  authUrl: () => admin<{ url: string }>("auth-url"),
  disconnect: () => admin<{ ok: true }>("disconnect", {}),
  uploadInit: (b: { title: string; description: string; privacy: string; size: number; mime: string; madeForKids: boolean }) => admin<{ uploadUrl: string }>("upload-init", b),
  finish: (videoId: string, playlistId: string) => admin<{ ok: true }>("finish", { videoId, playlistId }),
};
