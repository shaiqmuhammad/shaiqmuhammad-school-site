"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { securityCall, type SecurityInfo } from "@/lib/adminServer";
import { qrSvg } from "@/lib/qrLocal";
import { useI18n } from "@/lib/i18n";

const MIN = 10;

/** 0–4 rough strength score with a plain-language label. */
export function passwordStrength(pw: string): { score: number; en: string; ar: string } {
  if (!pw) return { score: 0, en: "", ar: "" };
  let s = 0;
  if (pw.length >= MIN) s++;
  if (pw.length >= 14) s++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds >= 3) s++;
  if (pw.length >= 18 || (kinds === 4 && pw.length >= 12)) s++;
  if (/^(.)\1+$/.test(pw) || /^(password|qwerty|123456|admin|shaiq)/i.test(pw)) s = 0;
  if (pw.length < MIN) s = Math.min(s, 1);
  const L = [["Too weak", "ضعيفة جدًا"], ["Weak", "ضعيفة"], ["OK", "مقبولة"], ["Strong", "قوية"], ["Very strong", "قوية جدًا"]][s];
  return { score: s, en: L[0], ar: L[1] };
}

const ERR: Record<string, [string, string]> = {
  wrong_password: ["The current password is not correct.", "كلمة المرور الحالية غير صحيحة."],
  too_short: [`Use at least ${MIN} characters.`, `استخدم ${MIN} أحرف على الأقل.`],
  too_long: ["That password is too long (200 characters max).", "كلمة المرور طويلة جدًا."],
  too_simple: ["That password is too simple.", "كلمة المرور بسيطة جدًا."],
  too_common: ["That password is too easy to guess. Try a few unrelated words together.", "كلمة المرور سهلة التخمين. جرّب عدة كلمات غير مترابطة."],
  same_as_old: ["The new password must be different from the current one.", "يجب أن تختلف كلمة المرور الجديدة عن الحالية."],
  code_required: ["Enter the 6-digit code from your authenticator app.", "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة."],
  wrong_code: ["That code is wrong or was already used. Try the newest code.", "الرمز غير صحيح أو مستخدم. جرّب أحدث رمز."],
  setup_expired: ["The setup took too long. Start again.", "انتهت مهلة الإعداد. ابدأ من جديد."],
  too_many_attempts: ["Too many attempts. Wait a few minutes and try again.", "محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى."],
  network: ["Couldn't reach the server. Check your connection.", "تعذّر الاتصال بالخادم."],
  unauthorized: ["Your session has ended. Sign in again.", "انتهت الجلسة. سجّل الدخول مرة أخرى."],
};

