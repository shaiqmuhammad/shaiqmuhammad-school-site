"use client";
/**
 * t422: "Remember this iPad" (students only, opt-in). The session token is also kept in a first-party
 * HttpOnly + Secure + SameSite=Strict cookie set by /api/remember on shaiqmuhammad.com, bound to a random
 * device id, so an iPad that loses its website storage (Safari clears it after ~7 days) signs back in by itself.
 */
const DEV = "sm_device_id_v1";
const ON = "sm_rem_on";
export function deviceId(): string {
  try { let d = localStorage.getItem(DEV); if (!d) { d = crypto.randomUUID(); localStorage.setItem(DEV, d); } return d; } catch { return ""; }
}
export const rememberOn = () => { try { return localStorage.getItem(ON) === "1"; } catch { return false; } };
export async function rememberSave(token: string): Promise<boolean> {
  try {
    const r = await fetch("/api/remember", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, device: deviceId() }) });
    if (r.ok) { localStorage.setItem(ON, "1"); return true; }
  } catch { /* offline */ }
  return false;
}
export async function rememberForget() {
  try { localStorage.removeItem(ON); } catch { /* */ }
  try { await fetch("/api/remember", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ forget: true }) }); } catch { /* */ }
}
/** The remembered token for this device, if any. */
export async function rememberedToken(): Promise<string | null> {
  try {
    let dev = ""; try { dev = localStorage.getItem(DEV) || ""; } catch { /* */ }
    const r = await fetch("/api/remember", { credentials: "same-origin", cache: "no-store", headers: dev ? { "X-SM-Device": dev } : {} });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: string | null; device?: string };
    if (j.device && !dev) { try { localStorage.setItem(DEV, j.device); } catch { /* */ } }
    return j.token || null;
  } catch { return null; }
}
