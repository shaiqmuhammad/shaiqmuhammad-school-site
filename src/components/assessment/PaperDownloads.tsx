"use client";

import { useState } from "react";
import { downloadPaper, type PaperFormat, type PaperKind } from "@/lib/paperExport";
import type { Quiz } from "@/lib/quiz";

const FORMATS: { f: PaperFormat; label: string }[] = [
  { f: "docx", label: "Word" },
  { f: "pdf", label: "PDF" },
  { f: "xlsx", label: "Excel" },
];

/** "Print / download" menu: question paper and separate answer key as Word, PDF or Excel. */
export function PaperDownloads({ quiz, className = "" }: { quiz: Quiz; className?: string }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function run(kind: PaperKind, f: PaperFormat) {
    setBusy(`${kind}-${f}`);
    setErr("");
    try {
      await downloadPaper(quiz, kind, f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <details className={`relative ${className}`} data-testid="paper-downloads">
      <summary className="cursor-pointer list-none rounded-full border border-card-border px-3 py-1 text-xs font-semibold">⬇ Print / download</summary>
      <div className="absolute end-0 z-20 mt-2 w-64 space-y-2 rounded-xl border border-card-border bg-card p-3 text-sm shadow-lg">
        {(["paper", "key"] as PaperKind[]).map((kind) => (
          <div key={kind}>
            <p className="mb-1 text-xs font-semibold uppercase text-muted">{kind === "paper" ? "Question paper" : "Answer key"}</p>
            <div className="flex gap-2">
              {FORMATS.map(({ f, label }) => (
                <button key={f} type="button" disabled={!!busy || !quiz.questions.length} data-testid={`dl-${kind}-${f}`} onClick={() => run(kind, f)} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold disabled:opacity-50">
                  {busy === `${kind}-${f}` ? "…" : label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </details>
  );
}
