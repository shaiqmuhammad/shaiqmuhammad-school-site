"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AssessmentShell, fieldCls, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText } from "@/lib/lms";

/** Student / teacher sign-in: username + PIN. */
export function LmsLogin() {
  const { tr } = useTr();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
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
              router.push(next && next.startsWith("/lms") ? next : "/lms");
            } catch (x) {
              setErr(lmsErrorText(x, tr));
              setBusy(false);
            }
          }}
          data-testid="lms-login"
        >
          <p className="text-4xl" aria-hidden>🎒</p>
          <h1 className="mt-2 text-3xl font-bold">{tr("Student / Teacher login", "دخول الطلاب والمعلمين")}</h1>
          <p className="mt-1 opacity-80">{tr("Sign in with the username and PIN from your teacher.", "سجّل الدخول باسم المستخدم والرقم السري من معلمك.")}</p>
          <p className="mt-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:bg-sky-900/30 dark:text-sky-100" data-testid="lms-login-help">
            ℹ️ {tr("Accounts are created by your teacher. Ask your teacher for your username and PIN.", "الحسابات يُنشئها معلمك. اطلب من معلمك اسم المستخدم والرقم السري.")}
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
