export const ADMIN_SESSION_KEY = "sm_admin_authenticated";
export const ADMIN_PREVIEW_KEY = "sm_admin_preview_data";

/**
 * SHA-256 (hex, lowercase) of the admin password. Only the hash is stored — never the plaintext.
 * Generate with: printf %s 'your-password' | sha256sum | cut -d' ' -f1
 * NEXT_PUBLIC_ADMIN_PASSWORD_HASH (build-time env) overrides this constant when set.
 */
export const ADMIN_PASSWORD_SHA256 = "19340acab16306dd9c33f9a90668727fe4e237582a6e42e442c29f3b1efa4aec";

export function getAdminPasswordHash(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_HASH?.trim().toLowerCase() || "";
  const hash = fromEnv || ADMIN_PASSWORD_SHA256.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : "";
}

export function isAdminConfigured(): boolean {
  return Boolean(getAdminPasswordHash());
}

/** How long a sign-in is remembered on this device (shared by every tab, survives restarts). */
export const ADMIN_SESSION_DAYS = 30;

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (raw) {
      const exp = Number(JSON.parse(raw)?.exp) || 0;
      if (exp > Date.now()) return true;
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
    // Sign-in from an older build (per-tab sessionStorage): upgrade it to the 30-day device session.
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      setAdminAuthenticated(true);
      return true;
    }
  } catch {
    // storage unavailable or malformed — treat as signed out
  }
  return false;
}

export function setAdminAuthenticated(ok: boolean): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (ok) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ exp: Date.now() + ADMIN_SESSION_DAYS * 864e5 }));
    else localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // storage unavailable
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compare SHA-256(input) with the configured hash (constant-time over the hex string). */
export async function verifyAdminPassword(input: string): Promise<boolean> {
  const expected = getAdminPasswordHash();
  if (!expected || !input) return false;
  const actual = await sha256Hex(input);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
