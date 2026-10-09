"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminToolbar } from "@/components/AdminToolbar";
import { clearServerSession, forumPendingCount, getServerSession } from "@/lib/adminServer";
import { lmsSession, lmsSignOut } from "@/lib/lms";
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
        🎒 {label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      data-testid="header-lms-login"
      title={ar ? "دخول الطلاب والمعلمين" : "Student / Teacher login"}
      className="pill-on-navy hidden h-9 shrink-0 whitespace-nowrap px-3 text-sm font-semibold sm:inline-flex"
    >
      {label}
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

/** Staff (teacher/admin) icon toolbar for the LMS top bar. For the admin it also shows the forum bell
 * (polled every 60 s, like the Admin page). Log out ends both the LMS and admin sessions on this device. */
export function LmsStaffToolbar() {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (lmsSession() || !getServerSession()) return;
    let stop = false;
    const check = async () => {
      const n = await forumPendingCount();
      if (!stop && n !== null) setPending(n);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- admin session is only readable after hydration
    setAdmin(true);
    void check();
    const t = setInterval(check, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <AdminToolbar
      variant="navy"
      pending={pending}
      onBell={admin ? () => router.push("/admin#forum") : undefined}
      onLogout={() => {
        lmsSignOut();
        clearServerSession();
        router.push("/lms/login");
      }}
    />
  );
}
