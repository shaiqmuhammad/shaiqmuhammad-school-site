"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTr, useLmsActor } from "@/components/lms/useLms";

type Tab = { id: string; href: string; hash?: string; en: string; ar: string; icon: string; lvl: 0 | 1 | 2 | 3 };
const I = {
  dash: "M4 13h7V4H4zM13 20h7v-9h-7zM13 4v5h7V4zM4 20h7v-5H4z",
  hw: "M6 4h12v16H6zM9 9h6M9 13h4",
  assess: "M4 5h16v14H4zM8 9h8M8 13h5",
  msg: "M4 5h16v11H8l-4 4z",
  wall: "M4 5h16v14H4zM4 11h16M10 5v6M15 11v8",
  quran: "M4 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4zM20 5h-6v15a3 3 0 0 1 3-3h3z",
  cls: "M4 6h16M4 12h16M4 18h10",
  act: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z",
  res: "M7 4h10v5a5 5 0 0 1-10 0zM9 20h6M12 14v6",
};
// lvl = smallest width class at which the tab sits in the strip (0 = always, 1 = sm, 2 = md, 3 = lg); the rest live in "More".
const STUDENT: Tab[] = [
  { id: "dash", href: "/lms", en: "Dashboard", ar: "اللوحة", icon: I.dash, lvl: 0 },
  { id: "hw", href: "/lms", hash: "#homework", en: "Homework", ar: "الواجبات", icon: I.hw, lvl: 0 },
  { id: "assess", href: "/lms/assessments", en: "Assessments", ar: "التقييمات", icon: I.assess, lvl: 1 },
  { id: "msg", href: "/lms/messages", en: "Messages", ar: "الرسائل", icon: I.msg, lvl: 1 },
  { id: "wall", href: "/lms/wall", en: "Class Wall", ar: "جدار الصف", icon: I.wall, lvl: 2 },
  { id: "quran", href: "/lms", hash: "#tracker", en: "Quran Tracker", ar: "متابعة الحفظ", icon: I.quran, lvl: 2 },
];
const TEACHER: Tab[] = [
  { id: "dash", href: "/lms", en: "Dashboard", ar: "اللوحة", icon: I.dash, lvl: 0 },
  { id: "cls", href: "/lms/classes", en: "My classes", ar: "صفوفي", icon: I.cls, lvl: 0 },
  { id: "hw", href: "/lms", hash: "#homework", en: "Homework", ar: "الواجبات", icon: I.hw, lvl: 1 },
  { id: "assess", href: "/lms/assessments", en: "Assessments", ar: "التقييمات", icon: I.assess, lvl: 2 },
  { id: "msg", href: "/lms/messages", en: "Messages", ar: "الرسائل", icon: I.msg, lvl: 2 },
  { id: "act", href: "/lms/activities", en: "Activities", ar: "الأنشطة", icon: I.act, lvl: 3 },
  { id: "wall", href: "/lms/wall", en: "Wall", ar: "الجدار", icon: I.wall, lvl: 3 },
  { id: "res", href: "/lms/results", en: "Results", ar: "النتائج", icon: I.res, lvl: 3 },
];
const SHOW = ["", "max-sm:hidden", "max-md:hidden", "max-lg:hidden"]; // tab hidden below its level
const MORE_ITEM = ["hidden", "hidden max-sm:flex", "hidden max-md:flex", "hidden max-lg:flex"]; // More entry shown only while the tab is hidden
const MORE_BTN = ["", "sm:hidden", "md:hidden", "lg:hidden"]; // More button disappears once every tab fits

