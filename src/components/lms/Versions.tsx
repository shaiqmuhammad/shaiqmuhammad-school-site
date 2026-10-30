"use client";

import type { ReactNode } from "react";
import { FeedbackText, ScoreBadges } from "@/components/lms/QuranScores";
import { GRADE_STYLE, gradeLabel, useTr } from "@/components/lms/useLms";
import type { Version } from "@/lib/lms";

/** t328: the student's progress on one Surah, start to end: v1, v2… with recording, marks and feedback. */
export function VersionTimeline({ list, audio, open = false }: { list: Version[]; audio: (id: string, v: Version) => ReactNode; open?: boolean }) {
  const { tr, lang } = useTr();
  if (!list.length) return null;
  return (
    <details className="rounded-2xl bg-sky-50 px-3 py-2 text-slate-900" open={open} data-testid="versions">
      <summary className="cursor-pointer text-sm font-extrabold">📈 {tr(`Progress — ${list.length} version${list.length === 1 ? "" : "s"}`, `التقدم — ${list.length} نسخ`)}</summary>
      <ol className="mt-2 space-y-2 border-s-4 border-sky-300 ps-3">
        {list.map((x) => (
          <li key={`${x.hw}-${x.v}`} className="space-y-1 rounded-xl bg-white p-2" data-testid="version" data-v={x.v}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b className="rounded-full bg-header px-2 py-0.5 text-xs text-white">v{x.v}</b>
              <span className="opacity-70">{x.from && x.to ? `${x.from}–${x.to} · ` : ""}{x.at ? new Date(x.at).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
              {x.pending ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{tr("Waiting for review", "بانتظار المراجعة")}</span> : x.grade ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[x.grade]}`}>{gradeLabel(x.grade, tr)}</span> : null}
              <ScoreBadges s={x.scores} compact />
              {x.by && <span className="text-xs opacity-60">{x.by}</span>}
            </div>
            {x.audio && audio(x.audio, x)}
            {x.scores?.fb && <FeedbackText s={x.scores} />}
            {x.feedback.map((f, i) => <p key={i} className="text-xs" dir="auto">💬 {f}</p>)}
          </li>
        ))}
      </ol>
    </details>
  );
}
