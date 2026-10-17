"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/lms/Avatar";
import { PointsCharts } from "@/components/lms/LmsClasses";
import { CriteriaChart, TrackerEntries } from "@/components/lms/QuranScores";
import { lmsApi, quranChapters, type Chapter, type ReportView } from "@/lib/lms";

/** Public, read-only parent report (token link, no login, no site chrome, no links into the platform). */
export function ReportPage() {
  const t = useSearchParams().get("t") || "";
  const [d, setD] = useState<ReportView | null>(null);
  const [bad, setBad] = useState(false);
  const [ch, setCh] = useState<Chapter[]>([]);
  const [ar, setAr] = useState(false);
  useEffect(() => { lmsApi.reportView(t).then(setD).catch(() => setBad(true)); quranChapters().then(setCh).catch(() => undefined); }, [t]);
  const tr = (en: string, a: string) => (ar ? a : en);
  const pts = d?.points || [];
  const pos = pts.filter((p) => p.pts > 0).reduce((a, p) => a + p.pts, 0), neg = pts.filter((p) => p.pts < 0).reduce((a, p) => a + p.pts, 0);
  const by = new Map<string, number>();
  for (const p of pts) by.set(p.label, (by.get(p.label) || 0) + p.pts);
  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f3f6fa] px-4 py-6 text-[#1f2d3d]" data-testid="report-page">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="flex items-center gap-3 rounded-3xl bg-[#1b3a57] p-4 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full border-2 border-[#f5c542] object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          <div className="min-w-0 flex-1"><p className="font-extrabold">Shaiq Muhammad</p><p className="text-xs opacity-80">{d?.kind === "quran" ? tr("Quran learning report", "تقرير تعلّم القرآن") : tr("Points & behaviour report", "تقرير النقاط والسلوك")}</p></div>
          <button type="button" onClick={() => setAr(!ar)} className="rounded-full border border-white/30 px-3 py-1 text-xs font-bold">{ar ? "EN" : "ع"}</button>
        </header>
        {bad && <p className="rounded-2xl bg-white p-6 text-center shadow" data-testid="report-bad">{tr("This link isn't valid any more.", "هذا الرابط لم يعد صالحًا.")}</p>}
        {!d && !bad && <p className="p-6 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>}
        {d && (
          <>
            <section className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow"><Avatar code={d.avatar} size={72} /><div><h1 className="text-2xl font-extrabold" dir="auto" data-testid="report-name">{d.name}</h1><p className="opacity-70">{[d.cls, d.section].filter(Boolean).join(" · ")}</p></div></section>
            {d.kind === "points" ? (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[[tr("Net", "الصافي"), pos + neg, ""], [tr("Positive", "إيجابية"), `+${pos}`, "text-emerald-600"], [tr("Deductions", "خصومات"), neg, "text-rose-600"]].map(([l, v, c], i) => <div key={i} className="rounded-3xl bg-white p-3 shadow"><p className="text-xs opacity-60">{l}</p><p className={`text-2xl font-extrabold ${c}`}>{v}</p></div>)}
                </div>
                <section className="rounded-3xl bg-white p-5 shadow"><h2 className="mb-2 font-extrabold">{tr("Last 60 days", "آخر 60 يومًا")}</h2><PointsCharts rows={pts} days={60} /></section>
                <section className="rounded-3xl bg-white p-5 shadow"><h2 className="mb-2 font-extrabold">{tr("Skills", "المهارات")}</h2><ul className="space-y-1 text-sm">{[...by.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => <li key={l} className="flex justify-between"><span>{l}</span><b className={v < 0 ? "text-rose-600" : "text-emerald-600"}>{v > 0 ? "+" : ""}{v}</b></li>)}</ul></section>
                <section className="rounded-3xl bg-white p-5 shadow"><h2 className="mb-2 font-extrabold">{tr("Recent", "الأحدث")}</h2><ul className="space-y-1 text-sm">{pts.slice(0, 25).map((p, i) => <li key={i} className="flex justify-between gap-2"><span>{p.icon} {p.label} <span className="opacity-60">· {new Date(p.at).toLocaleDateString()}</span></span><b className={p.pts < 0 ? "text-rose-600" : "text-emerald-600"}>{p.pts > 0 ? "+" : ""}{p.pts}</b></li>)}</ul></section>
              </>
            ) : (
              <section className="rounded-3xl bg-white p-5 shadow text-heading" data-testid="report-quran"><h2 className="mb-3 font-extrabold">{tr("Quran learning", "تعلّم القرآن")}</h2>
                {d.tracker?.length ? <><TrackerEntries rows={d.tracker} surahName={(n) => ch.find((c) => c.id === n)?.name_simple || `Surah ${n}`} /><div className="mt-4"><CriteriaChart rows={d.tracker} /></div></> : <p className="opacity-70">{tr("No graded recitations yet.", "لا توجد تلاوات مقيَّمة بعد.")}</p>}
              </section>
            )}
          </>
        )}
        <footer className="pb-4 text-center text-xs opacity-60">{tr("Private read-only report · Questions: contact@shaiqmuhammad.com", "تقرير خاص للقراءة فقط · للاستفسار: contact@shaiqmuhammad.com")}</footer>
      </div>
    </main>
  );
}
