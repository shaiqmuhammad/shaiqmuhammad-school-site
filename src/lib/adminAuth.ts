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

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

export function setAdminAuthenticated(ok: boolean): void {
  if (ok) sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  else sessionStorage.removeItem(ADMIN_SESSION_KEY);
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
