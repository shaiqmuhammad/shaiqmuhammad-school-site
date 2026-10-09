"use client";

import { useState } from "react";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { ChoiceList, ResultBars, actErr, hostChip, saveOptions, useTr } from "@/components/activity/common";
import { activityApi, type ActivityState, type Who } from "@/lib/activity";

export const pollChoices = (state: ActivityState) => (Array.isArray(state.settings.options.choices) ? (state.settings.options.choices as unknown[]).map(String) : []);

/** Choice picker shared by poll and vote (students). */
export function ChoicePicker({
  labels,
  images = [],
  max,
  initial,
  disabled,
  onSubmit,
  submitLabel,
}: {
  labels: string[];
  images?: (string | null)[];
  max: number;
  initial: number[];
  disabled: boolean;
  onSubmit: (picks: number[]) => Promise<void>;
  submitLabel: string;
}) {
  const { tr } = useTr();
  const [picks, setPicks] = useState<number[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const toggle = (i: number) => {
    if (disabled) return;
    if (max === 1) setPicks([i]);
    else setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < max ? [...p, i] : p));
  };
  return (
    <div className="space-y-4">
      {max > 1 && <p className="text-sm font-semibold opacity-80">{tr(`Choose up to ${max}`, `اختر حتى ${max}`)} · {picks.length}/{max}</p>}
      <div className={`grid gap-3 ${images.some(Boolean) ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`} role={max === 1 ? "radiogroup" : "group"}>
        {labels.map((l, i) => {
          const on = picks.includes(i);
          return (
            <button
              key={i}
              type="button"
              role={max === 1 ? "radio" : "checkbox"}
              aria-checked={on}
              disabled={disabled}
              onClick={() => toggle(i)}
              className={`flex flex-col items-stretch gap-2 rounded-3xl border-2 p-3 text-start text-lg font-bold transition ${on ? "border-sun-border bg-sun text-navy shadow-lg" : "border-black/10 bg-white/85 hover:border-sun-border dark:border-white/15 dark:bg-white/5"} disabled:opacity-60`}
              data-testid="choice-option"
            >
              {images[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i]!} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
              )}
              <span className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${max === 1 ? "rounded-full" : "rounded-lg"} border-2 ${on ? "border-navy bg-navy text-sun" : "border-current opacity-50"}`} aria-hidden>{on ? "✓" : ""}</span>
                <span className="min-w-0 break-words" dir="auto">{l}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!disabled && (
        <button
          type="button"
          className={`${primaryBtn} w-full sm:w-auto`}
          disabled={busy || !picks.length}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await onSubmit(picks);
            } catch (e) {
              setMsg(actErr(e, tr));
            } finally {
              setBusy(false);
            }
          }}
          data-testid="choice-submit"
        >
          {busy ? "…" : submitLabel}
        </button>
      )}
      {msg && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert">{msg}</p>}
    </div>
  );
}

export function PollStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const labels = pollChoices(state);
  const mine = state.items.find((i) => i.kind === "response" && i.mine);
  const [editing, setEditing] = useState(false);
  const max = state.settings.options.multiple ? labels.length : 1;
  return (
    <div className="space-y-6">
      {mine && !editing ? (
        <div className="glass rounded-3xl p-5" data-testid="poll-done">
          <p className="text-xl font-bold">✅ {tr("Thanks — your answer is in!", "شكرًا — وصلت إجابتك!")}</p>
          <p className="mt-1 opacity-80" dir="auto">{(mine.data.picks || []).map((p) => labels[p]).join(" · ")}</p>
          {!closed && (
            <button type="button" className="mt-3 text-sm font-semibold underline" onClick={() => setEditing(true)} data-testid="poll-change">
              {tr("Change my answer", "تغيير إجابتي")}
            </button>
          )}
        </div>
      ) : (
        <ChoicePicker
          labels={labels}
          max={max}
          initial={mine?.data.picks || []}
          disabled={closed}
          submitLabel={tr("Submit", "إرسال")}
          onSubmit={async (picks) => {
            await activityApi.respond(code, who, { picks });
            setEditing(false);
            reload();
          }}
        />
      )}
      {closed && !mine && <p className="font-semibold opacity-80">{tr("Voting is closed.", "التصويت مغلق.")}</p>}
      {state.summary?.counts ? (
        <section>
          <h2 className="mb-3 text-lg font-bold">{tr("Results", "النتائج")} · {state.summary.voters ?? 0} {tr("voted", "صوّتوا")}</h2>
          <ResultBars labels={labels} counts={state.summary.counts} total={state.summary.voters} />
        </section>
      ) : (
        mine && <p className="text-sm opacity-70" data-testid="poll-results-hidden">{tr("Your teacher will show the results.", "سيعرض المعلم النتائج.")}</p>
      )}
    </div>
  );
}

export function PollHost({ code, hostKey, state, reload, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const labels = pollChoices(state);
  const show = state.settings.options.showResults === true;
  const voters = state.summary?.voters ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-header px-3 py-1.5 text-sm font-bold text-sun" data-testid="poll-voters">🗳 {voters} / {state.participants.filter((p) => !p.removed).length}</span>
        <button type="button" className={hostChip(show)} onClick={async () => { await saveOptions(code, hostKey, state, { showResults: !show }).catch(() => undefined); reload(); }} data-testid="poll-show-results">
          {show ? "👁 " + tr("Results shown to students", "النتائج ظاهرة للطلاب") : "🙈 " + tr("Results hidden from students", "النتائج مخفية عن الطلاب")}
        </button>
        <button
          type="button"
          className={hostChip(false)}
          onClick={async () => {
            if (!confirm(tr("Clear all answers?", "مسح كل الإجابات؟"))) return;
            await activityApi.moderate(code, hostKey, "clear", { kind: "response" }).catch(() => undefined);
            reload();
          }}
          data-testid="poll-clear"
        >
          ↺ {tr("Clear answers", "مسح الإجابات")}
        </button>
        {state.settings.options.multiple === true && <span className="text-sm opacity-70">{tr("Multiple choice", "اختيار متعدد")}</span>}
      </div>
      <div className="glass rounded-[28px] p-4 sm:p-6">
        <ResultBars labels={labels} counts={state.summary?.counts || []} total={voters} big={big} />
      </div>
    </div>
  );
}

export function PollOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  const choices = Array.isArray(options.choices) ? (options.choices as string[]) : ["", ""];
  return (
    <div className="space-y-3 rounded-2xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm font-semibold">{tr("Options", "الخيارات")}</p>
      <ChoiceList choices={choices} setChoices={(c) => setOptions({ ...options, choices: c })} tr={tr} testid="poll-choice" />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={options.multiple === true} onChange={(e) => setOptions({ ...options, choices, multiple: e.target.checked })} data-testid="poll-multiple" />{tr("Allow several answers", "السماح بأكثر من إجابة")}</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={options.showResults === true} onChange={(e) => setOptions({ ...options, choices, showResults: e.target.checked })} />{tr("Show live results to students", "عرض النتائج المباشرة للطلاب")}</label>
      </div>
    </div>
  );
}
