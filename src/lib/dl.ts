"use client";

import { useEffect, useState } from "react";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { lmsSession } from "@/lib/lms";

/**
 * Download switches (admin-controlled): audio files and Excel/PDF exports.
 * Everything is allowed until the admin turns a switch off. The server is the authority
 * (audio download + export endpoints answer 403); this cache only decides what to show.
 */
export type DlPolicy = { audio: boolean; export: boolean };
type DlKind = "audio" | "export";
const KEY = "sm_dl";
const inAdmin = () => typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

function read(): DlPolicy {
  try { const j = JSON.parse(sessionStorage.getItem(KEY) || ""); if (j && j.tok === lmsSession()?.token) return { audio: j.audio !== false, export: j.export !== false }; } catch { /* none */ }
  return { audio: true, export: true };
}

export const dlAllowed = (k: DlKind): boolean => (typeof window === "undefined" || inAdmin() ? true : read()[k]);

/** Ask the server for this signed-in person's current policy and remember it for this tab. */
export async function refreshDl(): Promise<DlPolicy> {
  const s = lmsSession();
  if (typeof window === "undefined" || inAdmin() || !s) return { audio: true, export: true };
  try {
    const r = await fetch(`${ASSESSMENT_API_BASE}/api/lms/dl-policy`, { cache: "no-store", headers: { Authorization: `Bearer ${s.token}` } });
    if (r.ok) {
      const j = (await r.json()) as DlPolicy;
      sessionStorage.setItem(KEY, JSON.stringify({ ...j, tok: s.token }));
      window.dispatchEvent(new Event("sm-dl"));
      return j;
    }
  } catch { /* keep the last known value */ }
  return read();
}

export function useDl(): DlPolicy {
  const [p, setP] = useState<DlPolicy>({ audio: true, export: true });
  useEffect(() => {
    const sync = () => setP(read());
    sync(); refreshDl().then(setP);
    window.addEventListener("sm-dl", sync);
    return () => window.removeEventListener("sm-dl", sync);
  }, []);
  return inAdmin() ? { audio: true, export: true } : p;
}

/** Server check before generating a file in the browser. Returns false (after telling the user) when blocked. */
export async function dlGrant(kind: DlKind = "export"): Promise<boolean> {
  const s = lmsSession();
  if (typeof window === "undefined" || inAdmin() || !s) return true;
  try {
    const r = await fetch(`${ASSESSMENT_API_BASE}/api/lms/dl-grant`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` }, body: JSON.stringify({ kind }) });
    if (r.status === 403) { refreshDl(); alert("Downloads are switched off for your account. / التنزيل غير مفعّل لحسابك."); return false; }
  } catch { /* offline: the data was already on screen */ }
  return true;
}