/** Main areas as tabs under the LMS header (both student and teacher areas): active highlight, overflow into "More", Dashboard always first. */
export function LmsTabs() {
  const { tr, lang } = useTr();
  const { actor, ready } = useLmsActor();
  const [path, setPath] = useState("");
  const [hash, setHash] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; w: number; rtl: boolean }>({ top: 0, left: 0, w: 224, rtl: false });
  useEffect(() => {
    const upd = () => { setPath(window.location.pathname.replace(/\/$/, "") || "/"); setHash(window.location.hash); };
    upd();
    window.addEventListener("hashchange", upd); window.addEventListener("popstate", upd);
    return () => { window.removeEventListener("hashchange", upd); window.removeEventListener("popstate", upd); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !(box.current?.contains(e.target as Node) || panel.current?.contains(e.target as Node))) setOpen(false); };
    const place = () => {
      const r = box.current?.getBoundingClientRect(); if (!r) return;
      const vw = window.innerWidth; const rtl = document.documentElement.dir === "rtl";
      if (vw < 640) setPos({ top: r.bottom + 4, left: 8, w: vw - 16, rtl });
      else setPos({ top: r.bottom + 4, left: rtl ? Math.max(8, r.right - 224) : Math.min(r.left, vw - 232), w: 224, rtl });
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  if (!ready || !actor || actor.viewAs) return null;
  const staff = actor.role !== "student";
  const tabs = staff ? TEACHER : STUDENT;
  const dashName = staff ? tr("Teacher Dashboard", "لوحة المعلم") : tr("Student Dashboard", "لوحة الطالب");
  const isActive = (t: Tab) => (t.href === "/lms" ? path === "/lms" && (t.hash ? hash === t.hash : !tabs.some((x) => x.hash && x.hash === hash)) : path === t.href);
  const cur = tabs.find(isActive);
  const hasMore = tabs.some((t) => t.lvl > 0);
  const moreTo = Math.max(...tabs.map((t) => t.lvl));
  const label = (t: Tab) => (lang === "ar" ? t.ar : t.en);
  const moreActive = tabs.some((t) => t.lvl > 0 && isActive(t));
  const base = "relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-bold transition hover:text-sun";
  return (
    <nav className="relative border-t border-white/10" aria-label={tr("Main sections", "الأقسام الرئيسية")} data-testid="lms-tabs">
      <div className="mx-auto flex max-w-[1800px] items-center gap-1 px-2 sm:px-5">
        <div className="flex min-w-0 items-center">
          {tabs.map((t) => (
            <a key={t.id} href={t.href + (t.hash || "")} onClick={() => { if (t.hash) setTimeout(() => { setPath(window.location.pathname.replace(/\/$/, "") || "/"); setHash(window.location.hash); }, 0); }} aria-current={isActive(t) ? "page" : undefined} data-testid={`lms-tab-${t.id}`} className={`${base} ${SHOW[t.lvl]} ${isActive(t) ? "text-sun after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t after:bg-sun" : "text-white/85"}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>{t.id === "dash" ? <><span className="sm:hidden">{label(t)}</span><span className="max-sm:hidden">{dashName}</span></> : label(t)}
            </a>
          ))}
          {hasMore && (
            <div className={`sm:relative ${MORE_BTN[moreTo]}`} ref={box}>
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="lms-tab-more" className={`${base} ${moreActive ? "text-sun" : "text-white/85"}`}>
                {tr("More", "المزيد")} <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {open && createPortal(
                <div ref={panel} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.w, zIndex: 2147483000 }} className="rounded-2xl bg-header p-2 text-white shadow-2xl ring-1 ring-white/10" data-testid="lms-tab-more-panel">
                  {tabs.filter((t) => t.lvl > 0).map((t) => (
                    <a key={t.id} href={t.href + (t.hash || "")} onClick={() => setOpen(false)} aria-current={isActive(t) ? "page" : undefined} className={`${MORE_ITEM[t.lvl]} items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/10 hover:text-sun ${isActive(t) ? "bg-white/15 text-sun" : ""}`} data-testid={`lms-more-${t.id}`}>
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-sun" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>{label(t)}
                    </a>
                  ))}
                </div>, document.body)}
            </div>
          )}
        </div>
        <p className="ms-auto hidden min-w-0 truncate text-xs text-white/60 lg:block" data-testid="lms-crumb"><Link href="/" className="hover:text-sun">{tr("Home", "الرئيسية")}</Link> › <a href="/lms" className="hover:text-sun">{dashName}</a>{cur && cur.id !== "dash" ? <> › <span className="text-white/90">{label(cur)}</span></> : null}</p>
      </div>
    </nav>
  );
}
