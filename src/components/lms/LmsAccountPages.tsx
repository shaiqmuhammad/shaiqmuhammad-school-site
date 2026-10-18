"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { StudentLogins } from "@/components/lms/StudentLogins";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, stuUi } from "@/lib/lms";

const inp = "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-base dark:border-white/15 dark:bg-white/5";

export function LoginsPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  const ok = actor?.role === "teacher" && stuUi(actor.perms, "view");
  return (
    <AssessmentShell title={tr("Student Logins", "بيانات دخول الطلاب")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
        {!ready ? null : ok ? <StudentLogins asAdmin={false} perms={actor?.perms} /> : <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="mod-no-access">{tr("You don't have access to student logins. Ask the admin to give you the student View permission.", "ليس لديك صلاحية لبيانات دخول الطلاب. اطلب من الإدارة صلاحية عرض الطلاب.")}</p>}
      </div>
    </AssessmentShell>
  );
}

/** Landing page for a student's login QR: signs in with the token, removes it from the address bar, then opens the LMS. */
export function QrLoginPage() {
  const { tr } = useTr();
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!t) { // eslint-disable-next-line react-hooks/set-state-in-effect
      setMsg("bad"); return; }
    lmsApi.qrLogin(t).then(() => { window.location.replace("/lms/"); }).catch((e) => setMsg((e as { status?: number }).status === 403 ? "blocked" : "bad"));
  }, []);
  return (
    <AssessmentShell title={tr("Signing in", "تسجيل الدخول")} exitHref="/lms">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center" data-testid="qr-login">
        {!msg ? <p className="text-lg font-bold">{tr("Signing you in…", "جارٍ تسجيل دخولك…")}</p> : (
          <div className="space-y-3"><p className="rounded-2xl bg-rose-100 px-4 py-3 text-rose-800" role="alert">{msg === "blocked" ? tr("This account is blocked. Ask your teacher.", "هذا الحساب موقوف. اسأل معلمك.") : tr("This QR code is not valid any more. Ask your teacher for a new one, or sign in with your username and PIN.", "رمز QR لم يعد صالحًا. اطلب رمزًا جديدًا من معلمك أو سجّل الدخول باسم المستخدم والرقم السري.")}</p><a className="inline-block rounded-full bg-sun px-5 py-2 font-bold text-[#0b1b2b]" href="/lms/login/">{tr("Sign in", "دخول")}</a></div>
        )}
      </div>
    </AssessmentShell>
  );
}

/** My account: students and teachers change their own PIN (current PIN required). */
export function AccountPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false);
  const can = actor?.role === "student" || actor?.role === "teacher";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    if (!/^\d{6,8}$/.test(n1)) { setBad(true); setMsg(tr("New PIN must be 6 to 8 digits.", "يجب أن يتكون الرقم الجديد من 6 إلى 8 أرقام.")); return; }
    if (n1 !== n2) { setBad(true); setMsg(tr("The new PINs don't match.", "الرقمان الجديدان غير متطابقين.")); return; }
    setBusy(true);
    try { await lmsApi.changePin(cur, n1); setBad(false); setMsg(tr("PIN changed. Use it next time you sign in.", "تم تغيير الرقم. استخدمه في المرة القادمة.")); setCur(""); setN1(""); setN2(""); }
    catch (er) { setBad(true); const c = (er as Error).message; setMsg(c === "wrong_current_pin" ? tr("Current PIN is wrong.", "الرقم الحالي غير صحيح.") : c === "pin_same" ? tr("Choose a different PIN.", "اختر رقمًا مختلفًا.") : c === "too_many_attempts" ? tr("Too many attempts. Try again later.", "محاولات كثيرة. حاول لاحقًا.") : lmsErrorText(er, tr)); }
    setBusy(false);
  };
  return (
    <AssessmentShell title={tr("My account", "حسابي")} exitHref="/lms" toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        {!ready ? null : !can ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in.", "سجّل الدخول.")} <a className="font-bold underline" href="/lms/login/">{tr("Sign in", "دخول")}</a></p> : (
          <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-white/5" data-testid="pin-form">
            <h2 className="text-xl font-extrabold">🔑 {tr("Change my PIN", "تغيير الرقم السري")}</h2>
            <p className="text-sm opacity-70">{actor?.name}</p>
            <input className={inp} type="password" inputMode="numeric" autoComplete="current-password" placeholder={tr("Current PIN", "الرقم الحالي")} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, "").slice(0, 8))} data-testid="pin-current" />
            <input className={inp} type="password" inputMode="numeric" autoComplete="new-password" placeholder={tr("New PIN (6–8 digits)", "الرقم الجديد (6–8 أرقام)")} value={n1} onChange={(e) => setN1(e.target.value.replace(/\D/g, "").slice(0, 8))} data-testid="pin-new" />
            <input className={inp} type="password" inputMode="numeric" autoComplete="new-password" placeholder={tr("Repeat new PIN", "أعد الرقم الجديد")} value={n2} onChange={(e) => setN2(e.target.value.replace(/\D/g, "").slice(0, 8))} data-testid="pin-new2" />
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${bad ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`} role="status" data-testid="pin-msg">{msg}</p>}
            <button type="submit" className="w-full rounded-full bg-sun px-5 py-2.5 font-bold text-[#0b1b2b] disabled:opacity-50" disabled={busy || !cur || !n1 || !n2} data-testid="pin-save">{tr("Save new PIN", "حفظ الرقم الجديد")}</button>
          </form>
        )}
      </div>
    </AssessmentShell>
  );
}
