"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTr, useLmsActor } from "@/components/lms/useLms";
import { qhwPerm } from "@/lib/lmsMods";
import { setOrigin } from "@/lib/origin";
import { useUnreadMsgs } from "@/components/lms/DashWidgets";
import { mpShown, stuUi } from "@/lib/lms";

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
  att: "M5 4h14v17H5zM9 2v4M15 2v4M5 10h14M9 15l2 2 4-4",
  beh: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z",
  cur: "M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z",
  res: "M7 4h10v5a5 5 0 0 1-10 0zM9 20h6M12 14v6",
};
// lvl = smallest width class at which the tab sits in the strip (0 = always, 1 = sm, 2 = md, 3 = lg); the rest live in "More".
const STUDENT: Tab[] = [
  { id: "dash", href: "/lms", en: "Dashboard", ar: "اللوحة", icon: I.dash, lvl: 0 },
  { id: "hw", href: "/lms/homework", en: "Homework", ar: "الواجبات", icon: I.hw, lvl: 0 },
  { id: "assess", href: "/lms/assessments", en: "Assessments", ar: "التقييمات", icon: I.assess, lvl: 1 },
  { id: "msg", href: "/lms/messages", en: "Messages", ar: "الرسائل", icon: I.msg, lvl: 1 },
  { id: "wall", href: "/lms/wall", en: "Class Wall", ar: "جدار الصف", icon: I.wall, lvl: 2 },
  { id: "quran", href: "/lms", hash: "#tracker", en: "Quran Tracker", ar: "متابعة الحفظ", icon: I.quran, lvl: 2 },
  { id: "lib", href: "/lms/library", en: "Learning Libraries", ar: "مكتبات التعلم", icon: I.cur, lvl: 1 },
];
const TEACHER: Tab[] = [
  { id: "dash", href: "/lms", en: "Dashboard", ar: "اللوحة", icon: I.dash, lvl: 0 },
  { id: "cls", href: "/lms/classes", en: "My classes", ar: "صفوفي", icon: I.cls, lvl: 0 },
  { id: "hw", href: "/lms/homework", en: "Homeworks", ar: "الواجبات", icon: I.hw, lvl: 1 },
  { id: "assess", href: "/lms/assessments", en: "Assessments", ar: "التقييمات", icon: I.assess, lvl: 2 },
  { id: "msg", href: "/lms/messages", en: "Messages", ar: "الرسائل", icon: I.msg, lvl: 2 },
  { id: "act", href: "/lms/activities", en: "Activities", ar: "الأنشطة", icon: I.act, lvl: 3 },
  { id: "wall", href: "/lms/wall", en: "Wall", ar: "الجدار", icon: I.wall, lvl: 3 },
  { id: "res", href: "/lms/results", en: "Results", ar: "النتائج", icon: I.res, lvl: 3 },
];
// Child-friendly look: one emoji per area, each on its own theme-coloured disc.
const EMOJI: Record<string, string> = { rep: "📈", dash: "🏠", hw: "📝", assess: "✅", msg: "💬", wall: "🧱", quran: "📖", qhw: "📖", cls: "🏫", act: "🎲", res: "📊", att: "🗓️", beh: "🌟", cur: "📚", logins: "🔑", acct: "🙂", stu: "👥", map: "🗺️", pts: "🏆", fcur: "📚", fassess: "✅", corr: "💯" };
const DISC = ["bg-sun text-[#0b1b2b]", "bg-[#2e9c8f] text-white", "bg-coral text-[#3b1710]", "bg-[#bfdff3] text-header", "bg-[#cdebe4] text-[#0f4a42]", "bg-[#fde0d9] text-[#6b2b1d]"];

/**
 * The ONE navigation of the LMS (student, teacher and parent): a colourful LEFT icon rail on every screen size
 * (narrow on phones), collapsible on both. Hidden modules never appear (server-enforced separately).
 */
