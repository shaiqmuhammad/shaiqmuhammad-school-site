/**
 * Admin sign-in security (Admin → Settings gear → Security).
 *
 * - The admin password is checked ONLY here (never in the browser bundle).
 * - Once the admin changes it, it is kept as a salted PBKDF2-SHA256 hash (100 000 iterations — the Workers
 *   maximum) in the AdminGuard Durable Object instance "__auth__". Until then the ADMIN_PASSWORD_SHA256 secret
 *   is used. AdminGuard is never part of Admin → Backup, so a restore never brings back an old password.
 * - Every admin token carries the password version "pv"; changing the password or "Sign out all other devices"
 *   bumps it, which ends every other session at once.
 * - Sessions: 12 hours since last use (the site refreshes the token while you work), 7 days at most.
 * - Optional two-step sign-in (TOTP, RFC 6238, 6 digits / 30 s) with one-time backup codes.
 */
export const PBKDF2_ITER = 100_000;
export const IDLE_MS = 12 * 3600_000;
export const MAX_SESSION_MS = 7 * 864e5;
export const MIN_PASSWORD = 10;

const enc = new TextEncoder();

export type PwRecord = { alg: "pbkdf2-sha256"; iter: number; salt: string; dk: string; changedAt: number };
export type TotpRecord = { secret: string; enabled: boolean; backup: string[]; lastStep: number; enabledAt: number };
export type LogEntry = { t: number; ok: boolean; what: string; ua: string; ip: string; where: string };
export type AuthState = { pw?: PwRecord; pv: number; totp?: TotpRecord; pending?: { secret: string; at: number }; log: LogEntry[] };

export function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function hexOf(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function sha256Hex(s: string): Promise<string> {
  return hexOf(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

export async function hashPassword(password: string): Promise<PwRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = await pbkdf2(password, salt, PBKDF2_ITER);
  return { alg: "pbkdf2-sha256", iter: PBKDF2_ITER, salt: b64(salt), dk: b64(dk), changedAt: Date.now() };
}

/** Stored PBKDF2 hash when the password was changed in Admin; otherwise the original secret (SHA-256). */
export async function checkPassword(state: AuthState, envSha256: string | undefined, password: string): Promise<boolean> {
  if (!password || password.length > 500) return false;
  if (state.pw) {
    const dk = await pbkdf2(password, unb64(state.pw.salt), state.pw.iter);
    return safeEq(b64(dk), state.pw.dk);
  }
  const want = String(envSha256 || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want)) return false;
  return safeEq(await sha256Hex(password), want);
}

const COMMON = ["password", "123456", "qwerty", "admin", "letmein", "welcome", "iloveyou", "shaiq", "muhammad", "school"];
/** "" when the new password is acceptable, else a short reason code. */
export function passwordProblem(pw: string): string {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) return "too_short";
  if (pw.length > 200) return "too_long";
  if (/^(.)\1+$/.test(pw)) return "too_simple";
  const low = pw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMMON.some((c) => low === c || (low.startsWith(c) && /^\d*$/.test(low.slice(c.length))))) return "too_common";
  return "";
}

/* ---------- TOTP (RFC 6238 / RFC 4226) ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Uint8Array): string {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function unbase32(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of clean) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}
/** Matching time step (±1 window of 30 s) newer than lastStep, else -1 (stops a code being reused). */
export async function totpMatch(secretB32: string, code: string, lastStep = 0, now = Date.now()): Promise<number> {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return -1;
  const step = Math.floor(now / 30_000);
  const secret = unbase32(secretB32);
  for (const s of [step, step - 1, step + 1]) {
    if (s <= lastStep) continue;
    if (safeEq(await hotp(secret, s), c)) return s;
  }
  return -1;
}
export function newTotpSecret(): string {
  return base32(crypto.getRandomValues(new Uint8Array(20)));
}
export function otpauthUri(secret: string, label: string, issuer = "Shaiq Admin"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
const BC = "abcdefghjkmnpqrstuvwxyz23456789";
export function newBackupCodes(n = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = crypto.getRandomValues(new Uint8Array(8));
    const s = [...r].map((x) => BC[x % BC.length]).join("");
    out.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return out;
}
export const normBackup = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- sign-in log helpers ---------- */
export function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return "";
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":…";
  const p = ip.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}.x.x` : "";
}
export function deviceOf(ua: string): string {
  const u = ua || "";
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : /CrOS/.test(u) ? "Chromebook" : /Linux/.test(u) ? "Linux" : "";
  const br = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : /curl|python|node|Go-http|wget/i.test(u) ? "Script" : "";
  return [br, os].filter(Boolean).join(" on ") || "Unknown device";
}
