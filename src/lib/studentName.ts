import { lmsApi, lmsSession } from "@/lib/lms";

/** How student names print on certificates and QR cards. auto = follows the chosen language. */
export type NameMode = "auto" | "ar" | "en" | "both";

let cached: { mode: NameMode; at: number } | null = null;
export async function loadNameMode(asAdmin = false): Promise<NameMode> {
  if (cached && Date.now() - cached.at < 120000) return cached.mode;
  try {
    const r = await lmsApi.nameMode(asAdmin);
    cached = { mode: (r.mode as NameMode) || "auto", at: Date.now() };
  } catch {
    cached = { mode: "auto", at: Date.now() };
  }
  return cached.mode;
}
export function clearNameModeCache() { cached = null; }

/** The printed name for one student. Falls back to the English name when there is no Arabic name. */
export function pickName(en: string, ar: string | undefined, lang: string, mode: NameMode): string {
  const a = (ar || "").trim(), e = (en || "").trim();
  if (!a) return e;
  if (mode === "en") return e;
  if (mode === "ar") return a;
  if (mode === "both") return e ? `${a} · ${e}` : a;
  return lang === "ar" ? a : e;
}

/** The signed-in student's English and Arabic names (for pre-filling the assessment name). */
export function sessionNames(): { en: string; ar: string } | null {
  const u = lmsSession()?.user as { role?: string; name?: string; nameAr?: string } | undefined;
  if (!u || u.role !== "student") return null;
  return { en: u.name || "", ar: u.nameAr || "" };
}
