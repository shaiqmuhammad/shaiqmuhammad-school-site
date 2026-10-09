"use client";

import { useCallback, useEffect, useState } from "react";
import { getServerSession } from "@/lib/adminServer";
import { lmsSession, type Actor } from "@/lib/lms";
import { useI18n } from "@/lib/i18n";

/** Current LMS actor: the signed-in student/teacher, else the admin (admin session on this device). */
export function useLmsActor(): { actor: Actor | null; asAdmin: boolean; ready: boolean } {
  const [st, setSt] = useState<{ actor: Actor | null; asAdmin: boolean; ready: boolean }>({ actor: null, asAdmin: false, ready: false });
  useEffect(() => {
    const s = lmsSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setSt({ actor: s.user, asAdmin: false, ready: true });
    else if (getServerSession()) setSt({ actor: { id: "admin", role: "admin", name: "Admin", cls: "", perms: ["assign", "review", "manageUsers", "viewAll"] }, asAdmin: true, ready: true });
    else setSt({ actor: null, asAdmin: false, ready: true });
  }, []);
  return st;
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
