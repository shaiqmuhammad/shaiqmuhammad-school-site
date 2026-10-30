"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { StudentLogins } from "@/components/lms/StudentLogins";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, stuUi } from "@/lib/lms";
import { ANIMALS, Avatar } from "@/components/lms/Avatar";
import { PushSettings } from "@/components/lms/PushSettings";
import { modCall } from "@/lib/lmsMods";

/** t303: students (and teachers) choose their own cartoon character. */
function CharacterPicker() {
  const { tr } = useTr();
  const [cur, setCur] = useState(""); const [kind, setKind] = useState("n"); const [msg, setMsg] = useState(""); const [photos, setPhotos] = useState(false);
  useEffect(() => { modCall<{ avatar: string; kind: string; photos?: boolean }>("my-avatar-kind", {}, false).then((r) => { setCur(r.avatar); setKind(r.kind); setPhotos(!!r.photos); }).catch(() => undefined); }, []);
  if (!cur) return null;
  const pick = async (n: number, animal = false) => {
    try { const r = await modCall<{ avatar: string }>("my-avatar", { n, ...(animal ? { kind: "a" } : {}) }, false); setCur(r.avatar); setMsg(tr("✅ Character saved!", "✅ تم حفظ الشخصية!")); window.dispatchEvent(new Event("sm-avatar")); } catch { setMsg(tr("Could not save. Try again.", "تعذّر الحفظ. حاول مجددًا.")); }
  };
  // t305: upload a photo — cropped to a centred square, resized to 128 px and compressed in the browser (max ~30 KB).
  const upload = async (f: File | undefined) => {
    if (!f) return; setMsg("");
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type) || f.size > 15_000_000) { setMsg(tr("Please choose a photo (JPG, PNG or WebP, up to 15 MB).", "اختر صورة (JPG أو PNG أو WebP حتى 15 ميغابايت).")); return; }
    try {
      const bmp = await createImageBitmap(f);
      const side = Math.min(bmp.width, bmp.height), cv = document.createElement("canvas"); cv.width = cv.height = 128;
      cv.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 128, 128);
      let q = 0.85, d = cv.toDataURL("image/webp", q);
      if (!d.startsWith("data:image/webp")) d = cv.toDataURL("image/jpeg", q);
      while (d.length > 38000 && q > 0.3) { q -= 0.1; d = cv.toDataURL(d.startsWith("data:image/webp") ? "image/webp" : "image/jpeg", q); }
      const r = await modCall<{ avatar: string }>("my-photo", { data: d }, false);
      setCur(r.avatar); setMsg(tr("✅ Photo saved!", "✅ تم حفظ الصورة!")); window.dispatchEvent(new Event("sm-avatar"));
    } catch { setMsg(tr("Could not use that photo. Try another one.", "تعذّر استخدام هذه الصورة. جرّب صورة أخرى.")); }
  };
  const removePhoto = async () => { try { const r = await modCall<{ avatar: string }>("my-photo", { remove: true }, false); setCur(r.avatar); setMsg(tr("Photo removed — your character is back.", "أزيلت الصورة — عادت شخصيتك.")); window.dispatchEvent(new Event("sm-avatar")); } catch { /* ignore */ } };
  return (
    <section className="mb-5 rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-white/5" data-testid="char-picker">
      <div className="mb-3 flex items-center gap-3"><Avatar code={cur} size={64} /><div><h2 className="text-lg font-extrabold">{tr("My character", "شخصيتي")}</h2><p className="text-sm opacity-70">{tr("Tap a character to use it everywhere.", "اضغط على شخصية لاستخدامها في كل مكان.")}</p></div></div>
      {photos && <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="photo-controls">
        <label className="cursor-pointer rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b]">📷 {tr("Upload my photo", "رفع صورتي")}<input type="file" accept="image/*" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="photo-input" /></label>
        {cur.startsWith("data:image/") && <button type="button" className="rounded-full border border-black/15 px-3 py-2 text-sm font-bold dark:border-white/20" onClick={removePhoto} data-testid="photo-remove">🗑 {tr("Remove photo", "إزالة الصورة")}</button>}
        <span className="text-xs opacity-60">{tr("…or tap a character below", "…أو اختر شخصية بالأسفل")}</span>
      </div>}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: 24 }, (_, n) => { const c = `${kind === "p" ? "n" : kind}${n}`; const on = c === cur; return (
          <button key={c} type="button" aria-pressed={on} aria-label={tr(`Character ${n + 1}`, `الشخصية ${n + 1}`)} onClick={() => pick(n)} className={`grid place-items-center rounded-2xl p-1 transition hover:scale-105 ${on ? "bg-sun/60 ring-4 ring-sun" : "bg-black/[0.04] dark:bg-white/10"}`} data-testid="char-opt"><Avatar code={c} size={52} /></button>
        ); })}
      </div>
      <h3 className="mb-2 mt-4 text-sm font-extrabold">🐾 {tr("Animal friends", "أصدقاء من الحيوانات")}</h3>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="animal-opts">
        {Array.from({ length: ANIMALS }, (_, n) => { const c = `a${n}`; const on = c === cur; return (
          <button key={c} type="button" aria-pressed={on} aria-label={tr(`Animal ${n + 1}`, `حيوان ${n + 1}`)} onClick={() => pick(n, true)} className={`grid place-items-center rounded-2xl p-1 transition hover:scale-105 ${on ? "bg-sun/60 ring-4 ring-sun" : "bg-black/[0.04] dark:bg-white/10"}`} data-testid="animal-opt"><Avatar code={c} size={56} /></button>
        ); })}
      </div>
      {msg && <p className="mt-2 text-sm font-bold" role="status" data-testid="char-msg">{msg}</p>}
    </section>
  );
}

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

