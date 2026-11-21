/** School/site default zone. Scheduled times are stored as UTC milliseconds. */
export const SITE_TZ = "Asia/Dubai";
export const TZ_AUTO = "auto";
const PREF_KEY = "sm-tz-pref";

export function isValidZone(tz: string): boolean {
  if (!tz || tz === TZ_AUTO) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (isValidZone(z)) return z;
  } catch { /* */ }
  return SITE_TZ;
}

/** Saved preference: "auto" or an IANA id. Empty means Auto. */
export function readTzPref(): string {
  if (typeof window === "undefined") return TZ_AUTO;
  try {
    const v = sessionStorage.getItem(PREF_KEY) || localStorage.getItem(PREF_KEY) || "";
    if (!v || v === TZ_AUTO) return TZ_AUTO;
    return isValidZone(v) ? v : TZ_AUTO;
  } catch {
    return TZ_AUTO;
  }
}

export function writeTzPref(pref: string) {
  const v = !pref || pref === TZ_AUTO ? TZ_AUTO : (isValidZone(pref) ? pref : TZ_AUTO);
  try {
    sessionStorage.setItem(PREF_KEY, v);
    localStorage.setItem(PREF_KEY, v);
  } catch { /* */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sm-tz"));
}

/** The zone to display and convert in: Auto follows the device; invalid falls back to Dubai. */
export function resolveZone(pref?: string | null): string {
  const p = (pref || "").trim() || readTzPref();
  if (!p || p === TZ_AUTO) return deviceZone();
  return isValidZone(p) ? p : SITE_TZ;
}

function partsIn(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidZone(tz) ? tz : SITE_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { y: +g("year"), mo: +g("month"), d: +g("day"), h: +g("hour"), mi: +g("minute"), s: +g("second") };
}

export function zoneOffsetMs(ms: number, tz: string): number {
  const p = partsIn(ms, tz);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return wall - ms;
}

/** Wall-clock date + 24h time in `tz` → UTC milliseconds. */
export function zoneMs(date: string, time: string, tz: string): number {
  if (!date || !time) return 0;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if (![y, mo, d, h, mi].every((n) => Number.isFinite(n))) return 0;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const guess = asUtc - zoneOffsetMs(asUtc, tz);
  return asUtc - zoneOffsetMs(guess, tz);
}

export function zoneParts(ms = Date.now(), tz = SITE_TZ): { date: string; time: string } {
  const p = partsIn(ms, tz);
  return {
    date: `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`,
    time: `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`,
  };
}

export function fmtTime12(ms: number, lang: string, tz: string): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-US", {
    timeZone: isValidZone(tz) ? tz : SITE_TZ,
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(ms));
}

export function fmtWhen(ms: number, lang: string, tz: string): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-US", {
    timeZone: isValidZone(tz) ? tz : SITE_TZ,
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(ms));
}

export function zoneCity(tz: string): string {
  const id = isValidZone(tz) ? tz : SITE_TZ;
  return id.split("/").pop()!.replace(/_/g, " ");
}

/** Short label such as "Dubai, GST". */
export function zoneLabel(tz: string, ms = Date.now()): string {
  const id = isValidZone(tz) ? tz : SITE_TZ;
  let short = "";
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "short", hour: "2-digit" }).formatToParts(new Date(ms));
    short = (p.find((x) => x.type === "timeZoneName")?.value || "").replace(/^GMT/, "UTC");
  } catch { /* */ }
  if (!short || short === id) short = utcOffsetLabel(id, ms);
  return `${zoneCity(id)}${short ? `, ${short}` : ""}`;
}

export function utcOffsetLabel(tz: string, ms = Date.now()): string {
  const off = zoneOffsetMs(ms, tz);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 3600000);
  const m = Math.round((abs % 3600000) / 60000);
  return m ? `UTC${sign}${h}:${String(m).padStart(2, "0")}` : `UTC${sign}${h}`;
}

export function to12(hm: string): { hour: number; minute: number; pm: boolean } {
  const [h0, m0] = (hm || "00:00").split(":").map(Number);
  const h = Number.isFinite(h0) ? Math.max(0, Math.min(23, h0)) : 0;
  const minute = Number.isFinite(m0) ? Math.max(0, Math.min(59, m0)) : 0;
  const pm = h >= 12;
  const hour = ((h + 11) % 12) + 1;
  return { hour, minute, pm };
}

export function from12(hour: number, minute: number, pm: boolean): string {
  const h12 = Math.max(1, Math.min(12, hour || 12));
  const m = Math.max(0, Math.min(59, minute || 0));
  let h = h12 % 12;
  if (pm) h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "This is 4:00 PM in Dubai" — school-zone preview of a UTC instant. */
export function previewInZone(ms: number, lang: string, tz = SITE_TZ): string {
  if (!ms) return "";
  return `${fmtTime12(ms, lang, tz)} ${lang === "ar" ? "في" : "in"} ${zoneCity(tz)}`;
}
