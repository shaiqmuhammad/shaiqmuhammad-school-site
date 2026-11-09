"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityOptionsEditor, READY_TYPES, afterCreate, prepareOptions } from "@/components/activity/ActivityViews";
import { AudiencePicker } from "@/components/lms/Audience";
import { openClassTimer } from "@/components/lms/ClassTimer";
import { useLmsActor } from "@/components/lms/useLms";
import { lmsApi } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";
import { activityApi, ACTIVITY_LABELS, ActivityError, forgetHosted, loadHosted, saveHosted, type ActivitySettings, type ActivityType, type HostedActivity } from "@/lib/activity";
import { joinUrl } from "@/lib/groupSession";
import { useI18n } from "@/lib/i18n";

const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btnGhost = "btn-glass px-3 py-1.5 text-sm disabled:opacity-60";
const TINT = ["#e0f2fe", "#fef3c7", "#dcfce7", "#fce7f3", "#ede9fe", "#ccfbf1"];
const TYPES: ActivityType[] = ["wall", "wordcloud", "poll", "survey", "tps", "vote", "mindmap", "compare", "whiteboard"];
/** Teacher-only tools that run entirely in the browser (no join code). */
const TOOLS = [
  { href: "/activities/wheel", icon: "🎡", en: "Spinning wheel", ar: "العجلة الدوارة", hintEn: "Names typed or pulled from a live activity; sound; remove winner.", hintAr: "أسماء مكتوبة أو من نشاط مباشر؛ صوت؛ إزالة الفائز." },
  { href: "/activities/randomiser", icon: "🎲", en: "Randomiser", ar: "المُختار العشوائي", hintEn: "Pick a student, make groups of N, random number.", hintAr: "اختيار طالب، تكوين مجموعات، رقم عشوائي." },
];