/** My account: students and teachers change their own PIN (no current PIN needed). */
export function AccountPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false);
  const can = actor?.role === "student" || actor?.role === "teacher" || actor?.role === "parent";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    if ([...n1].length < 6 || [...n1].length > 64) { setBad(true); setMsg(tr("New password must be 6 to 64 characters (letters, numbers or symbols).", "يجب أن تتكون كلمة المرور الجديدة من 6 إلى 64 حرفًا (أحرف أو أرقام أو رموز).")); return; }
    if (n1 !== n2) { setBad(true); setMsg(tr("The new PINs don't match.", "الرقمان الجديدان غير متطابقين.")); return; }
    setBusy(true);
    try { await lmsApi.changePin(n1); setBad(false); setMsg(tr("PIN changed. Use it next time you sign in.", "تم تغيير الرقم. استخدمه في المرة القادمة.")); setN1(""); setN2(""); }
    catch (er) { setBad(true); const c = (er as Error).message; setMsg(c === "wrong_current_pin" ? tr("Current PIN is wrong.", "الرقم الحالي غير صحيح.") : c === "pin_same" ? tr("Choose a different PIN.", "اختر رقمًا مختلفًا.") : c === "too_many_attempts" ? tr("Too many attempts. Try again later.", "محاولات كثيرة. حاول لاحقًا.") : lmsErrorText(er, tr)); }
    setBusy(false);
  };
  return (
    <AssessmentShell title={tr("My account", "حسابي")} exitHref="/lms" toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        {!ready ? null : !can ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in.", "سجّل الدخول.")} <a className="font-bold underline" href="/lms/login/">{tr("Sign in", "دخول")}</a></p> : (
          <>{(actor?.role === "student" || actor?.role === "teacher") && <CharacterPicker />}{actor?.role !== "parent" && <PushSettings />}<form onSubmit={submit} className="space-y-3 rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-white/5" data-testid="pin-form">
            <h2 className="text-xl font-extrabold">🔑 {tr("Change my password / PIN", "تغيير كلمة المرور")}</h2>
            <p className="text-sm opacity-70">{actor?.name}</p>
            <input className={inp} type="password" autoComplete="new-password" autoCapitalize="none" maxLength={64} placeholder={tr("New password / PIN (6–64 characters)", "كلمة المرور الجديدة (6–64 حرفًا)")} value={n1} onChange={(e) => setN1(e.target.value)} data-testid="pin-new" />
            <input className={inp} type="password" autoComplete="new-password" autoCapitalize="none" maxLength={64} placeholder={tr("Repeat new password / PIN", "أعد كلمة المرور الجديدة")} value={n2} onChange={(e) => setN2(e.target.value)} data-testid="pin-new2" />
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${bad ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`} role="status" data-testid="pin-msg">{msg}</p>}
            <button type="submit" className="w-full rounded-full bg-sun px-5 py-2.5 font-bold text-[#0b1b2b] disabled:opacity-50" disabled={busy || !n1 || !n2} data-testid="pin-save">{tr("Save new PIN", "حفظ الرقم الجديد")}</button>
          </form></>
        )}
      </div>
    </AssessmentShell>
  );
}
