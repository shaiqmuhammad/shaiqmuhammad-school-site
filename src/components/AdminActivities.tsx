"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityOptionsEditor, READY_TYPES } from "@/components/activity/ActivityViews";
import { getServerSession } from "@/lib/adminServer";
import { activityApi, ACTIVITY_LABELS, ActivityError, forgetHosted, loadHosted, saveHosted, type ActivitySettings, type ActivityType, type HostedActivity } from "@/lib/activity";
import { joinUrl } from "@/lib/groupSession";
import { useI18n } from "@/lib/i18n";

const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btnGhost = "btn-glass px-3 py-1.5 text-sm disabled:opacity-60";
const TYPES: ActivityType[] = ["wall", "wordcloud", "poll", "survey", "tps", "vote"];
/** Teacher-only tools that run entirely in the browser (no join code). */
const TOOLS = [
  { href: "/activities/wheel", icon: "🎡", en: "Spinning wheel", ar: "العجلة الدوارة", hintEn: "Names typed or pulled from a live activity; sound; remove winner.", hintAr: "أسماء مكتوبة أو من نشاط مباشر؛ صوت؛ إزالة الفائز." },
  { href: "/activities/randomiser", icon: "🎲", en: "Randomiser", ar: "المُختار العشوائي", hintEn: "Pick a student, make groups of N, random number.", hintAr: "اختيار طالب، تكوين مجموعات، رقم عشوائي." },
];

/** Admin → Activities: create a live classroom activity (join code + QR) and reopen ones made on this device. */
export function AdminActivities() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [type, setType] = useState<ActivityType>("wall");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [moderation, setModeration] = useState<"live" | "approve">("live");
  const [hideNames, setHideNames] = useState(false);
  const [allowImages, setAllowImages] = useState(true);
  const [allowLinks, setAllowLinks] = useState(true);
  const [likes, setLikes] = useState(true);
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [hosted, setHosted] = useState<HostedActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = Boolean(getServerSession());
  const [now, setNow] = useState(0);
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHosted(loadHosted());
    setNow(Date.now());
  }, []);

  const ready = READY_TYPES.includes(type);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const settings: Partial<ActivitySettings> = { moderation, hideNames, allowImages, allowLinks, likes, options };
      const r = await activityApi.create({ type, title: title.trim(), prompt: prompt.trim(), settings });
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
      <section className="glass rounded-3xl p-5">
        <h2 className="text-xl font-bold">{tr("Classroom activities", "أنشطة الصف")}</h2>
        <p className="mt-1 text-sm opacity-80">
          {tr(
            "Create an activity, show the QR code / 5-letter code on the projector, and students join at /join on their phones. Activities expire after 7 days. Everything can be exported to Excel from the host screen.",
            "أنشئ نشاطًا واعرض رمز QR أو الرمز المكوّن من 5 أحرف على جهاز العرض، وينضم الطلاب عبر /join من هواتفهم. تنتهي الأنشطة بعد 7 أيام، ويمكن تصدير كل شيء إلى إكسل من شاشة المعلم.",
          )}
        </p>

        <form onSubmit={create} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label={tr("Activity type", "نوع النشاط")}>
            {TYPES.map((t) => {
              const l = ACTIVITY_LABELS[t];
              const ok = READY_TYPES.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => { setType(t); setOptions({}); }}
                  className={`rounded-2xl border p-3 text-start transition ${type === t ? "border-sun-border bg-sun text-navy shadow" : "border-card-border bg-card-solid hover:border-sun-border"} ${ok ? "" : "opacity-60"}`}
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

      <section className="glass rounded-3xl p-5">
        <h2 className="text-lg font-bold">{tr("Teacher tools (no join code)", "أدوات المعلم (بدون رمز)")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <a key={t.href} href={t.href} className="flex items-start gap-3 rounded-2xl border border-card-border bg-card-solid p-4 transition hover:border-sun-border" data-testid={`tool-${t.href.split("/").pop()}`}>
              <span className="text-3xl" aria-hidden>{t.icon}</span>
              <span>
                <span className="block font-bold">{lang === "ar" ? t.ar : t.en}</span>
                <span className="block text-sm opacity-80">{lang === "ar" ? t.hintAr : t.hintEn}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-5">
        <h2 className="text-lg font-bold">{tr("Your activities on this device", "أنشطتك على هذا الجهاز")}</h2>
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
                      {expired ? ` · ${tr("expired", "منتهي")}` : ""}
                    </span>
                  </span>
                  {!expired && (
                    <>
                      <a className={btnGhost} href={`/activities/host?code=${h.code}`}>{tr("Open host screen", "فتح شاشة المعلم")}</a>
                      <button type="button" className={btnGhost} onClick={() => navigator.clipboard?.writeText(joinUrl(h.code)).catch(() => undefined)}>{tr("Copy join link", "نسخ رابط الانضمام")}</button>
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
