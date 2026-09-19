export const ADMIN_SESSION_KEY = "sm_admin_authenticated";
export const ADMIN_PREVIEW_KEY = "sm_admin_preview_data";

export function getAdminPassword(): string {
  return process.env.NEXT_PUBLIC_ADMIN_PASSWORD?.trim() || "";
}

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

export function setAdminAuthenticated(ok: boolean): void {
  if (ok) sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  else sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export function verifyAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  return input === expected;
}
