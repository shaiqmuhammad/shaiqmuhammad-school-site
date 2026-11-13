/**
 * Shared default password for student accounts.
 *
 * The value lives only in the worker secret LMS_STUDENT_DEFAULT_PIN (wrangler secret put).
 * It is never written into source, the site bundle, or a committed var.
 * Teachers, parents and the admin password do not use it.
 */

/** 6–64 characters, same window as a student changing their own password. Empty when unset or out of range. */
export function defaultStudentPin(raw: string | undefined): string {
  const p = String(raw ?? "").replace(/^\s+|\s+$/g, "");
  const n = [...p].length;
  if (n < 6 || n > 64) return "";
  return p;
}

/**
 * Password stored for a brand-new account.
 * An explicit password always wins. A student with none gets the shared default when it is configured.
 * Anyone else (teacher, parent) gets "" so the caller keeps generating a random password.
 */
export function initialAccountPin(role: string, given: string, sharedDefault: string): string {
  if (given) return given;
  if (role === "student" && sharedDefault) return sharedDefault;
  return "";
}
