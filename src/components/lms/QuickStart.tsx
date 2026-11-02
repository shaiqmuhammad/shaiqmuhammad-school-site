"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BodyPortal } from "@/components/BodyPortal";
import { ActivityOptionsEditor, afterCreate, prepareOptions } from "@/components/activity/ActivityViews";
import { useTr } from "@/components/lms/useLms";
import { lmsApi } from "@/lib/lms";
import { activityApi, ACTIVITY_LABELS, saveHosted, type ActivityType } from "@/lib/activity";

/** t370: start a live activity for the open class in one step — locked to those students, straight to the host screen. */
export function QuickStart({ type, ids, label, back, onClose }: { type: ActivityType; ids: string[]; label: string; back: string; onClose: () => void }) {
  const { tr, lang } = useTr();
  const l = ACTIVITY_LABELS[type];
  const [prompt, setPrompt] = useState("");
  const router = useRouter();
  // t409: subject + topic go on the printable result sheet header.
  const [subject, setSubject] = useState(() => { try { return localStorage.getItem("sm-act-subject") || ""; } catch { return ""; } });
  const [topic, setTopic] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = lang === "ar" ? l.ar : l.en;
  const go = async () => {
    const prepared = prepareOptions(type, options);
    if (!prepared) { setErr(tr("Please fill in the options first (at least two choices / one question).", "يرجى تعبئة الخيارات أولًا.")); return; }
    setBusy(true); setErr("");
    try {
      const title = `${name} · ${label}`;
      const r = await activityApi.create({ type, title, prompt: prompt.trim(), settings: { moderation: "live", hideNames: false, allowImages: true, allowLinks: true, likes: true, options: prepared.options } });
      await afterCreate(type, r.code, r.hostKey, prepared.options, prepared.images);
      await lmsApi.actPublish(r.code, type, r.title, ids, true).catch(() => undefined);
      saveHosted({ code: r.code, hostKey: r.hostKey, type, title: r.title, createdAt: r.createdAt, expiresAt: r.expiresAt });
      try { localStorage.setItem(`sm-act-cls-${r.code}`, label); localStorage.setItem(`sm-act-back-${r.code}`, back); localStorage.setItem(`sm-act-meta-${r.code}`, JSON.stringify({ subject: subject.trim(), topic: topic.trim() })); localStorage.setItem("sm-act-subject", subject.trim()); } catch { /* */ }
      router.push(`/activities/host?code=${r.code}&new=1`);
    } catch { setErr(tr("Couldn't start the activity. Try again.", "تعذر بدء النشاط. حاول مجددًا.")); setBusy(false); }
  };
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/40 p-3" onClick={onClose} role="presentation">
        <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 text-[#1b2f44] shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={name} data-testid="quick-start">
          <div className="mb-3 flex items-center gap-2"><p className="flex-1 text-lg font-extrabold"><span aria-hidden>{l.icon}</span> {name} · <span className="text-[#1b3a57]">{label}</span></p><button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/5" onClick={onClose} aria-label={tr("Close", "إغلاق")}>✕</button></div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="block text-sm font-bold">{tr("Subject", "المادة")}<input className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} dir="auto" placeholder={tr("e.g. Islamic Education", "مثل: التربية الإسلامية")} data-testid="qs-subject" /></label>
            <label className="block text-sm font-bold">{tr("Topic", "الموضوع")}<input className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={160} dir="auto" data-testid="qs-topic" /></label>
          </div>
          <label className="block text-sm font-bold">{tr("Question / prompt for students", "السؤال للطلاب")}
            <textarea autoFocus className="mt-1 min-h-20 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={600} dir="auto" data-testid="qs-prompt" />
          </label>
          <div className="mt-3"><ActivityOptionsEditor type={type} options={options} setOptions={setOptions} /></div>
          {err && <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800">{err}</p>}
          <button type="button" disabled={busy || !ids.length} onClick={go} className="mt-4 w-full rounded-full bg-[#1b3a57] px-5 py-3 text-base font-extrabold text-[#f5c542] disabled:opacity-50" data-testid="qs-go">{busy ? "…" : `▶ ${tr(`Start now — ${ids.length} students join`, `ابدأ الآن — ${ids.length} طالبًا`)}`}</button>
        </div>
      </div>
    </BodyPortal>
  );
}