export function LmsTabs() {
  const { tr, lang } = useTr();
  const { actor, ready } = useLmsActor();
  useEffect(() => { setOrigin("lms"); }, []);
  const unread = useUnreadMsgs();
  // Collapsible rail, remembered per device type: desktop collapses to icons only, phones hide it behind a small button.
  const [mob, setMob] = useState(false);
  const [col, setCol] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const upd = () => { setMob(mq.matches); setCol(localStorage.getItem(mq.matches ? "sm-rail-m" : "sm-rail-d") === "1"); };
    upd(); mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  const toggle = (v: boolean) => { setCol(v); try { localStorage.setItem(mob ? "sm-rail-m" : "sm-rail-d", v ? "1" : "0"); } catch { /* ignore */ } };
  const [path, setPath] = useState("");
  const [hash, setHash] = useState("");
  useEffect(() => {
    const upd = () => { setPath(window.location.pathname.replace(/\/$/, "") || "/"); setHash(window.location.hash); };
    upd();
    window.addEventListener("hashchange", upd); window.addEventListener("popstate", upd);
    return () => { window.removeEventListener("hashchange", upd); window.removeEventListener("popstate", upd); };
  }, []);
  if (!ready || !actor || actor.viewAs) return null;
  const isParent = actor.role === "parent";
  const staff = actor.role === "teacher";
  const pm = (m: string) => actor.perms?.includes(`${m}:view`) || actor.perms?.includes(`${m}:edit`) || actor.perms?.includes(`${m}:delete`);
  const qp = qhwPerm(actor.perms);
  const extra: Tab[] = [
    ...(staff && (actor.perms?.includes("manageUsers") || actor.perms?.some((p) => p.startsWith("stu:"))) ? [{ id: "stu", href: "/lms/students", en: "My students", ar: "طلابي", icon: "", lvl: 3 } as Tab] : []),
    ...(pm("att") ? [{ id: "att", href: "/lms/attendance", en: "Attendance", ar: "الحضور", icon: I.att, lvl: 3 } as Tab] : []),
    ...(pm("beh") ? [{ id: "beh", href: "/lms/behaviour", en: "Behaviour", ar: "السلوك", icon: I.beh, lvl: 3 } as Tab] : []),
    ...(!staff && !isParent ? [{ id: "cur", href: "/lms/curriculum", en: "Curriculum", ar: "المنهج", icon: I.cur, lvl: 3 } as Tab] : []),
    ...(staff && pm("cur") ? [{ id: "cur", href: "/lms/curriculum", en: "Curriculum", ar: "المنهج", icon: I.cur, lvl: 3 } as Tab] : []),
    ...(staff && qp.show ? [{ id: "map", href: "/lms/map", en: "Quran map", ar: "خريطة القرآن", icon: "", lvl: 3 } as Tab] : []),
    ...(staff ? [{ id: "pts", href: "/lms/points", en: "Points", ar: "النقاط", icon: "", lvl: 3 } as Tab] : []),
    ...(staff && !actor.perms?.includes("trk:view:off") && mpShown(actor, "trk") ? [{ id: "trk", href: "/lms/tracker", en: "Assessment Tracker", ar: "متتبع التقييم", icon: "", lvl: 3 } as Tab] : []),
    ...(staff && actor.perms?.includes("rep:view") && mpShown(actor, "rep") ? [{ id: "rep", href: "/lms/reports", en: "Department Report", ar: "تقرير القسم", icon: "", lvl: 3 } as Tab] : []),
  ];
  const loginsTab: Tab[] = staff && stuUi(actor.perms || [], "view") ? [{ id: "logins", href: "/lms/logins", en: "Student Logins", ar: "دخول الطلاب", icon: "", lvl: 3 }] : [];
  const acctTab: Tab[] = [{ id: "acct", href: "/lms/account", en: "My account", ar: "حسابي", icon: "", lvl: 3 }];
  const qTab: Tab[] = false && staff && qp.show ? [{ id: "qhw", href: "/lms/quran", en: "Quran Homework", ar: "واجب القرآن", icon: I.quran, lvl: 2 }, ...(qp.view ? [{ id: "corr", href: "/lms/corrected", en: "Corrected", ar: "المصحَّح", icon: "", lvl: 2 } as Tab] : [])] : [];
  const PARENT: Tab[] = [
    { id: "dash", href: "/lms/family", en: "Dashboard", ar: "اللوحة", icon: I.dash, lvl: 0 },
    { id: "hw", href: "/lms/family", hash: "#homework", en: "Homework", ar: "الواجبات", icon: I.hw, lvl: 0 },
    { id: "assess", href: "/lms/family", hash: "#assess", en: "Assessments", ar: "التقييمات", icon: I.assess, lvl: 0 },
    { id: "fcur", href: "/lms/family", hash: "#cur", en: "Curriculum", ar: "المنهج", icon: I.cur, lvl: 0 },
    { id: "att", href: "/lms/family", hash: "#att", en: "Attendance", ar: "الحضور", icon: I.att, lvl: 0 },
    { id: "beh", href: "/lms/family", hash: "#beh", en: "Behaviour", ar: "السلوك", icon: I.beh, lvl: 0 },
    { id: "quran", href: "/lms/family", hash: "#quran", en: "Quran", ar: "القرآن", icon: I.quran, lvl: 0 },
    { id: "wall", href: "/lms/family", hash: "#wall", en: "Class Wall", ar: "جدار الصف", icon: I.wall, lvl: 0 },
    { id: "msg", href: "/lms/messages", en: "Messages", ar: "الرسائل", icon: I.msg, lvl: 0 },
  ];
  const HID: Record<string, string> = { hw: "homework", assess: "assessments", msg: "messaging", wall: "wall", act: "activities", res: "results" };
  const shownT = (t: Tab) => !(HID[t.id] && actor.perms?.includes(`hide:${HID[t.id]}`));
  const tabs = isParent ? [...PARENT, ...acctTab] : staff ? [...TEACHER.slice(0, 3), ...qTab, ...TEACHER.slice(3), ...extra, ...loginsTab, ...acctTab].filter(shownT) : [...STUDENT, ...extra, ...acctTab];
  const isActive = (t: Tab) => {
    if (t.hash) return path === t.href && hash === t.hash;
    if (t.id === "dash") return path === t.href && !tabs.some((x) => x.href === t.href && x.hash && x.hash === hash);
    return path === t.href;
  };
  const label = (t: Tab) => (lang === "ar" ? t.ar : t.en);
  const slim = col && !mob; // desktop, collapsed: icons only
  if (col && mob) {
    return (
      <button type="button" onClick={() => toggle(false)} className="fixed bottom-4 start-3 z-50 grid h-12 w-12 place-items-center rounded-full bg-header text-[22px] text-white shadow-xl ring-2 ring-sun" aria-label={tr("Show menu", "إظهار القائمة")} title={tr("Show menu", "إظهار القائمة")} data-testid="lms-rail-open">☰</button>
    );
  }
  return (
    <nav className={`sticky top-0 z-40 h-dvh shrink-0 overflow-y-auto overflow-x-hidden bg-header text-white [scrollbar-width:none] ${slim ? "w-[68px]" : "w-[64px] md:w-[108px]"}`} aria-label={tr("Main sections", "الأقسام الرئيسية")} data-testid="lms-tabs" data-collapsed={col ? "1" : "0"}>
      <div className="flex flex-col items-center gap-1 px-1 py-2 md:gap-1.5 md:px-2 md:py-3">
        <button type="button" onClick={() => toggle(!col)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-black text-white hover:bg-white/20" aria-label={col ? tr("Expand menu", "توسيع القائمة") : tr("Collapse menu", "طي القائمة")} title={col ? tr("Expand menu", "توسيع القائمة") : tr("Collapse menu", "طي القائمة")} data-testid="lms-rail-toggle"><span className="rtl:rotate-180" aria-hidden>{col ? "»" : "«"}</span></button>
        <Link href="/" className={`hidden shrink-0 ${slim ? "" : "md:block"}`} aria-label={tr("Home", "الرئيسية")} data-testid="lms-rail-logo"><img src="/logo.svg" alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-full" /></Link>
        {tabs.map((t, i) => {
          const on = isActive(t);
          return (
            <a key={t.id} href={t.href + (t.hash || "")} title={label(t)} onClick={() => { if (t.hash) setTimeout(() => { setPath(window.location.pathname.replace(/\/$/, "") || "/"); setHash(window.location.hash); }, 0); }} aria-current={on ? "page" : undefined} aria-label={label(t)} data-testid={`lms-tab-${t.id}`} className={`relative flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1.5 text-center font-extrabold leading-tight transition md:gap-1 md:py-2 ${slim ? "w-[56px]" : "w-[58px] text-[9px] md:w-[92px] md:px-1 md:text-[11.5px]"} ${on ? "bg-sun text-[#0b1b2b] shadow-lg" : "text-white/90 hover:bg-white/10"}`}>
              <span className={`grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none ${slim ? "" : "md:h-11 md:w-11 md:text-[26px]"} ${on ? "bg-white" : DISC[i % DISC.length]}`} aria-hidden>{EMOJI[t.id] || "⭐"}</span>
              {!slim && <span className="line-clamp-2 w-full break-words max-md:line-clamp-1 max-md:truncate">{label(t)}</span>}
              {t.id === "msg" && unread > 0 && <span className="absolute end-0.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white" data-testid="msg-badge">{unread > 99 ? "99+" : unread}</span>}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
