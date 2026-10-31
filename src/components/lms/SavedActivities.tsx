"use client";
import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, type SavedAct, type SavedRow } from "@/lib/lms";
import { ACTIVITY_LABELS, type ActivityType } from "@/lib/activity";

const CARD = ["#fde68a", "#bae6fd", "#bbf7d0", "#fecdd3", "#ddd6fe", "#99f6e4", "#fed7aa", "#c7d2fe"];
type Full = SavedAct & { prompt: string; rows: SavedRow[] };

/** t370: saved activity results — list, and a colourful printable sheet (question, each answer with name, class). */
export function SavedActivitiesPage() {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<SavedAct[] | null>(null);
  const [one, setOne] = useState<Full | null>(null);
  const [err, setErr] = useState("");
  const id = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("id") || "";
  useEffect(() => {
    if (id) lmsApi.actSaved({ id }).then((r) => { setOne(r.item as Full); if (new URLSearchParams(window.location.search).get("print")) setTimeout(() => window.print(), 600); }).catch(() => setErr(tr("Couldn't load this result.", "تعذر تحميل النتيجة.")));
    else lmsApi.actSaved().then((r) => setItems(r.items || [])).catch(() => { setItems([]); setErr(tr("Couldn't load saved results.", "تعذر تحميل النتائج.")); });
  }, [id, tr]);
  const fmt = (n: number) => new Date(n).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
  const lab = (t: string) => ACTIVITY_LABELS[t as ActivityType];
  if (one) {
    const l = lab(one.type);
    return (
      <div className="min-h-screen bg-white p-4 text-[#1b2f44] print:p-0" data-testid="saved-print">
        <style>{`@media print { @page { size: A4; margin: 10mm } .noprint { display:none } body { -webkit-print-color-adjust: exact; print-color-adjust: exact } }`}</style>
        <div className="noprint mb-4 flex gap-2"><a href="/lms/activities/saved" className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold">← {tr("All saved results", "كل النتائج المحفوظة")}</a><button type="button" className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-bold text-[#f5c542]" onClick={() => window.print()} data-testid="saved-print-btn">🖨 {tr("Print / save PDF", "طباعة / PDF")}</button></div>
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border-4 border-[#1b3a57]">
          <header className="bg-[#1b3a57] px-6 py-5 text-white" style={{ backgroundImage: "linear-gradient(135deg,#1b3a57,#2b5b85)" }}>
            <p className="text-sm font-bold uppercase tracking-widest text-[#f5c542]">{l?.icon} {l ? (lang === "ar" ? l.ar : l.en) : one.type}{one.cls ? ` · ${one.cls}` : ""}</p>
            <h1 className="mt-1 text-3xl font-extrabold" dir="auto">{one.prompt || one.title}</h1>
            <p className="mt-1 text-sm opacity-80">{one.title} · {one.teacher} · {fmt(one.at)} · {tr(`${one.rows.length} answers`, `${one.rows.length} إجابة`)}</p>
          </header>
          <ul className="grid grid-cols-2 gap-3 bg-[#fffbea] p-5 sm:grid-cols-3">
            {one.rows.map((r, i) => (
              <li key={i} className="break-inside-avoid rounded-2xl p-3 shadow-sm" style={{ background: CARD[i % CARD.length], transform: `rotate(${(i % 3) - 1}deg)` }}>
                <p className="whitespace-pre-wrap text-base font-bold leading-snug" dir="auto">{r.answer}</p>
                <p className="mt-2 text-xs font-extrabold text-[#1b3a57]" dir="auto">— {r.name}{r.cls ? ` · ${r.cls}` : one.cls ? ` · ${one.cls}` : ""}</p>
              </li>
            ))}
            {!one.rows.length && <li className="col-span-full text-center opacity-70">{tr("No answers were given.", "لم تُقدَّم إجابات.")}</li>}
          </ul>
          <footer className="bg-[#f5c542] px-6 py-2 text-center text-xs font-bold text-[#1b3a57]">shaiqmuhammad.com</footer>
        </div>
      </div>
    );
  }
  return (
    <AssessmentShell title={tr("Saved activity results", "نتائج الأنشطة المحفوظة")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-3 py-6 sm:px-6" data-testid="saved-list">
        <div className="flex flex-wrap items-center gap-2"><h1 className="me-auto text-2xl font-extrabold">💾 {tr("Saved activity results", "نتائج الأنشطة المحفوظة")}</h1><a className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1b2f44] shadow" href="/lms/classes">← {tr("My classes", "صفوفي")}</a></div>
        {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm text-rose-800">{err}</p>}
        {items === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !items.length ? <p className="rounded-3xl bg-white p-8 text-center text-[#1b2f44]">{tr("No saved results yet. Results are saved when you end an activity.", "لا توجد نتائج محفوظة بعد. تُحفظ النتائج عند إنهاء النشاط.")}</p> : (
          <ul className="space-y-2">
            {items.map((x) => { const l = lab(x.type); return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 text-[#1b2f44] shadow-sm" data-testid="saved-item">
                <span className="text-2xl" aria-hidden>{l?.icon || "🎯"}</span>
                <span className="min-w-0 flex-1"><b className="block truncate" dir="auto">{x.title}</b><span className="text-xs opacity-70">{x.cls ? `${x.cls} · ` : ""}{fmt(x.at)} · {tr(`${x.n ?? 0} answers`, `${x.n ?? 0} إجابة`)}</span></span>
                <a className="rounded-full bg-[#1b3a57] px-3 py-1.5 text-sm font-bold text-[#f5c542]" href={`/lms/activities/saved?id=${x.id}`}>👁 {tr("Open", "فتح")}</a>
                <a className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-bold" href={`/lms/activities/saved?id=${x.id}&print=1`}>🖨 PDF</a>
                <button type="button" className="rounded-full px-2 text-rose-600" onClick={() => { if (confirm(tr("Delete this saved result?", "حذف هذه النتيجة؟"))) lmsApi.actSaved({ del: x.id }).then((r) => setItems(r.items || [])); }} aria-label={tr("Delete", "حذف")}>🗑</button>
              </li>); })}
          </ul>
        )}
      </div>
    </AssessmentShell>
  );
}
