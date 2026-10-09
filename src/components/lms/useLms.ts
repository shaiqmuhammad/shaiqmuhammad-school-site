"use client";

import { useCallback, useEffect, useState } from "react";
import { clearServerSession, getServerSession } from "@/lib/adminServer";
import { lmsSession, type Actor } from "@/lib/lms";
import { useI18n } from "@/lib/i18n";

const ADMIN_ACTOR: Actor = { id: "admin", role: "admin", name: "Admin", cls: "", perms: ["assign", "review", "manageUsers", "viewAll"] };
const at = (k: string) => Number(localStorage.getItem(k) || 0);

/**
 * Current LMS actor. With both an admin and a student/teacher session on one device, the most recent sign-in wins
 * (sessions from before this existed have no time → admin wins). `preferAdmin` (admin-only pages) always uses the
 * admin session when there is one.
 */
export function useLmsActor(preferAdmin = false): { actor: Actor | null; asAdmin: boolean; ready: boolean } {
  const [st, setSt] = useState<{ actor: Actor | null; asAdmin: boolean; ready: boolean }>({ actor: null, asAdmin: false, ready: false });
  useEffect(() => {
    const s = lmsSession();
    const admin = getServerSession();
    const useAdmin = !!admin && (preferAdmin || !s || at("sm_admin_login_at") >= at("sm_lms_login_at"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    if (useAdmin) setSt({ actor: ADMIN_ACTOR, asAdmin: true, ready: true });
    else if (s) setSt({ actor: s.user, asAdmin: false, ready: true });
    else setSt({ actor: null, asAdmin: false, ready: true });
  }, [preferAdmin]);
  return st;
}

/**
 * The admin token is missing/expired/rejected: go to the admin sign-in once and come back here afterwards.
 * Returns false (no redirect) if we were just sent there, so a broken sign-in can never loop.
 */
export function adminRelogin(): boolean {
  clearServerSession();
  try {
    const last = Number(sessionStorage.getItem("sm_admin_relogin") || 0);
    if (Date.now() - last < 20_000) return false;
    sessionStorage.setItem("sm_admin_relogin", String(Date.now()));
  } catch {
    // storage unavailable
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the login page reads fresh storage
  window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  return true;
}

export function useTr() {
  const { lang } = useI18n();
  const tr = useCallback((en: string, ar: string) => (lang === "ar" ? ar : en), [lang]);
  return { lang, tr };
}

export const card = "glass rounded-3xl p-4 sm:p-5";
export const inputCls = "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-base outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40 dark:border-white/15 dark:bg-black/20";
export const smallBtn = "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm font-bold hover:bg-white disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10";

export const STATUS_STYLE: Record<string, string> = {
  none: "bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-white",
  draft: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  submitted: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  returned: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
};
export function statusLabel(s: string, tr: (en: string, ar: string) => string) {
  return s === "draft" ? tr("In progress", "قيد العمل") : s === "submitted" ? tr("Submitted", "مُسلَّم") : s === "returned" ? tr("Needs another try", "يحتاج محاولة أخرى") : s === "approved" ? tr("Approved", "مقبول") : tr("Not started", "لم يبدأ");
}
