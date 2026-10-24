"use client";

import { useCallback, useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { modCall } from "@/lib/lmsMods";

type K = { kind: string; label: string; adminOn: boolean; on: boolean };
const AR: Record<string, string> = { hw_new: "واجب جديد", sub_new: "تسليم واجب", graded: "تقييم الواجب", approved: "اعتماد الواجب", returned: "أعد المحاولة", feedback: "ملاحظات المعلم", feedback_audio: "ملاحظة صوتية", mistakes: "تحديد الأخطاء", message: "رسالة جديدة", announcement: "إعلان", reminder: "تذكير بالواجب", revise: "وقت المراجعة", test: "إشعار تجريبي", lesson: "تذكير بالحصة" };
const EN: Record<string, string> = { lesson: "Lesson reminder (timetable)" };

const b64ToU8 = (s: string) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

/** t302: Web Push — turn on for this device, switch each notification type on/off (admin also sets the global switch per type). */
export function PushSettings({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr, lang } = useTr();
  const [kinds, setKinds] = useState<K[] | null>(null);
  const [devices, setDevices] = useState(0);
  const [here, setHere] = useState<"on" | "off" | "unsupported" | "denied" | "">("");
  const [msg, setMsg] = useState("");
  const load = useCallback((body: Record<string, unknown> = {}) => modCall<{ kinds: K[]; devices: number }>("push-prefs", body, asAdmin).then((r) => { setKinds(r.kinds); setDevices(r.devices); }).catch(() => setKinds([])), [asAdmin]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setHere("unsupported"); return; }
    if (Notification.permission === "denied") { setHere("denied"); return; }
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setHere(s ? "on" : "off")).catch(() => setHere("off"));
  }, []);
  const enable = async () => {
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setHere(perm === "denied" ? "denied" : "off"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { key } = await modCall<{ key: string }>("push-key", {}, asAdmin);
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await modCall("push-sub", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, asAdmin);
      setHere("on"); load(); setMsg(tr("✅ Notifications are on for this device.", "✅ تم تفعيل الإشعارات لهذا الجهاز."));
    } catch { setMsg(tr("Could not turn on notifications on this device.", "تعذّر تفعيل الإشعارات على هذا الجهاز.")); }
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
    if (sub) { const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }; await modCall("push-sub", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, off: true }, asAdmin).catch(() => undefined); await sub.unsubscribe().catch(() => undefined); }
    setHere("off"); load();
  };
  const test = async () => { try { await modCall("push-test", {}, asAdmin); setMsg(tr("Test sent to your devices.", "تم إرسال إشعار تجريبي إلى أجهزتك.")); } catch { setMsg(tr("Could not send a test.", "تعذّر الإرسال.")); } };
  const sw = (on: boolean, onClick: () => void, id: string, label: string, disabled = false) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} data-testid={id} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-emerald-500" : "bg-black/20 dark:bg-white/20"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "start-[1.4rem]" : "start-0.5"}`} /></button>
  );
  return (
    <section className="mb-5 rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-white/5" data-testid="push-settings">
      <h2 className="text-lg font-extrabold">🔔 {asAdmin ? tr("Push notifications (all users)", "الإشعارات الفورية (كل المستخدمين)") : tr("Push notifications", "الإشعارات الفورية")}</h2>
      <p className="mb-3 text-sm opacity-70">{asAdmin ? tr("Switch a type off to stop it for everyone. Users can also switch types off for themselves.", "أوقف نوعًا لإيقافه للجميع. يمكن لكل مستخدم أيضًا إيقاف الأنواع لنفسه.") : tr("Get alerts on this phone or laptop, even when the site is closed. On iPhone, add the app to your Home Screen first.", "تلقَّ التنبيهات على هذا الهاتف أو الحاسوب حتى عند إغلاق الموقع. على iPhone أضف التطبيق إلى الشاشة الرئيسية أولًا.")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {here === "unsupported" ? <span className="rounded-xl bg-amber-100 px-3 py-1.5 text-sm text-amber-900" data-testid="push-unsupported">{tr("This browser can't receive push notifications here (on iPhone: install the app first).", "هذا المتصفح لا يدعم الإشعارات هنا (على iPhone ثبّت التطبيق أولًا).")}</span>
          : here === "denied" ? <span className="rounded-xl bg-rose-100 px-3 py-1.5 text-sm text-rose-900" data-testid="push-denied">{tr("Notifications are blocked in your browser settings.", "الإشعارات محظورة في إعدادات المتصفح.")}</span>
          : here === "on" ? <><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900" data-testid="push-on">✅ {tr("On for this device", "مفعّلة لهذا الجهاز")}</span><button type="button" className="rounded-full border border-black/15 px-3 py-1 text-sm font-bold dark:border-white/20" onClick={disable} data-testid="push-disable">{tr("Turn off here", "إيقاف هنا")}</button></>
          : <button type="button" className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b]" onClick={enable} data-testid="push-enable">🔔 {tr("Turn on for this device", "تفعيل لهذا الجهاز")}</button>}
        {devices > 0 && <button type="button" className="rounded-full border border-black/15 px-3 py-1 text-sm font-bold dark:border-white/20" onClick={test} data-testid="push-test">{tr("Send me a test", "أرسل لي تجربة")}</button>}
        <span className="text-xs opacity-60" data-testid="push-devices">{tr(`${devices} device(s)`, `${devices} جهاز`)}</span>
      </div>
      {msg && <p className="mb-2 text-sm font-bold" role="status" data-testid="push-msg">{msg}</p>}
      <ul className="divide-y divide-black/5 dark:divide-white/10" data-testid="push-kinds">
        {(kinds || []).filter((k) => k.kind !== "test").map((k) => (
          <li key={k.kind} className="flex items-center gap-3 py-2" data-testid="push-kind">
            <span className="flex-1 text-sm font-semibold">{lang === "ar" ? AR[k.kind] || k.label : EN[k.kind] || k.label}{!k.adminOn && !asAdmin && <span className="ms-2 text-xs opacity-60">({tr("off for everyone", "متوقف للجميع")})</span>}</span>
            {asAdmin ? sw(k.adminOn, () => load({ kind: k.kind, admin: !k.adminOn }), `push-admin-${k.kind}`, k.label) : sw(k.on && k.adminOn, () => load({ kind: k.kind, on: !k.on }), `push-user-${k.kind}`, k.label, !k.adminOn)}
          </li>
        ))}
      </ul>
    </section>
  );
}
