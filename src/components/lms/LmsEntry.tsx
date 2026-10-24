"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/lms/Avatar";
import { modCall } from "@/lib/lmsMods";
import { useRouter } from "next/navigation";
import { AdminToolbar } from "@/components/AdminToolbar";
import { LmsBell } from "@/components/lms/LmsBell";
import { MsgIcon } from "@/components/lms/Messages";
import { viewAs, lmsSession, lmsSignOut } from "@/lib/lms";
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
    // t305: the header shows only the user's character / photo (a link to My account); refreshed when they change it.
    const load = () => { if (s && s.user.role !== "parent") modCall<{ avatar: string; name?: string; nameAr?: string; arabic?: boolean }>("my-avatar-kind", {}, false).then((r) => { setAv(r.avatar); setNm({ en: r.name || "", ar: r.arabic && r.nameAr ? r.nameAr : "" }); }).catch(() => undefined); };
    load(); window.addEventListener("sm-avatar", load);
    return () => window.removeEventListener("sm-avatar", load);
  }, []);
  const [av, setAv] = useState("");
  const [nm, setNm] = useState<{ en: string; ar: string }>({ en: "", ar: "" });
  const ar = lang === "ar";
  if (typeof window !== "undefined" && viewAs()) return null; // view-as: the banner is the only control (no LMS logout)
  const fullName = (ar && nm.ar) || nm.en || who?.name || "";
  const greet = who?.role === "teacher" ? (ar ? `مرحبًا 👋 المعلم ${fullName}` : `Hello 👋 Teacher ${fullName}`) : ar ? `مرحبًا 👋 الطالب ${fullName}` : `Hello 👋 Student ${fullName}`;
  const roleLabel = who?.role === "teacher" ? (ar ? "المعلم" : "Teacher") : who?.role === "parent" ? (ar ? "ولي الأمر" : "Parent") : ar ? "الطالب" : "Student";
  return (
    <div className="flex items-center gap-2">
      {who && who.role !== "parent" && (
        // t308: "Hello 👋 Teacher/Student <Full name>" (Arabic: Islamic A students see their Arabic name); the avatar opens My account.
        <span className="min-w-0 max-w-[9.5rem] truncate text-sm font-bold text-white sm:max-w-[22rem]" dir="auto" title={greet} data-testid="lms-greet">{greet}</span>
      )}
      {who && (
        <Link href="/lms/account" title={`${ar ? "حسابي" : "My account"} · ${who.name}`} aria-label={`${ar ? "حسابي" : "My account"} — ${roleLabel}: ${who.name}`} className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/40 transition hover:scale-105 hover:ring-sun" data-testid="lms-who">
          {av ? <Avatar code={av} size={36} /> : <span aria-hidden>{who.role === "teacher" ? "🧑‍🏫" : who.role === "parent" ? "👨‍👩‍👧" : "🎒"}</span>}
        </Link>
      )}
      <AdminToolbar
        variant="navy"
        bell={who ? <LmsBell /> : undefined}
        msg={who && who.role !== "parent" ? <MsgIcon href="/lms/messages" /> : undefined}
        onLogout={() => {
          lmsSignOut();
          router.push("/lms/login");
        }}
      />
    </div>
  );
}

/** t306: the signed-in user's current character / photo, refreshed on "sm-avatar" (fired after any change in My account). */
export function useMyAvatar(fallback = "") {
  const [av, setAv] = useState(fallback);
  useEffect(() => {
    const s = lmsSession();
    const load = () => { if (s && s.user.role !== "parent") modCall<{ avatar: string }>("my-avatar-kind", {}, false).then((r) => setAv(r.avatar)).catch(() => undefined); };
    load(); window.addEventListener("sm-avatar", load);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("sm-avatar", load); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return av || fallback;
}
