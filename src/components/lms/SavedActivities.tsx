"use client";
import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, type SavedAct, type SavedRow } from "@/lib/lms";
import { ACTIVITY_LABELS, type ActivityType } from "@/lib/activity";

import { qrImageUrl } from "@/lib/groupSession";

type Full = SavedAct & { prompt: string; tok?: string; rows: SavedRow[] };

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
        <ResultSheet r={one} lang={lang} qr={one.tok ? `${window.location.origin}/result?t=${one.tok}` : ""} />
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

const BUB = ["#0284c7", "#d97706", "#059669", "#e11d48", "#7c3aed", "#0d9488", "#1b3a57", "#c026d3", "#ea580c", "#4f46e5"];
/** t375: the printable / public sheet — answers as a packed word cloud (word cloud) or colourful cloud bubbles (other types). */
export function ResultSheet({ r, lang, qr, names = true }: { r: { type: string; title: string; prompt: string; cls: string; subject?: string; topic?: string; at: number; teacher?: string; rows: { name?: string; answer: string; cls?: string; group?: string; ok?: boolean }[] }; lang: string; qr?: string; names?: boolean }) {
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const l = ACTIVITY_LABELS[r.type as ActivityType];
  const date = new Date(r.at).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
  // t409: every answer is a colourful bubble with the student's name in small text right beside it (no separate list).
  type Bub = { answer: string; names: string[]; ok?: boolean };
  const bubbles = (rows: typeof r.rows): Bub[] => {
    if (r.type !== "wordcloud") return rows.map((x) => ({ answer: x.answer, names: x.name ? [x.name] : [], ok: x.ok }));
    const m = new Map<string, Bub>();
    rows.forEach((x) => { const k = x.answer.toLocaleLowerCase(); const b = m.get(k) || { answer: x.answer, names: [] }; if (x.name) b.names.push(x.name); else b.names.push(""); m.set(k, b); });
    return [...m.values()].sort((a, b) => b.names.length - a.names.length);
  };
  const groups: [string, typeof r.rows][] = (() => {
    if (!r.rows.some((x) => x.group)) return [["", r.rows]];
    const m = new Map<string, typeof r.rows>();
    r.rows.forEach((x) => { const g = x.group || ""; m.set(g, [...(m.get(g) || []), x]); });
    return [...m.entries()];
  })();
  let n = 0;
  const bubble = (b: Bub) => {
    const i = n++;
    const count = r.type === "wordcloud" ? b.names.length : 1;
    const who = names ? b.names.filter(Boolean) : [];
    return (
      <span key={i} className="inline-flex max-w-full items-baseline gap-1.5 rounded-[2rem] px-4 py-2 font-extrabold text-white shadow-md" style={{ background: b.ok === undefined ? BUB[i % BUB.length] : b.ok ? "#059669" : "#e11d48", fontSize: `${Math.min(2.2, (b.answer.length < 40 ? 1.1 : 0.95) + (count - 1) * 0.3)}rem`, transform: `rotate(${((i * 7) % 5) - 2}deg)` }} dir="auto" data-testid="result-answer">
        {b.ok !== undefined && <span aria-label={b.ok ? tr("correct", "صحيح") : tr("not correct", "غير صحيح")}>{b.ok ? "✓" : "✗"}</span>}
        <span className="whitespace-pre-wrap break-words">{b.answer}</span>
        {r.type === "wordcloud" && count > 1 && <span className="text-[0.6em] opacity-90">×{count}</span>}
        {who.length > 0 && <span className="text-[11px] font-semibold leading-none text-white/85" data-testid="result-name">— {who.join(", ")}</span>}
      </span>
    );
  };
  const meta: [string, string][] = [[tr("Class", "الصف"), r.cls], [tr("Subject", "المادة"), r.subject || ""], [tr("Topic", "الموضوع"), r.topic || r.title]];
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border-4 border-[#1b3a57] bg-white text-[#1b2f44]" data-testid="result-sheet">
      <header className="flex items-start gap-4 px-6 py-5 text-white" style={{ backgroundImage: "linear-gradient(135deg,#1b3a57,#2b5b85)" }}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-widest text-[#f5c542]">{l?.icon} {l ? (lang === "ar" ? l.ar : l.en) : r.type}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-white" style={{ color: "#ffffff" }} data-testid="result-meta">
            {meta.filter(([, v]) => v).map(([k, v]) => <span key={k}><b className="text-[#f5c542]">{k}:</b> <span dir="auto">{v}</span></span>)}
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-[#f5c542]">{tr("Question", "السؤال")}</p>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl" style={{ color: "#ffffff" }} dir="auto" data-testid="result-question">{r.prompt || r.title}</h1>
          <p className="mt-1 text-sm text-white opacity-90" style={{ color: "#ffffff" }}>📅 {date}{r.teacher ? ` · ${r.teacher}` : ""} · {tr(`${r.rows.length} answers`, `${r.rows.length} إجابة`)}</p>
        </div>
        {qr && <div className="shrink-0 rounded-2xl bg-white p-1.5 text-center" data-testid="result-qr">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qrImageUrl(qr, 240)} alt={tr("QR code to view these results", "رمز QR لعرض النتائج")} width={110} height={110} className="h-[110px] w-[110px]" /><p className="text-[10px] font-bold text-[#1b3a57]">{tr("Scan to view", "امسح للعرض")}</p></div>}
      </header>
      <div className="space-y-3 bg-[#fffbea] p-4">
        {!r.rows.length ? <p className="py-8 text-center opacity-70">{tr("No answers were given.", "لم تُقدَّم إجابات.")}</p> : groups.map(([g, rows]) => (
          <section key={g || "all"} className="rounded-[28px] bg-white p-4" data-testid="result-bubbles">
            {g && <p className="mb-2 inline-block rounded-full bg-[#1b3a57] px-4 py-1 text-sm font-extrabold text-[#f5c542]" style={{ color: "#f5c542" }} dir="auto" data-testid="result-group">{g}</p>}
            <div className="flex min-h-24 flex-wrap items-center justify-center gap-3">{bubbles(rows).map(bubble)}</div>
          </section>
        ))}
      </div>
      <footer className="bg-[#f5c542] px-6 py-2 text-center text-xs font-bold text-[#1b3a57]">shaiqmuhammad.com</footer>
    </div>
  );
}

/** t375: public, no-login, read-only view of one saved result (QR on the printed sheet). No student names. */
export function PublicResultPage() {
  const [r, setR] = useState<Awaited<ReturnType<typeof lmsApi.actResult>> | null>(null);
  const [err, setErr] = useState(false);
  const [lang, setLang] = useState("en");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setLang(document.documentElement.lang === "ar" ? "ar" : "en"); } catch { /* */ } const t = new URLSearchParams(window.location.search).get("t") || ""; lmsApi.actResult(t).then(setR).catch(() => setErr(true)); }, []);
  return (
    <div className="min-h-screen bg-[#0f1f30] p-3 sm:p-6" data-testid="public-result">
      {err ? <p className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center font-bold text-[#1b2f44]">{lang === "ar" ? "هذا الرابط غير صالح." : "This link isn't valid."}</p> : !r ? <p className="text-center text-white/80">…</p> : <ResultSheet r={r} lang={lang} names={false} />}
    </div>
  );
}
