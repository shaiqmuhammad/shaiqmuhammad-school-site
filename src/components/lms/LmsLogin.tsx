"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AssessmentShell, fieldCls, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsRestoreRemembered, lmsSession } from "@/lib/lms";

/** Student / teacher sign-in: username + PIN. */
export function LmsLogin() {
  const { tr } = useTr();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [who, setWho] = useState<"school" | "parent">("school");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // t422: "Remember this iPad" (students only; opt-in; never for teachers/admin/parents).
  const [remember, setRemember] = useState(false);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let live = true;
    lmsRestoreRemembered().then((ok) => { if (!live) return; if (ok) router.replace(next && next.startsWith("/lms") ? next : "/lms"); else setRestoring(false); }).catch(() => setRestoring(false));
    return () => { live = false; };
  }, [router, next]);
  return (
    <AssessmentShell title={tr("Sign in", "تسجيل الدخول")} exitHref="/">
      {restoring && <p className="sr-only" role="status">{tr("Checking this device…", "جارٍ التحقق من الجهاز…")}</p>}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <form
          className={panelCls}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setErr("");
            try {
              await lmsApi.login(username.trim(), pin.trim(), who === "school" && remember);
              const isParent = lmsSession()?.user.role === "parent";
              router.push(isParent ? "/lms/family" : next && next.startsWith("/lms") ? next : "/lms");
            } catch (x) {
              setErr(lmsErrorText(x, tr));
              setBusy(false);
            }
          }}
          data-testid="lms-login"
        >
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-black/5 p-1 dark:bg-white/10" role="radiogroup" aria-label={tr("Account type", "نوع الحساب")}>
            {(["school", "parent"] as const).map((w) => <button key={w} type="button" role="radio" aria-checked={who === w} onClick={() => { setWho(w); setErr(""); }} data-testid={`lms-login-${w}`} className={`rounded-full px-3 py-2 text-sm font-bold transition ${who === w ? "bg-header text-sun shadow" : ""}`}>{w === "school" ? "🎒 " + tr("Student / Teacher", "طالب / معلم") : "👨‍👩‍👧 " + tr("Parent", "ولي أمر")}</button>)}
          </div>
          <p className="text-4xl" aria-hidden>{who === "parent" ? "👨‍👩‍👧" : "🎒"}</p>
          <h1 className="mt-2 text-3xl font-bold">{who === "parent" ? tr("Parent login", "دخول أولياء الأمور") : tr("Student / Teacher login", "دخول الطلاب والمعلمين")}</h1>
          <p className="mt-1 opacity-80">{who === "parent" ? tr("Sign in with the username and PIN the school gave you.", "سجّل الدخول باسم المستخدم والرقم السري اللذين أعطتك إياهما المدرسة.") : tr("Sign in with the username and PIN from your teacher.", "سجّل الدخول باسم المستخدم والرقم السري من معلمك.")}</p>
          <p className="mt-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:bg-sky-900/30 dark:text-sky-100" data-testid="lms-login-help">
            ℹ️ {who === "parent" ? tr("Parent accounts are created by the school office. Contact the school for your username and PIN.", "حسابات أولياء الأمور تُنشئها إدارة المدرسة. تواصل مع المدرسة للحصول على اسم المستخدم والرقم السري.") : tr("Accounts are created by your teacher. Ask your teacher for your username and PIN.", "الحسابات يُنشئها معلمك. اطلب من معلمك اسم المستخدم والرقم السري.")}
          </p>
          <label className="mt-6 block font-semibold">
            {tr("Username", "اسم المستخدم")}
            <input className={fieldCls + " text-xl"} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" dir="ltr" data-testid="lms-username" />
          </label>
          <label className="mt-4 block font-semibold">
            {tr("Password / PIN", "كلمة المرور / الرقم السري")}
            <input className={fieldCls + " text-xl tracking-[0.15em]"} value={pin} onChange={(e) => setPin(e.target.value.slice(0, 64))} type="password" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={64} autoComplete="current-password" dir="ltr" data-testid="lms-pin" />
          </label>
          {who === "school" && (
            <div className="mt-4 rounded-2xl bg-[#1b3a57]/5 p-3 dark:bg-white/10" data-testid="lms-remember-box">
              <label className="flex items-start gap-3 font-bold">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1b3a57]" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="lms-remember" />
                <span>📱 {tr("Remember this iPad (students)", "تذكّر هذا الآيباد (للطلاب)")}<span className="block text-xs font-normal opacity-80">{tr("Stay signed in on your own school iPad — no password each time.", "ابقَ مسجّلًا على آيبادك المدرسي — بدون كلمة مرور كل مرة.")}</span></span>
              </label>
              {remember && <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900" role="note" data-testid="lms-remember-warn">⚠️ {tr("Only tick this on YOUR OWN iPad. Never on a shared or family device. Tap Log out to forget this iPad.", "اختر هذا فقط على آيبادك الخاص. لا تختره على جهاز مشترك. اضغط تسجيل الخروج لنسيان هذا الآيباد.")}</p>}
            </div>
          )}
          {err && <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert" data-testid="lms-login-error">{err}</p>}
          <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={busy || !username.trim() || pin.length < 4} data-testid="lms-login-submit">
            {busy ? "…" : tr("Sign in", "دخول")} →
          </button>
        </form>
      </div>
    </AssessmentShell>
  );
}
