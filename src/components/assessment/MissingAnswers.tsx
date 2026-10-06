"use client";

import { useEffect, useRef } from "react";
import { useAssessmentText } from "@/lib/assessmentI18n";

type Props = {
  /** answered flag per question, in order */
  answered: boolean[];
  onJump: (index: number) => void;
  onClose: () => void;
};

/** Every question must be answered before submitting: lists the unanswered ones with jump buttons. */
export function MissingAnswers({ answered, onJump, onClose }: Props) {
  const { lang } = useAssessmentText();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const missing = answered.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0);
  if (!missing.length) return null;
  const ar = lang === "ar";
  return (
    <div ref={ref} role="alert" data-testid="missing-answers" className="mt-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-50">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-bold">
          {ar
            ? `أجب عن جميع الأسئلة قبل التسليم. بقي ${missing.length}:`
            : `Please answer every question before you submit. ${missing.length} still to do:`}
        </p>
        <button type="button" onClick={onClose} className="text-xl leading-none opacity-60 hover:opacity-100" aria-label={ar ? "إغلاق" : "Close"}>
          ×
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {missing.map((i) => (
          <button
            key={i}
            type="button"
            data-testid={`jump-${i}`}
            onClick={() => onJump(i)}
            className="rounded-xl bg-amber-500 px-4 py-2 text-base font-bold text-white hover:bg-amber-600 dark:bg-amber-500 dark:text-amber-950"
          >
            {ar ? `السؤال ${i + 1}` : `Question ${i + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}
