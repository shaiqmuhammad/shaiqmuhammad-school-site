"use client";

import { MsgIcon } from "@/components/lms/Messages";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminToolbar } from "@/components/AdminToolbar";
import { LmsBell } from "@/components/lms/LmsBell";
import { lmsApi, viewAs, lmsSession, lmsSignOut } from "@/lib/lms";
import { useI18n } from "@/lib/i18n";

/** True once a student/teacher session exists on this device (read after hydration). */
export function useLmsSignedIn() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setOn(Boolean(lmsSession()));
  }, []);
  return on;
}

/** Header pill: "Login" (→ /lms/login) or "My Area" (→ /lms) when signed in. Outline style so Join stays primary. */
export function LmsHeaderButton({ mobile = false, onPick }: { mobile?: boolean; onPick?: () => void }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const signedIn = useLmsSignedIn();
  const label = signedIn ? (ar ? "منطقتي" : "My Area") : ar ? "تسجيل الدخول" : "Login";
  const href = signedIn ? "/lms" : "/lms/login";
  if (mobile) {
    return (
      <Link href={href} onClick={onPick} data-testid="mobile-lms-login" className="btn-glass flex w-full justify-center px-4 py-2 text-sm font-semibold">
        🎓 {label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      data-testid="header-lms-login"
      title={signedIn ? label : ar ? "دخول الطلاب والمعلمين" : "Student & Teacher Login"}
      aria-label={signedIn ? label : ar ? "دخول الطلاب والمعلمين" : "Student & Teacher Login"}
      className="pill-on-navy hidden h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap !px-2 text-sm font-semibold sm:inline-flex xl:!px-3"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6" /></svg>
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}

/** Home page card: "Student & Teacher Area". */
export function LmsHomeCard() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const signedIn = useLmsSignedIn();
  return (
    <div className="glass flex flex-col items-start gap-4 rounded-[20px] p-6 sm:flex-row sm:items-center sm:p-8" data-testid="home-lms-card">
      <span className="text-5xl" aria-hidden>🎒</span>
      <div className="flex-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-heading">{ar ? "منطقة الطلاب والمعلمين" : "Student & Teacher Area"}</h2>
        <p className="mt-1 text-muted">
          {ar ? "الواجبات، تلاوة القرآن ومتابعة الحفظ، وتعليقات المعلم — سجّل الدخول باسم المستخدم والرقم السري من معلمك." : "Homework, Quran practice and your memorisation tracker, and teacher feedback — sign in with the username and PIN from your teacher."}
        </p>
      </div>
      <Link href={signedIn ? "/lms" : "/lms/login"} className="btn-cta shrink-0 px-5 py-2.5 text-sm" data-testid="home-lms-login">
        {signedIn ? (ar ? "منطقتي" : "My Area") : ar ? "تسجيل الدخول" : "Login"} →
      </Link>
    </div>
  );
}

/** LMS top-bar: who is signed in ("Teacher: name" / "Student: name") + icon toolbar. Log out ends ONLY the LMS session. */
export function LmsStaffToolbar() {
  const router = useRouter();
  const { lang } = useI18n();
  const [who, setWho] = useState<{ role: string; name: string } | null>(null);
  useEffect(() => {
    const s = lmsSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    if (s) setWho({ role: s.user.role, name: s.user.name });
  }, []);
  const ar = lang === "ar";
  if (typeof window !== "undefined" && viewAs()) return null; // view-as: the banner is the only control (no LMS logout)
  const roleLabel = who?.role === "teacher" ? (ar ? "المعلم" : "Teacher") : ar ? "الطالب" : "Student";
  return (
    <div className="flex items-center gap-2">
      {who && (
        <span className="hidden max-w-[14rem] truncate rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white sm:inline" data-testid="lms-who" dir="auto">
          {who.role === "teacher" ? "🧑‍🏫" : "🎒"} {roleLabel}: {who.name}
        </span>
      )}
      {who?.role === "teacher" && <TeacherMenu ar={ar} />}
      {who && <MsgIcon href="/lms/messages" />}
      {who && (
        <nav className="flex items-center gap-1" aria-label={ar ? "روابط سريعة" : "Quick links"}>
          {([["/lms", ar ? "واجباتي" : "Homework", "M5 4h11l3 3v13H5zM9 12l2 2 4-4", "lms-quick-hw"], ["/lms/assessments", ar ? "التقييمات" : "Assessments", "M4 5h16v14H4zM8 9h8M8 13h5", "lms-quick-assess"]] as const).map(([href, l, d, id]) => (
            <a key={href} href={href} title={l} aria-label={l} data-testid={id} className="pill-on-navy inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-xs font-bold">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
              <span className="hidden lg:inline">{l}</span>
            </a>
          ))}
        </nav>
      )}
      <AdminToolbar
        variant="navy"
        bell={who ? <LmsBell /> : undefined}
        onLogout={() => {
          lmsSignOut();
          router.push("/lms/login");
        }}
      />
    </div>
  );
}

/** Teacher navigation grouped like the admin sidebar (only areas a teacher can use). */
function TeacherMenu({ ar }: { ar: boolean }) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<string[]>([]);
  useEffect(() => { if (open && !perms.length) lmsApi.me().then((r) => setPerms(r.user.perms || [])).catch(() => undefined); }, [open, perms.length]);
  const t = (en: string, a: string) => (ar ? a : en);
  const tools = perms.some((p) => p.startsWith("act:"));
  const groups: [string, [string, string][]][] = [
    [t("Teaching and Learning", "التعليم والتعلّم"), [["/lms/map", t("Class Quran map", "خريطة القرآن للصف")]]],
    [t("Members", "الأعضاء"), [["/lms/students", t("My students", "طلابي")]]],
    [t("Assessment", "التقييم"), [["/lms", t("Homework", "الواجبات")], ["/lms/assessments", t("Assessments", "التقييمات")]]],
    ...(tools ? [[t("Teaching Tools", "أدوات التدريس"), [["/lms/activities", t("Classroom activities", "أنشطة الصف")]]]] as [string, [string, string][]][] : []),
  ];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="pill-on-navy inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-xs font-bold" data-testid="lms-teacher-menu">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span className="hidden lg:inline">{t("Menu", "القائمة")}</span>
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-[2147482999] cursor-default" aria-label={t("Close", "إغلاق")} onClick={() => setOpen(false)} />
          <nav className="fixed inset-x-2 top-16 z-[2147483000] rounded-2xl bg-header p-3 text-white shadow-2xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-64" data-testid="lms-teacher-menu-panel">
            {groups.map(([g, items]) => (
              <div key={g} className="pb-2 last:pb-0">
                <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">{g}</p>
                {items.map(([href, l]) => <a key={href + l} href={href} className="block rounded-xl px-2 py-1.5 text-sm hover:bg-white/10 hover:text-sun">{l}</a>)}
              </div>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
