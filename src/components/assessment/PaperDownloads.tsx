"use client";

import { DlGate } from "@/components/lms/DlGate";
import { useEffect, useState } from "react";
import { defaultPaperLang, downloadPaper, printWorksheet, type PaperFormat, type PaperKind, type PaperLang } from "@/lib/paperExport";
import { lmsSession } from "@/lib/lms";
import type { Quiz } from "@/lib/quiz";

const LANGS: { id: PaperLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ar", label: "العربية" },
  { id: "both", label: "Both" },
];

/** "Print / download" menu: clean A4 worksheet in the chosen language, plus a teacher answer key. */
export function PaperDownloads({ quiz, id, load, asAdmin = false, className = "", subject }: { quiz?: Quiz; id?: string; load?: (id: string, asAdmin?: boolean) => Promise<Quiz | null>; asAdmin?: boolean; className?: string; subject?: string }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState<Quiz | undefined>(quiz);
  const [picked, setPicked] = useState(false);
  const [lang, setLang] = useState<PaperLang>(() => defaultPaperLang(quiz?.subject || subject, lmsSession()?.user.subjects));

  useEffect(() => {
    if (picked) return;
    const sub = (loaded || quiz)?.subject || subject;
    setLang(defaultPaperLang(sub, lmsSession()?.user.subjects));
  }, [loaded, quiz, subject, picked]);

  async function ensure(): Promise<Quiz | null> {
    if (loaded && loaded.questions?.length) return loaded;
    if (quiz && quiz.questions?.length) return quiz;
    const key = id || quiz?.id || quiz?.slug;
    if (!key || !load) return loaded || quiz || null;
    try {
      const q = await load(key, asAdmin);
      if (q) setLoaded(q);
      return q;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function run(kind: PaperKind, f: PaperFormat) {
    setBusy(`${kind}-${f}`);
    setErr("");
    try {
      const q = await ensure();
      if (!q?.questions.length) { setErr("Add questions first."); return; }
      await downloadPaper(q, kind, f, lang);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function printIt(kind: PaperKind = "paper") {
    setBusy(`print-${kind}`);
    setErr("");
    try {
      const q = await ensure();
      if (!q?.questions.length) { setErr("Add questions first."); return; }
      printWorksheet(q, kind, lang);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const go = (label: string, key: string, fn: () => void) => (
    <button key={key} type="button" disabled={!!busy} data-testid={key} onClick={fn} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold disabled:opacity-50">
      {busy === key.replace("dl-", "").replace("paper-print", "print-paper") ? "…" : label}
    </button>
  );

  return (
    <DlGate kind="export"><details className={`relative z-10 open:z-50 ${className}`} data-testid="paper-downloads" onToggle={(e) => { if (e.currentTarget.open) void ensure(); }}>
      <summary className="cursor-pointer list-none rounded-full border border-card-border px-3 py-1 text-xs font-semibold">🖨 Print / download</summary>
      <div className="absolute end-0 z-50 mt-2 w-80 space-y-2 rounded-xl border border-card-border bg-card p-3 text-sm shadow-xl">
        <p className="text-[11px] leading-snug text-muted">Clean A4 worksheet for lessons and student books. Pick a language — English and Arabic are never mixed on the same page.</p>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted">Language</p>
          <div className="flex flex-wrap gap-1.5" data-testid="paper-lang">
            {LANGS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`paper-lang-${opt.id}`}
                aria-pressed={lang === opt.id}
                onClick={() => { setLang(opt.id); setPicked(true); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${lang === opt.id ? "bg-header text-white" : "border border-card-border"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" disabled={!!busy} data-testid="print-worksheet" onClick={() => printIt("paper")} className="w-full rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-[#0b1b2b] disabled:opacity-50">
          {busy === "print-paper" ? "…" : "🖨 Print worksheet"}
        </button>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted">Student worksheet</p>
          <div className="flex flex-wrap gap-2">
            {go("Word (editable)", "dl-paper-docx", () => run("paper", "docx"))}
            {go("PDF", "dl-paper-pdf", () => run("paper", "pdf"))}
            {go("Excel", "dl-paper-xlsx", () => run("paper", "xlsx"))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted">Answer key</p>
          <div className="flex flex-wrap gap-2">
            {go("Print", "print-key", () => printIt("key"))}
            {go("Word", "dl-key-docx", () => run("key", "docx"))}
            {go("PDF", "dl-key-pdf", () => run("key", "pdf"))}
            {go("Excel", "dl-key-xlsx", () => run("key", "xlsx"))}
          </div>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </details></DlGate>
  );
}