/** Admin → Activities: create a live classroom activity (join code + QR) and reopen ones made on this device. */
/** `allowed` (teacher area): only these activity types/tools; creation uses the teacher login. */
export function AdminActivities({ allowed }: { allowed?: string[] } = {}) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const { actor, asAdmin } = useLmsActor();
  const canRename = asAdmin || actor?.role === "admin" || !!actor?.perms?.includes("act:rename");
  const types = allowed ? TYPES.filter((t) => allowed.includes(t)) : TYPES;
  const tools = allowed ? TOOLS.filter((t) => allowed.includes(t.href.split("/").pop() || "")) : TOOLS;
  const [type, setType] = useState<ActivityType>(types[0] || "wall");
  // t302: the Classes tray opens a chosen activity directly (#t=wheel).
  useEffect(() => { const m = /#t=([a-z]+)/.exec(window.location.hash); if (m && (types as string[]).includes(m[1])) setType(m[1] as ActivityType); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [moderation, setModeration] = useState<"live" | "approve">("live");
  const [hideNames, setHideNames] = useState(false);
  const [allowImages, setAllowImages] = useState(true);
  const [allowLinks, setAllowLinks] = useState(true);
  const [likes, setLikes] = useState(true);
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [hosted, setHosted] = useState<HostedActivity[]>([]);
  const [audience, setAudience] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // t304: "Start with this class" from My classes pre-fills the audience (auto-joined students) and a title.
  const [preNote, setPreNote] = useState("");
  const [lockAud, setLockAud] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem("sm-act-prefill") || "null") as { audience?: string[]; title?: string; label?: string } | null;
      sessionStorage.removeItem("sm-act-prefill");
      if (!v || !allowed) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v.audience?.length) setAudience(v.audience);
      if (v.title) setTitle(v.title);
      if (v.label) setPreNote(v.label);
      if ((v as { locked?: boolean }).locked) setLockAud(true);
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const signedIn = Boolean(allowed) || Boolean(getServerSession());
  const [now, setNow] = useState(0);
  const router = useRouter();

  const [srv, setSrv] = useState<Record<string, { ended: boolean; participants: number }>>({});
  // Running activities live on the server per teacher: pull them so any device can resume / end / delete.
  const refreshMine = () => activityApi.mine().then((r) => {
    for (const x of r.items) saveHosted({ code: x.code, hostKey: x.hostKey, type: x.type, title: x.title, createdAt: x.createdAt, expiresAt: x.expiresAt });
    setSrv(Object.fromEntries(r.items.map((x) => [x.code, { ended: x.ended, participants: x.participants }])));
    setHosted(loadHosted());
  }).catch(() => undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHosted(loadHosted());
    setNow(Date.now());
    refreshMine();
  }, []);

  const ready = READY_TYPES.includes(type);

  const [pick, setPick] = useState(false);
  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !ready) return;
    // t378: teachers choose the students only in the start step (dialog), not on the page.
    if (allowed && !pick) { setPick(true); return; }
    setPick(false);
    setBusy(true);
    setError("");
    try {
      const prepared = prepareOptions(type, options);
      if (!prepared) {
        setError(tr("Please fill in the options first (at least two choices / one question).", "يرجى تعبئة الخيارات أولًا (خياران على الأقل / سؤال واحد)."));
        setBusy(false);
        return;
      }
      const settings: Partial<ActivitySettings> = { moderation, hideNames, allowImages, allowLinks, likes, options: prepared.options };
      const r = await activityApi.create({ type, title: title.trim(), prompt: prompt.trim(), settings });
      await afterCreate(type, r.code, r.hostKey, prepared.options, prepared.images);
      if (allowed && audience.length) await lmsApi.actPublish(r.code, type, r.title, audience, lockAud).catch(() => undefined);
      saveHosted({ code: r.code, hostKey: r.hostKey, type, title: r.title, createdAt: r.createdAt, expiresAt: r.expiresAt });
      router.push(`/activities/host?code=${r.code}`);
    } catch (err) {
      const c = err instanceof ActivityError ? err.code : "";
      setError(
        c === "unauthorized"
          ? tr("Your admin sign-in has expired — sign out and in again.", "انتهت جلسة الإدارة — سجّل الخروج ثم الدخول مجددًا.")
          : c === "bad"
            ? tr("Please check the options.", "يرجى التحقق من الخيارات.")
            : tr("Couldn't create the activity. Try again.", "تعذر إنشاء النشاط. حاول مجددًا."),
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="admin-activities">
      {!allowed && <SoundSwitch />}
      <section className="rounded-3xl bg-gradient-to-br from-sky-50 via-white to-amber-50 p-5 text-[#1b2f44] shadow-md ring-1 ring-black/5">
        <h2 className="text-xl font-bold text-[#1b2f44]">{tr("Classroom activities", "أنشطة الصف")}</h2>
        <p className="mt-1 text-sm opacity-80">
          {tr(
            "Create an activity, show the QR code / 5-letter code on the projector, and students join at /join on their phones. Activities expire after 7 days. Everything can be exported to Excel from the host screen.",
            "أنشئ نشاطًا واعرض رمز QR أو الرمز المكوّن من 5 أحرف على جهاز العرض، وينضم الطلاب عبر /join من هواتفهم. تنتهي الأنشطة بعد 7 أيام، ويمكن تصدير كل شيء إلى إكسل من شاشة المعلم.",
          )}
        </p>

        <form onSubmit={create} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label={tr("Activity type", "نوع النشاط")}>
            {types.map((t) => {
              const l = ACTIVITY_LABELS[t];
              const ok = READY_TYPES.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => { setType(t); setOptions({}); }}
                  className={`rounded-2xl border p-3 text-start text-[#1b2f44] transition hover:-translate-y-0.5 hover:shadow-md ${type === t ? "border-[#1b3a57] bg-[#1b3a57] !text-[#f5c542] shadow-lg" : "border-black/5"} ${ok ? "" : "opacity-60"}`}
                  style={type === t ? undefined : { background: `linear-gradient(150deg, ${TINT[types.indexOf(t) % TINT.length]}, #ffffff)` }}
                  data-testid={`activity-type-${t}`}
                >
                  <span className="text-2xl" aria-hidden>{l.icon}</span>
                  <span className="mt-1 block text-sm font-bold">{lang === "ar" ? l.ar : l.en}</span>
                  {!ok && <span className="block text-[11px] font-semibold">{tr("Coming next", "قريبًا")}</span>}
                </button>
              );
            })}
          </div>
          <p className="text-sm opacity-80">{lang === "ar" ? ACTIVITY_LABELS[type].hintAr : ACTIVITY_LABELS[type].hintEn}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              {tr("Title (optional)", "العنوان (اختياري)")}
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} data-testid="activity-title-input" />
            </label>
            <label className="block text-sm font-semibold sm:row-span-2">
              {tr("Prompt / question for students", "السؤال أو التعليمات للطلاب")}
              <textarea className={input + " min-h-24"} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={600} data-testid="activity-prompt-input" />
            </label>
          </div>

          <ActivityOptionsEditor type={type} options={options} setOptions={setOptions} />

          {false && preNote && <p className="rounded-2xl bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-900" data-testid="act-prefill">👥 {tr(`Starting with ${preNote} — they'll see it on their dashboard and join automatically.`, `البدء مع ${preNote} — سيظهر لهم في لوحتهم وينضمون تلقائيًا.`)}</p>}
          {false && <label className="flex items-center gap-2 text-sm font-semibold" data-testid="act-lock-label"><input type="checkbox" className="h-5 w-5" checked={lockAud} onChange={(e) => setLockAud(e.target.checked)} data-testid="act-lock" /> 🔒 {tr("Only these students — they join straight in under their own name (no typing); anyone else is refused", "فقط هؤلاء الطلاب — ينضمون مباشرة بأسمائهم (دون كتابة)؛ ويُرفض غيرهم")}</label>}
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <legend className="mb-1 text-sm font-semibold">{tr("Settings (can be changed live)", "الإعدادات (يمكن تغييرها أثناء النشاط)")}</legend>
            {(type === "wall" || type === "tps") && (
              <>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={moderation === "approve"} onChange={(e) => setModeration(e.target.checked ? "approve" : "live")} data-testid="activity-approve-first" />
                  {tr("Approve posts before students see them", "الموافقة على المشاركات قبل ظهورها")}
                </label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />{tr("Allow pictures (≤200 KB)", "السماح بالصور (≤200 ك.ب)")}</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={allowLinks} onChange={(e) => setAllowLinks(e.target.checked)} />{tr("Allow links / YouTube", "السماح بالروابط / يوتيوب")}</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={likes} onChange={(e) => setLikes(e.target.checked)} />{tr("Students can like posts", "يمكن للطلاب الإعجاب")}</label>
              </>
            )}
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={hideNames} onChange={(e) => setHideNames(e.target.checked)} />{tr("Hide student names on screen", "إخفاء أسماء الطلاب على الشاشة")}</label>
          </fieldset>

          {error && <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}
          {!signedIn && <p className="rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{tr("Sign in to the admin (server sign-in) to create activities.", "سجّل الدخول إلى الإدارة لإنشاء الأنشطة.")}</p>}
          <button type="submit" className="btn-cta px-5 py-2.5 disabled:opacity-60" disabled={busy || !ready || !signedIn} data-testid="activity-create">
            {busy ? "…" : tr("Create & open host screen", "إنشاء وفتح شاشة المعلم")} →
          </button>
        </form>
      </section>

      {pick && allowed && (
        <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/40 p-3" onClick={() => setPick(false)} role="presentation">
          <div className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-white p-5 text-[#1b2f44] shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Who is it for?", "لمن هذا النشاط؟")} data-testid="act-start-dialog">
            <div className="flex items-center gap-2"><p className="flex-1 text-lg font-extrabold">▶ {tr("Who is it for?", "لمن هذا النشاط؟")}</p><button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/5" onClick={() => setPick(false)} aria-label={tr("Close", "إغلاق")}>✕</button></div>
            <p className="text-sm opacity-80">{tr("Pick any students, or leave empty to let anyone join with the code / QR.", "اختر أي طلاب، أو اتركه فارغًا ليتمكن أي شخص من الانضمام بالرمز.")}</p>
            <AudiencePicker value={audience} onChange={setAudience} />
            {audience.length > 0 && <label className="flex items-center gap-2 text-sm font-semibold" data-testid="act-lock-label"><input type="checkbox" className="h-5 w-5" checked={lockAud} onChange={(e) => setLockAud(e.target.checked)} data-testid="act-lock" /> 🔒 {tr("Only these students", "فقط هؤلاء الطلاب")}</label>}
            <button type="button" disabled={busy} onClick={() => create()} className="w-full rounded-full bg-[#1b3a57] px-5 py-3 font-extrabold text-[#f5c542]" data-testid="act-start-go">{busy ? "…" : audience.length ? tr("Start for the chosen students", "ابدأ للطلاب المختارين") : tr("Start with a code / QR", "ابدأ برمز / QR")}</button>
          </div>
        </div>
      )}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 text-[#1b2f44] shadow-md ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-[#1b2f44]">{tr("Teacher tools (no join code)", "أدوات المعلم (بدون رمز)")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <a key={t.href} href={t.href} className="flex items-start gap-3 rounded-2xl border border-card-border bg-card-solid p-4 transition hover:border-sun-border" data-testid={`tool-${t.href.split("/").pop()}`}>
              <span className="text-3xl" aria-hidden>{t.icon}</span>
              <span>
                <span className="block font-bold">{lang === "ar" ? t.ar : t.en}</span>
                <span className="block text-sm opacity-80">{lang === "ar" ? t.hintAr : t.hintEn}</span>
              </span>
            </a>
          ))}
          {allowed && (["timer", "stopwatch"] as const).map((m) => (
            <button key={m} type="button" onClick={() => openClassTimer(m)} className="flex items-start gap-3 rounded-2xl border border-card-border bg-card-solid p-4 text-start transition hover:border-sun-border" data-testid={`tool-${m}`}>
              <span className="text-3xl" aria-hidden>{m === "timer" ? "⏱️" : "⏲️"}</span>
              <span><span className="block font-bold">{m === "timer" ? tr("Timer", "المؤقت") : tr("Stopwatch", "ساعة الإيقاف")}</span><span className="block text-sm opacity-80">{m === "timer" ? tr("Countdown with presets, ticks for the last 10 seconds and a finish chime.", "عدّ تنازلي مع إعدادات سريعة وصوت في آخر 10 ثوانٍ.") : tr("Start, pause, laps and reset.", "تشغيل وإيقاف ولفات وإعادة.")}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-gradient-to-br from-violet-50 via-white to-rose-50 p-5 text-[#1b2f44] shadow-md ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-[#1b2f44]">{tr("Running / my activities", "أنشطتي الجارية")}</h2>
        {hosted.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">{tr("None yet.", "لا يوجد بعد.")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-card-border">
            {hosted.map((h) => {
              const l = ACTIVITY_LABELS[h.type];
              const expired = now > 0 && h.expiresAt <= now;
              return (
                <li key={h.code} className="flex flex-wrap items-center gap-3 py-2.5" data-testid="hosted-activity">
                  <span className="text-xl" aria-hidden>{l.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.title || (lang === "ar" ? l.ar : l.en)}</span>
                    <span className="block text-xs opacity-70" dir="auto">
                      <span className="font-mono font-bold" dir="ltr">{h.code}</span> · {new Date(h.createdAt).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })}
                      {expired ? ` · ${tr("expired", "منتهي")}` : srv[h.code]?.ended ? ` · ${tr("ended", "انتهى")}` : srv[h.code] ? ` · 🟢 ${tr("running", "جارٍ")} · ${srv[h.code].participants} ${tr("joined", "منضم")}` : ""}
                    </span>
                  </span>
                  {!expired && (
                    <>
                      <a className={btnGhost} href={`/activities/host?code=${h.code}`} data-testid="hosted-resume">{srv[h.code]?.ended ? tr("Open results", "عرض النتائج") : tr("Resume", "متابعة")}</a>
                      {!srv[h.code]?.ended && <button type="button" className={btnGhost} data-testid="hosted-end" onClick={async () => { if (!confirm(tr("End this activity? Students can no longer join or answer.", "إنهاء هذا النشاط؟ لن يتمكن الطلاب من الانضمام أو الإجابة."))) return; await activityApi.end(h.code, h.hostKey).catch(() => undefined); refreshMine(); }}>{tr("End", "إنهاء")}</button>}
                      <button type="button" className={btnGhost} onClick={() => navigator.clipboard?.writeText(joinUrl(h.code)).catch(() => undefined)}>{tr("Copy join link", "نسخ رابط الانضمام")}</button>
                      {canRename && <button type="button" className={btnGhost} data-testid="hosted-rename" onClick={async () => { const next = window.prompt(tr("Rename this activity", "إعادة تسمية هذا النشاط"), h.title); if (next == null) return; const name = next.trim().slice(0, 120); if (!name) return; try { await activityApi.settings(h.code, h.hostKey, { title: name }); saveHosted({ ...h, title: name }); setHosted(loadHosted()); refreshMine(); } catch { /* permission or network */ } }}>{tr("Rename", "إعادة التسمية")}</button>}
                    </>
                  )}
                  <button
                    type="button"
                    className={btnGhost + " text-rose-600"}
                    onClick={async () => {
                      if (!confirm(tr("Delete this activity and all its posts?", "حذف هذا النشاط وكل مشاركاته؟"))) return;
                      if (!expired) await activityApi.destroy(h.code, h.hostKey).catch(() => undefined);
                      forgetHosted(h.code);
                      setHosted(loadHosted());
                      refreshMine();
                    }}
                  >
                    {tr("Delete", "حذف")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** t370: admin switch — music + sound effects on every activity host screen (site-wide). */
function SoundSwitch() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { lmsApi.actSoundAdmin().then((r) => setOn(r.on)).catch(() => setOn(true)); }, []);
  return (
    <section className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4" data-testid="admin-act-sound">
      <span className="text-2xl" aria-hidden>🎵</span>
      <span className="min-w-0 flex-1"><b className="block">{tr("Activity music & sound effects", "موسيقى ومؤثرات الأنشطة")}</b><span className="text-sm opacity-80">{tr("Background music at the start of activities, plus sounds when students join, submit and when it ends. Teachers can mute or lower it.", "موسيقى في بداية الأنشطة ومؤثرات عند الانضمام والإرسال والانتهاء. يمكن للمعلم الكتم أو خفض الصوت.")}</span></span>
      <label className="inline-flex items-center gap-2 font-bold"><input type="checkbox" className="h-5 w-5" disabled={on === null} checked={on !== false} onChange={async (e) => { const v = e.target.checked; try { const r = await lmsApi.actSound(v); setOn(r.on); setMsg(tr("Saved ✓", "تم الحفظ ✓")); } catch { setMsg(tr("Couldn't save.", "تعذر الحفظ.")); } }} data-testid="admin-act-sound-toggle" />{on === false ? tr("Off", "متوقف") : tr("On", "يعمل")}</label>
      {msg && <span className="text-sm">{msg}</span>}
    </section>
  );
}
