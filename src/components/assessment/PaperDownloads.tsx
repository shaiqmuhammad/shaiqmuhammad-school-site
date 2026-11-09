"use client";

import { DlGate } from "@/components/lms/DlGate";
import { useState } from "react";
import { downloadPaper, printWorksheet, type PaperFormat, type PaperKind } from "@/lib/paperExport";
import type { Quiz } from "@/lib/quiz";

/** "Print / download" menu: colourful classroom worksheet plus a teacher answer key. */
export function PaperDownloads({ quiz, id, load, asAdmin = false, className = "" }: { quiz?: Quiz; id?: string; load?: (id: string, asAdmin?: boolean) => Promise<Quiz | null>; asAdmin?: boolean; className?: string }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState<Quiz | undefined>(quiz);

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
      await downloadPaper(q, kind, f);
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
      printWorksheet(q, kind);
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
    <DlGate kind="export"><details className={`relative z-10 open:z-50 ${className}`} data-testid="paper-downloads">
      <summary className="cursor-pointer list-none rounded-full border border-card-border px-3 py-1 text-xs font-semibold">🖨 Print / download</summary>
      <div className="absolute end-0 z-50 mt-2 w-72 space-y-2 rounded-xl border border-card-border bg-card p-3 text-sm shadow-xl">
        <p className="text-[11px] leading-snug text-muted">Colourful worksheet for lessons and student books. Edit the questions in the system, then print again.</p>
        <button type="button" disabled={!!busy} data-testid="print-worksheet" onClick={() => printIt("paper")} className="w-full rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-[#0b1b2b] disabled:opacity-50">
          {busy === "print-paper" ? "…" : "🖨 Print colourful worksheet"}
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
