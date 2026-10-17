const BASE = "https://assessment-session.hidden-wildflower-498c.workers.dev/api/lms";
export type VidComment = { name: string; role: string; text: string; at: number };
export type VidInfo = { likes: number; liked: boolean; comments: VidComment[]; pendingMine: number };

export function clientId(): string {
  try { let c = localStorage.getItem("sm_cid"); if (!c) { c = crypto.randomUUID(); localStorage.setItem("sm_cid", c); } return c; } catch { return ""; }
}
function auth(): Record<string, string> {
  try { const s = JSON.parse(localStorage.getItem("sm_lms_session_v1") || "null") as { token?: string; exp?: number } | null; return s?.token && (!s.exp || s.exp * (s.exp < 1e12 ? 1000 : 1) > Date.now()) ? { Authorization: `Bearer ${s.token}` } : {}; } catch { return {}; }
}
export const isMember = () => !!auth().Authorization;
async function post<T>(a: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${BASE}/${a}`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ ...body, cid: clientId() }) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}
export const vidApi = {
  info: (id: string) => post<VidInfo>("vid-pub-info", { id }),
  like: (id: string) => post<{ liked: boolean; likes: number }>("vid-pub-like", { id }),
  comment: (id: string, text: string, name: string, website: string) => post<{ ok: true; pending: boolean }>("vid-pub-comment", { id, text, name, website }),
};
