"use client";

import { useEffect, useState } from "react";
import { errorText } from "@/components/activity/WallBoard";
import { ActivityError, activityApi, type ActivitySettings, type ActivityState } from "@/lib/activity";
import { useI18n } from "@/lib/i18n";

export type Tr = (en: string, ar: string) => string;

export function useTr(): { tr: Tr; lang: string } {
  const { lang } = useI18n();
  return { tr: (en, ar) => (lang === "ar" ? ar : en), lang };
}

/** Error messages for the non-wall activities (falls back to the wall's list). */
export function actErr(e: unknown, tr: Tr): string {
  const c = e instanceof ActivityError ? e.code : "";
  const extra: Record<string, [string, string]> = {
    limit_reached: ["You've used all your entries.", "استخدمت كل محاولاتك."],
    one_to_three_words: ["Use one to three words.", "استخدم من كلمة إلى ثلاث كلمات."],
    bad_choice: ["Please check your choice.", "يرجى التحقق من اختيارك."],
  };
  return extra[c] ? tr(extra[c][0], extra[c][1]) : errorText(e, tr);
}

/** Merges type options and saves them live (host only). */
export async function saveOptions(code: string, hostKey: string, state: ActivityState, patch: Record<string, unknown>, extra: Partial<ActivitySettings> = {}) {
  await activityApi.settings(code, hostKey, { settings: { ...extra, options: { ...state.settings.options, ...patch } } });
}

export const hostChip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition ${
    on ? "border-sun-border bg-sun text-navy" : "border-black/10 bg-white/70 text-[#1b2f44] hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
  }`;

const BAR_COLORS = ["bg-sky-500", "bg-amber-400", "bg-emerald-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-orange-500", "bg-lime-500", "bg-fuchsia-500", "bg-cyan-500"];

/** Horizontal live result bars. */
export function ResultBars({ labels, counts, total, big = false, highlight = [], images = [] }: { labels: string[]; counts: number[]; total?: number; big?: boolean; highlight?: number[]; images?: (string | null)[] }) {
  const sum = total ?? counts.reduce((a, b) => a + b, 0);
  return (
    <ul className="space-y-3" data-testid="result-bars">
      {labels.map((l, i) => {
        const n = counts[i] || 0;
        const pct = sum ? Math.round((n / sum) * 100) : 0;
        return (
          <li key={i} className={`rounded-2xl p-2 ${highlight.includes(i) ? "ring-4 ring-sun" : ""}`} data-testid="result-bar">
            <div className={`flex items-center gap-3 font-bold ${big ? "text-xl" : "text-base"}`}>
              {images[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i]!} alt="" className={`${big ? "h-14 w-14" : "h-10 w-10"} shrink-0 rounded-xl object-cover`} />
              )}
              <span className="min-w-0 flex-1 break-words" dir="auto">{l}</span>
              <span className="tabular-nums" data-testid="result-count">{n}</span>
              <span className="w-14 text-end text-sm tabular-nums opacity-70">{pct}%</span>
            </div>
            <div className={`mt-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10 ${big ? "h-6" : "h-4"}`}>
              <div className={`h-full rounded-full transition-[width] duration-700 ${BAR_COLORS[i % BAR_COLORS.length]}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A light confetti burst (CSS only) that clears itself after a few seconds. */
export function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 4500);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <span key={i} className="absolute animate-bounce text-3xl" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 9) * 0.12}s` }}>
          {["🎉", "⭐", "✨", "🎊"][i % 4]}
        </span>
      ))}
    </div>
  );
}

/** Editable list of text choices (admin create form + host). */
export function ChoiceList({ choices, setChoices, tr, min = 2, max = 10, testid = "choice" }: { choices: string[]; setChoices: (c: string[]) => void; tr: Tr; min?: number; max?: number; testid?: string }) {
  const input = "min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black/20";
  return (
    <div className="space-y-2">
      {choices.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-center text-sm font-bold opacity-60">{i + 1}</span>
          <input className={input} value={c} maxLength={120} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} placeholder={tr(`Option ${i + 1}`, `الخيار ${i + 1}`)} dir="auto" data-testid={`${testid}-input`} />
          {choices.length > min && (
            <button type="button" className="rounded-full px-2 text-rose-600" onClick={() => setChoices(choices.filter((_, j) => j !== i))} aria-label={tr("Remove option", "حذف الخيار")}>✕</button>
          )}
        </div>
      ))}
      {choices.length < max && (
        <button type="button" className="rounded-full border border-dashed border-black/20 px-3 py-1 text-sm font-semibold dark:border-white/25" onClick={() => setChoices([...choices, ""])} data-testid={`${testid}-add`}>
          + {tr("Add option", "إضافة خيار")}
        </button>
      )}
    </div>
  );
}
