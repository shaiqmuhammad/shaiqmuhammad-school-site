"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AssessmentShell, fieldCls, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession } from "@/lib/lms";

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
  return (
    <AssessmentShell title={tr("Sign in", "تسجيل الدخول")} exitHref="/">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <form
          className={panelCls}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setErr("");
            try {
              await lmsApi.login(username.trim(), pin.trim());
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
            {tr("PIN", "الرقم السري")}
            <input className={fieldCls + " text-xl tracking-[0.4em]"} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" type="password" autoComplete="current-password" dir="ltr" data-testid="lms-pin" />
          </label>
          {err && <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert" data-testid="lms-login-error">{err}</p>}
          <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={busy || !username.trim() || pin.length < 4} data-testid="lms-login-submit">
            {busy ? "…" : tr("Sign in", "دخول")} →
          </button>
        </form>
      </div>
    </AssessmentShell>
  );
}
