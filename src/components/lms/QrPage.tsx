"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QuranReader } from "@/components/lms/LmsHomework";
import { GRADE_STYLE, card, gradeLabel, useTr } from "@/components/lms/useLms";
import { lmsApi, quranChapters, type Chapter, type QrView, type QuranData } from "@/lib/lms";

/**
 * Strictly isolated, read-only QR page: one student + one homework. No header/nav/footer, no links into the platform,
 * no submission. Data comes only from the token-scoped API.
 */
export function QrPage() {
  const { tr, lang } = useTr();
  const t = useSearchParams().get("t") || "";
  const [d, setD] = useState<QrView | null>(null);
  const [bad, setBad] = useState(false);
  const [ch, setCh] = useState<Chapter | undefined>();
  useEffect(() => {
    if (!t) { setBad(true); return; }
    lmsApi.qrView(t).then((v) => { setD(v); if (v.homework.kind === "quran") quranChapters().then((c) => setCh(c.find((x) => x.id === v.homework.data.surah))).catch(() => undefined); }).catch(() => setBad(true));
  }, [t]);
  const audio = (id: string, label: string, testId: string) => (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-sm font-semibold">{label}</p>
      <audio controls preload="none" className="w-full" src={lmsApi.qrAudioUrl(t, id)} />
    </div>
  );
  const q = d?.homework.data as QuranData | undefined;
  return (
    <main className="min-h-dvh bg-gradient-to-b from-sky-50 to-white px-3 py-6 text-header dark:from-[#0b1622] dark:to-[#0f1a26] dark:text-white" data-testid="qr-page">
      <div className="mx-auto max-w-3xl space-y-4">
        {bad ? (
          <p className={card + " text-center"} data-testid="qr-invalid">{tr("This QR code is not valid or was turned off. Please ask your teacher for a new card.", "رمز QR هذا غير صالح أو تم إيقافه. اطلب بطاقة جديدة من معلمك.")}</p>
        ) : !d ? (
          <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : (
          <>
            <header className="rounded-3xl bg-header px-5 py-5 text-center text-white shadow-lg">
              <p className="text-sm font-semibold tracking-wide text-sun">{d.homework.kind === "quran" ? tr("Quran homework", "واجب القرآن") : tr("Homework", "واجب")}</p>
              <h1 className="mt-1 text-3xl font-extrabold" dir="auto" data-testid="qr-student">{d.student}</h1>
              <p className="opacity-80">{[d.cls, d.section].filter(Boolean).join(" · ")}</p>
              <p className="mt-2 text-lg font-bold" dir="auto">
                {d.homework.kind === "quran" && ch ? `${lang === "ar" ? `سورة ${ch.name_arabic}` : `Surah ${ch.name_simple}`} · ${tr("verses", "الآيات")} ${q?.from}–${q?.to}` : d.homework.title}
              </p>
              {d.grade ? <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${GRADE_STYLE[d.grade]}`} data-testid="qr-grade">{gradeLabel(d.grade, tr)}</span> : null}
            </header>
            {d.homework.kind === "quran" && q?.surah && <QuranReader data={q} />}
            <section className={card + " space-y-3"}>
              <h2 className="text-xl font-bold">🎙️ {tr("My recitation", "تلاوتي")}</h2>
              {d.recordings.length ? d.recordings.map((id, i) => audio(id, d.recordings.length > 1 ? tr(`Recording ${i + 1}`, `التسجيل ${i + 1}`) : "", "qr-rec")) : <p className="opacity-70">{tr("No recording yet.", "لا يوجد تسجيل بعد.")}</p>}
            </section>
            <section className={card + " space-y-3"}>
              <h2 className="text-xl font-bold">💬 {tr("Teacher's feedback", "ملاحظات المعلم")}</h2>
              {d.feedback.length ? d.feedback.map((c, i) => (
                <div key={i} className="space-y-1 rounded-2xl bg-sky-50 px-3 py-2 dark:bg-sky-900/30" data-testid="qr-feedback">
                  <p dir="auto"><b>{c.by}:</b> {c.text}</p>
                  {c.audio && audio(c.audio, tr("Voice feedback", "تعليق صوتي"), "qr-fb-audio")}
                </div>
              )) : <p className="opacity-70">{tr("No feedback yet.", "لا ملاحظات بعد.")}</p>}
            </section>
            {d.homework.kind === "quran" && (
              <section className={card + " space-y-2"}>
                <h2 className="text-xl font-bold">📈 {tr("Tracker", "متابعة الحفظ")}</h2>
                {d.tracker.length ? (
                  <ul className="flex flex-wrap gap-2" data-testid="qr-tracker">
                    {d.tracker.map((r, i) => <li key={i} className={`rounded-2xl px-3 py-1.5 text-sm font-semibold ${GRADE_STYLE[r.grade || "green"]}`}>{r.grade === "red" ? "🔴" : r.grade === "yellow" ? "🟡" : "🟢"} {ch?.name_simple || ""} {r.from}–{r.to}</li>)}
                  </ul>
                ) : <p className="opacity-70">{tr("Not graded yet.", "لم يُقيّم بعد.")}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