function Card({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return (
    <section className="glass rounded-[20px] p-5 sm:p-6" data-testid={testid}>
      <h2 className="text-lg font-extrabold text-heading">{title}</h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}
const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
const btn2 = "rounded-full border border-card-border px-4 py-2 text-sm font-semibold hover:bg-black/[0.04] dark:hover:bg-white/10 disabled:opacity-50";

export default function AdminSecurity() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const tr = (en: string, a: string) => (ar ? a : en);
  const errText = (e?: string, retry?: number) => {
    if (!e) return tr("Something went wrong. Please try again.", "حدث خطأ. حاول مرة أخرى.");
    const m = ERR[e];
    const base = m ? (ar ? m[1] : m[0]) : tr(`Error: ${e}`, `خطأ: ${e}`);
    return e === "too_many_attempts" && retry ? `${base} (${Math.ceil(retry / 60)} min)` : base;
  };
  const fmt = (t: number) => (t ? new Date(t).toLocaleString(ar ? "ar-AE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");

  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const load = useCallback(async () => {
    const r = await securityCall<SecurityInfo>("security");
    if (r.ok) { setInfo(r as unknown as SecurityInfo); setLoadErr(""); } else setLoadErr(errText(r.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server after mount
  useEffect(() => { void load(); }, [load]);

  // ---- change password ----
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [pcode, setPcode] = useState("");
  const [show, setShow] = useState(false);
  const [pBusy, setPBusy] = useState(false);
  const [pMsg, setPMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = passwordStrength(nw);
  const canChange = cur && nw.length >= MIN && nw === nw2 && st.score >= 2 && (!info?.twoStep || pcode.trim());
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPMsg(null);
    if (nw !== nw2) { setPMsg({ ok: false, text: tr("The two new passwords don't match.", "كلمتا المرور الجديدتان غير متطابقتين.") }); return; }
    setPBusy(true);
    const r = await securityCall("change-password", { current: cur, next: nw, code: pcode.trim() || undefined });
    setPBusy(false);
    if (r.ok) {
      setCur(""); setNw(""); setNw2(""); setPcode("");
      setPMsg({ ok: true, text: tr("Password changed. Every other device has been signed out; this one stays signed in. Use the new password next time.", "تم تغيير كلمة المرور. تم تسجيل خروج كل الأجهزة الأخرى، ويبقى هذا الجهاز متصلًا.") });
      void load();
    } else setPMsg({ ok: false, text: errText(r.error, r.retryAfter) });
  }

  // ---- sign out other devices ----
  const [oMsg, setOMsg] = useState("");
  async function signOutOthers() {
    if (!confirm(tr("Sign out every other phone, tablet and computer that is signed in to Admin? This device stays signed in.", "تسجيل خروج كل الأجهزة الأخرى المتصلة بالإدارة؟ يبقى هذا الجهاز متصلًا."))) return;
    const r = await securityCall("signout-all", {});
    setOMsg(r.ok ? tr("Done — all other devices are signed out (within a few seconds).", "تم — تم تسجيل خروج كل الأجهزة الأخرى.") : errText(r.error));
    void load();
  }

  // ---- two-step ----
  const [tStage, setTStage] = useState<"" | "password" | "scan" | "codes" | "off" | "regen">("");
  const [tPass, setTPass] = useState("");
  const [tCode, setTCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [tMsg, setTMsg] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const resetT = () => { setTStage(""); setTPass(""); setTCode(""); setSetup(null); setTMsg(""); };
  async function tStart(e: FormEvent) {
    e.preventDefault(); setTBusy(true); setTMsg("");
    const r = await securityCall<{ secret: string; uri: string }>("totp-setup", { password: tPass });
    setTBusy(false);
    if (r.ok && r.secret && r.uri) { setSetup({ secret: r.secret, uri: r.uri }); setTStage("scan"); setTPass(""); } else setTMsg(errText(r.error, r.retryAfter));
  }
  async function tConfirm(e: FormEvent) {
    e.preventDefault(); setTBusy(true); setTMsg("");
    const r = await securityCall<{ backupCodes: string[] }>("totp-enable", { code: tCode.trim() });
    setTBusy(false);
    if (r.ok && r.backupCodes) { setCodes(r.backupCodes); setTStage("codes"); setSetup(null); setTCode(""); void load(); } else setTMsg(errText(r.error, r.retryAfter));
  }
  async function tOffOrRegen(e: FormEvent) {
    e.preventDefault(); setTBusy(true); setTMsg("");
    const action = tStage === "off" ? "totp-disable" : "totp-backup";
    const r = await securityCall<{ backupCodes: string[] }>(action, { password: tPass, code: tCode.trim() });
    setTBusy(false);
    if (!r.ok) { setTMsg(errText(r.error, r.retryAfter)); return; }
    setTPass(""); setTCode("");
    if (action === "totp-backup" && r.backupCodes) { setCodes(r.backupCodes); setTStage("codes"); } else { resetT(); setTMsg(tr("Two-step sign-in is now off.", "تم إيقاف التحقق بخطوتين.")); }
    void load();
  }
  const downloadCodes = () => {
    const text = `Shaiq Admin — backup sign-in codes (each works once)\n${new Date().toLocaleString("en-GB")}\n\n${codes.join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "admin-backup-codes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const what = (w: string) => {
    const m: Record<string, [string, string]> = {
      signin: ["Signed in", "تسجيل دخول"], signin_2step: ["Signed in (two-step)", "تسجيل دخول (بخطوتين)"], wrong_password: ["Wrong password", "كلمة مرور خاطئة"],
      wrong_code: ["Wrong two-step code", "رمز خاطئ"], password_changed: ["Password changed", "تغيير كلمة المرور"], signout_all: ["Signed out other devices", "خروج الأجهزة الأخرى"],
      two_step_on: ["Two-step turned on", "تشغيل التحقق بخطوتين"], two_step_off: ["Two-step turned off", "إيقاف التحقق بخطوتين"], backup_codes_new: ["New backup codes", "رموز احتياطية جديدة"], reset: ["Password reset by support", "إعادة تعيين بواسطة الدعم"],
    };
    const k = w.includes(":") ? w.split(":")[1] : w;
    const x = m[k];
    return x ? (ar ? x[1] : x[0]) + (w.includes(":") ? tr(" (confirm step)", " (خطوة تأكيد)") : "") : w;
  };

  return (
    <div className="space-y-5" data-testid="admin-security">
      {loadErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{loadErr}</p>}

      <Card title={tr("Overview", "نظرة عامة")} testid="sec-overview">
        <ul className="grid gap-2 sm:grid-cols-3">
          <li className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/5"><p className="text-xs text-muted">{tr("Password last changed", "آخر تغيير لكلمة المرور")}</p><p className="font-bold">{info ? (info.changedPassword ? fmt(info.changedAt) : tr("Not changed yet (original password)", "لم تتغير بعد (كلمة المرور الأصلية)")) : "…"}</p></li>
          <li className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/5"><p className="text-xs text-muted">{tr("Two-step sign-in", "التحقق بخطوتين")}</p><p className={`font-bold ${info?.twoStep ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{info ? (info.twoStep ? tr("On", "مفعّل") : tr("Off — recommended to turn on", "متوقف — يُنصح بتفعيله")) : "…"}</p></li>
          <li className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/5"><p className="text-xs text-muted">{tr("This device's sign-in", "جلسة هذا الجهاز")}</p><p className="font-bold">{info ? tr(`Ends after ${info.policy.idleHours} h without use (latest ${fmt(info.session.maxEnd)})`, `تنتهي بعد ${info.policy.idleHours} ساعة دون استخدام (حتى ${fmt(info.session.maxEnd)})`) : "…"}</p></li>
        </ul>
      </Card>

      <Card title={tr("Change password", "تغيير كلمة المرور")} testid="sec-change-password">
        <form onSubmit={changePassword} className="max-w-md space-y-3">
          <label className="block font-medium">{tr("Current password", "كلمة المرور الحالية")}<input type={show ? "text" : "password"} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={input} data-testid="sec-current" required /></label>
          <label className="block font-medium">{tr(`New password (at least ${MIN} characters)`, `كلمة المرور الجديدة (${MIN} أحرف على الأقل)`)}<input type={show ? "text" : "password"} autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} className={input} data-testid="sec-new" required minLength={MIN} /></label>
          {nw && (
            <div aria-live="polite" data-testid="sec-strength">
              <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < st.score ? (st.score >= 3 ? "bg-emerald-500" : st.score === 2 ? "bg-amber-500" : "bg-red-500") : "bg-black/10 dark:bg-white/15"}`} />)}</div>
              <p className="mt-1 text-xs text-muted">{tr("Strength:", "القوة:")} <b>{ar ? st.ar : st.en}</b>{st.score < 2 && tr(" — make it longer, or mix words, numbers and symbols.", " — اجعلها أطول أو امزج كلمات وأرقامًا ورموزًا.")}</p>
            </div>
          )}
          <label className="block font-medium">{tr("New password again", "كلمة المرور الجديدة مرة أخرى")}<input type={show ? "text" : "password"} autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} className={input} data-testid="sec-new2" required /></label>
          {nw2 && nw !== nw2 && <p className="text-xs text-red-600">{tr("The two new passwords don't match yet.", "كلمتا المرور غير متطابقتين بعد.")}</p>}
          {info?.twoStep && <label className="block font-medium">{tr("Two-step code (or a backup code)", "رمز التحقق (أو رمز احتياطي)")}<input inputMode="numeric" autoComplete="one-time-code" value={pcode} onChange={(e) => setPcode(e.target.value)} className={input} data-testid="sec-pcode" /></label>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {tr("Show passwords", "إظهار كلمات المرور")}</label>
          {pMsg && <p className={`rounded-lg px-3 py-2 ${pMsg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`} role="status" data-testid="sec-pmsg">{pMsg.text}</p>}
          <button type="submit" disabled={!canChange || pBusy} className={btn} data-testid="sec-change-btn">{pBusy ? tr("Saving…", "جارٍ الحفظ…") : tr("Change password", "تغيير كلمة المرور")}</button>
        </form>
      </Card>

      <Card title={tr("Two-step sign-in (authenticator app)", "التحقق بخطوتين (تطبيق المصادقة)")} testid="sec-two-step">
        <p className="text-muted">{tr("After your password, Admin also asks for a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy or Apple Passwords). Someone who steals your password still can't sign in.", "بعد كلمة المرور تطلب الإدارة رمزًا من 6 أرقام من تطبيق على هاتفك. من يسرق كلمة المرور لا يستطيع الدخول.")}</p>
        {tMsg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">{tMsg}</p>}
        {!info?.twoStep && tStage === "" && <button type="button" className={btn} onClick={() => { setTStage("password"); setTMsg(""); }} data-testid="sec-2s-on">{tr("Turn on two-step sign-in", "تفعيل التحقق بخطوتين")}</button>}
        {tStage === "password" && (
          <form onSubmit={tStart} className="max-w-md space-y-3">
            <label className="block font-medium">{tr("Confirm your password", "أكّد كلمة المرور")}<input type="password" autoComplete="current-password" value={tPass} onChange={(e) => setTPass(e.target.value)} className={input} required data-testid="sec-2s-pass" /></label>
            <div className="flex gap-2"><button type="submit" disabled={tBusy || !tPass} className={btn}>{tr("Continue", "متابعة")}</button><button type="button" className={btn2} onClick={resetT}>{tr("Cancel", "إلغاء")}</button></div>
          </form>
        )}
        {tStage === "scan" && setup && (
          <form onSubmit={tConfirm} className="space-y-3">
            <ol className="list-decimal space-y-1 ps-5">
              <li>{tr("Open your authenticator app and tap + (add account).", "افتح تطبيق المصادقة واضغط + (إضافة حساب).")}</li>
              <li>{tr("Scan this QR code — or type the key below.", "امسح رمز QR — أو اكتب المفتاح أدناه.")}</li>
              <li>{tr("Enter the 6-digit code the app shows.", "أدخل الرمز المكوّن من 6 أرقام الظاهر في التطبيق.")}</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              <div className="rounded-2xl bg-white p-2 shadow-inner" data-testid="sec-2s-qr" dangerouslySetInnerHTML={{ __html: qrSvg(setup.uri, 200) }} />
              <div>
                <p className="text-xs text-muted">{tr("Key (if you can't scan):", "المفتاح (إن تعذّر المسح):")}</p>
                <p className="select-all break-all font-mono text-base font-bold tracking-wider" dir="ltr" data-testid="sec-2s-key">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
              </div>
            </div>
            <label className="block max-w-xs font-medium">{tr("6-digit code", "الرمز المكوّن من 6 أرقام")}<input inputMode="numeric" autoComplete="one-time-code" value={tCode} onChange={(e) => setTCode(e.target.value)} className={`${input} text-center font-mono tracking-[0.3em]`} required data-testid="sec-2s-code" /></label>
            <div className="flex gap-2"><button type="submit" disabled={tBusy || tCode.replace(/\D/g, "").length !== 6} className={btn} data-testid="sec-2s-confirm">{tr("Turn on", "تفعيل")}</button><button type="button" className={btn2} onClick={resetT}>{tr("Cancel", "إلغاء")}</button></div>
          </form>
        )}
        {tStage === "codes" && (
          <div className="space-y-3" data-testid="sec-2s-codes">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{tr("Two-step sign-in is on. Save these backup codes now — they are shown only once. Each one signs you in once if you lose your phone.", "تم التفعيل. احفظ هذه الرموز الاحتياطية الآن — تظهر مرة واحدة فقط. كل رمز يعمل مرة واحدة إذا فقدت هاتفك.")}</p>
            <ul className="grid max-w-md grid-cols-2 gap-2 font-mono text-base" dir="ltr">{codes.map((c) => <li key={c} className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-center dark:bg-white/10">{c}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn2} onClick={downloadCodes}>{tr("Download as a file", "تنزيل كملف")}</button>
              <button type="button" className={btn2} onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>{tr("Copy", "نسخ")}</button>
              <button type="button" className={btn} onClick={() => { setCodes([]); resetT(); }}>{tr("I've saved them", "حفظتها")}</button>
            </div>
          </div>
        )}
        {info?.twoStep && tStage === "" && (
          <div className="space-y-2">
            <p>{tr(`On since ${fmt(info.twoStepSince)}. Backup codes left: ${info.backupLeft}.`, `مفعّل منذ ${fmt(info.twoStepSince)}. الرموز الاحتياطية المتبقية: ${info.backupLeft}.`)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn2} onClick={() => { setTStage("regen"); setTMsg(""); }}>{tr("New backup codes", "رموز احتياطية جديدة")}</button>
              <button type="button" className={btn2} onClick={() => { setTStage("off"); setTMsg(""); }} data-testid="sec-2s-off">{tr("Turn off", "إيقاف")}</button>
            </div>
          </div>
        )}
        {(tStage === "off" || tStage === "regen") && (
          <form onSubmit={tOffOrRegen} className="max-w-md space-y-3">
            <label className="block font-medium">{tr("Your password", "كلمة المرور")}<input type="password" autoComplete="current-password" value={tPass} onChange={(e) => setTPass(e.target.value)} className={input} required /></label>
            <label className="block font-medium">{tr("Code from the app (or a backup code)", "رمز التطبيق (أو رمز احتياطي)")}<input inputMode="numeric" autoComplete="one-time-code" value={tCode} onChange={(e) => setTCode(e.target.value)} className={input} required /></label>
            <div className="flex gap-2"><button type="submit" disabled={tBusy} className={btn}>{tStage === "off" ? tr("Turn off two-step sign-in", "إيقاف التحقق بخطوتين") : tr("Make new codes", "إنشاء رموز جديدة")}</button><button type="button" className={btn2} onClick={resetT}>{tr("Cancel", "إلغاء")}</button></div>
          </form>
        )}
      </Card>

      <Card title={tr("Signed-in devices", "الأجهزة المتصلة")} testid="sec-devices">
        <p className="text-muted">{tr("Lost a phone, or signed in on a shared computer? Sign every other device out at once. Changing the password does this too.", "فقدت هاتفًا أو دخلت من جهاز مشترك؟ سجّل خروج كل الأجهزة الأخرى دفعة واحدة. تغيير كلمة المرور يفعل ذلك أيضًا.")}</p>
        <button type="button" className={btn2} onClick={signOutOthers} data-testid="sec-signout-all">{tr("Sign out everywhere else", "تسجيل الخروج من كل الأجهزة الأخرى")}</button>
        {oMsg && <p role="status" className="text-emerald-700 dark:text-emerald-300">{oMsg}</p>}
      </Card>

      <Card title={tr("Recent sign-ins", "آخر عمليات الدخول")} testid="sec-log">
        {!info?.log.length ? <p className="text-muted">{tr("Nothing yet.", "لا شيء بعد.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-1 text-start">{tr("When", "الوقت")}</th><th className="text-start">{tr("What", "الحدث")}</th><th className="text-start">{tr("Device", "الجهاز")}</th><th className="text-start">{tr("Where", "المكان")}</th></tr></thead>
              <tbody>{info.log.map((e, i) => (
                <tr key={i} className="border-t border-card-border">
                  <td className="py-1.5 pe-3 whitespace-nowrap">{fmt(e.t)}</td>
                  <td className={`pe-3 font-semibold ${e.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>{e.ok ? "✓" : "✗"} {what(e.what)}</td>
                  <td className="pe-3">{e.ua}</td>
                  <td className="text-muted" dir="ltr">{[e.where, e.ip].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">{tr("Several ✗ you don't recognise? Change the password and turn on two-step sign-in.", "هل ترى عدة ✗ لا تعرفها؟ غيّر كلمة المرور وفعّل التحقق بخطوتين.")}</p>
      </Card>

      <Card title={tr("How to keep Admin safe", "كيف تحافظ على أمان الإدارة")} testid="sec-tips">
        <ul className="list-disc space-y-1.5 ps-5">
          <li>{tr("Use a long password you use nowhere else — e.g. 3–4 unrelated words with a number. A password manager (Apple Passwords, Google Password Manager, 1Password) can create and remember it.", "استخدم كلمة مرور طويلة لا تستخدمها في أي مكان آخر — مثل 3–4 كلمات غير مترابطة مع رقم. يمكن لمدير كلمات المرور إنشاؤها وتذكّرها.")}</li>
          <li>{tr("Turn on two-step sign-in above, and keep the backup codes somewhere safe (not in the same place as the password).", "فعّل التحقق بخطوتين أعلاه واحفظ الرموز الاحتياطية في مكان آمن.")}</li>
          <li>{tr("Never share the password by WhatsApp or email. Teachers have their own logins — they never need the admin password.", "لا تشارك كلمة المرور عبر واتساب أو البريد. للمعلمين حساباتهم — لا يحتاجون كلمة مرور الإدارة.")}</li>
          <li>{tr("Only sign in at this site's own address (…/admin/login). Ignore emails or messages asking you to \"confirm\" your admin password.", "سجّل الدخول فقط من عنوان الموقع نفسه. تجاهل أي رسالة تطلب تأكيد كلمة المرور.")}</li>
          <li>{tr("On shared or school computers, use Log out when you finish. If a device is lost, use \"Sign out everywhere else\".", "على الأجهزة المشتركة سجّل الخروج عند الانتهاء. إذا فُقد جهاز استخدم \"تسجيل الخروج من كل الأجهزة الأخرى\".")}</li>
          <li>{tr("Keep your phone, computer and browser updated, and check Recent sign-ins now and then.", "حدّث هاتفك وجهازك والمتصفح، وراجع آخر عمليات الدخول من حين لآخر.")}</li>
          <li>{tr("Already built in: wrong passwords slow down and then lock for 15 minutes, many wrong tries from anywhere pause sign-in for 10 minutes, sessions end after 12 hours without use (7 days at most), and the password is stored only as a salted, slow hash on the server.", "مُضمَّن بالفعل: إبطاء ثم قفل 15 دقيقة بعد محاولات خاطئة، إيقاف مؤقت 10 دقائق عند محاولات كثيرة من أي مكان، انتهاء الجلسة بعد 12 ساعة دون استخدام (7 أيام كحد أقصى)، وتُحفظ كلمة المرور كبصمة مملّحة بطيئة على الخادم فقط.")}</li>
        </ul>
      </Card>
    </div>
  );
}
