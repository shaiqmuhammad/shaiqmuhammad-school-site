"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatClock, useAssessmentText } from "@/lib/assessmentI18n";

type Props = {
  title?: string;
  /** Link for the exit (×) button; `onExit` runs first and can cancel by returning false. */
  exitHref?: string;
  onExit?: () => boolean;
  /** Seconds remaining; null/undefined hides the timer. */
  secondsLeft?: number | null;
  /** Progress bar: current index (0-based), total, and which questions are answered. */
  progress?: { current: number; total: number; answered?: boolean[]; onJump?: (i: number) => void };
  children: ReactNode;
};

/**
 * Full-screen, distraction-free frame for assessments: navy bar, warm yellow and cream (light + dark),
 * minimal chrome (exit, progress, timer, language/theme), content centred with big type.
 */
export function AssessmentShell({ title, exitHref = "/assessments", onExit, secondsLeft, progress, children }: Props) {
  const { a } = useAssessmentText();
  const showTimer = typeof secondsLeft === "number";
  const low = showTimer && (secondsLeft as number) <= 30;
  const warn = showTimer && !low && (secondsLeft as number) <= 120;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-gradient-to-br from-cream via-white to-white text-[#1b2f44] dark:from-[#0d1b2a] dark:via-[#0d1b2a] dark:to-[#10263b] dark:text-[#e6eef6]">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-teal-brand/15 blur-3xl dark:bg-teal-brand/15" />
        <div className="absolute -bottom-24 -end-16 h-80 w-80 rounded-full bg-sun/30 blur-3xl dark:bg-sun/10" />
      </div>

      <header className="relative z-10 bg-header text-white shadow-[0_6px_20px_-10px_rgba(10,25,40,0.6)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 sm:px-6">
          <Link
            href={exitHref}
            onClick={(e) => {
              if (onExit && !onExit()) e.preventDefault();
            }}
            aria-label={a("exit")}
            title={a("exit")}
            className="pill-on-navy h-9 w-9 shrink-0 justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          {title ? (
            <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-white sm:text-base">{title}</p>
          ) : (
            <span className="flex-1" />
          )}
          {showTimer && (
            <div
              role="timer"
              aria-live="polite"
              aria-label={a("timeLeft")}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-base font-bold tabular-nums shadow-sm sm:text-lg ${
                low
                  ? "animate-pulse bg-rose-600 text-white"
                  : warn
                    ? "bg-amber-400 text-amber-950"
                    : "border border-sun-border bg-sun text-navy"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2.5M9 2h6" />
              </svg>
              <span dir="ltr">{formatClock(secondsLeft as number)}</span>
            </div>
          )}
          <LanguageToggle variant="navy" />
          <ThemeToggle variant="navy" />
        </div>
        {progress && progress.total > 0 && (
          <div className="mx-auto flex max-w-5xl gap-1 px-3 pb-2.5 sm:px-6" aria-label={a("questionOf", { i: progress.current + 1, n: progress.total })}>
            {Array.from({ length: progress.total }, (_, i) => {
              const done = progress.answered?.[i];
              const cur = i === progress.current;
              return (
                <button
                  key={i}
                  type="button"
                  tabIndex={progress.onJump ? 0 : -1}
                  onClick={() => progress.onJump?.(i)}
                  aria-label={a("questionOf", { i: i + 1, n: progress.total })}
                  aria-current={cur ? "step" : undefined}
                  className={`h-2 flex-1 rounded-full transition ${
                    cur
                      ? "bg-coral ring-2 ring-coral/40"
                      : done
                        ? "bg-sun"
                        : "bg-white/20"
                  } ${progress.onJump ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                />
              );
            })}
          </div>
        )}
      </header>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col [&>*]:min-w-0">{children}</main>
    </div>
  );
}
