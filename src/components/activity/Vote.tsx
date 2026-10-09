"use client";

import { useState } from "react";
import { ChoicePicker } from "@/components/activity/Poll";
import { Confetti, ResultBars, hostChip, saveOptions, useTr } from "@/components/activity/common";
import { activityApi, compressImage, type ActivityState, type Who } from "@/lib/activity";

export type VoteChoice = { text: string; item?: string };

export const voteChoices = (state: ActivityState): VoteChoice[] =>
  Array.isArray(state.settings.options.choices) ? (state.settings.options.choices as VoteChoice[]).map((c) => (typeof c === "string" ? { text: c } : { text: String(c?.text ?? ""), item: c?.item })) : [];

/** Option picture URLs (pictures are uploaded as hidden teacher items of kind "optimg"). */
export function voteImages(code: string, state: ActivityState): (string | null)[] {
  return voteChoices(state).map((c) => {
    const it = c.item ? state.items.find((i) => i.id === c.item) : undefined;
    return it?.img ? activityApi.imgUrl(code, it.img) : null;
  });
}

function winners(counts: number[]): number[] {
  const top = Math.max(0, ...counts);
  return top > 0 ? counts.map((n, i) => (n === top ? i : -1)).filter((i) => i >= 0) : [];
}

function Winner({ labels, counts, images }: { labels: string[]; counts: number[]; images: (string | null)[] }) {
  const { tr } = useTr();
  const w = winners(counts);
  if (!w.length) return null;
  return (
    <>
      <Confetti />
      <div className="relative z-10 rounded-[28px] bg-header p-6 text-center text-white shadow-2xl" data-testid="vote-winner">
        <p className="text-lg font-bold uppercase tracking-widest text-sun">{w.length > 1 ? tr("It's a tie!", "تعادل!") : tr("The winner is…", "الفائز هو…")}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-6">
          {w.map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              {images[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i]!} alt="" className="h-28 w-28 rounded-2xl object-cover ring-4 ring-sun" />
              )}
              <p className="text-4xl font-black sm:text-5xl" dir="auto">🏆 {labels[i]}</p>
              <p className="text-white/80">{counts[i]} {tr("votes", "صوت")}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function VoteStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const choices = voteChoices(state);
  const labels = choices.map((c) => c.text);
  const images = voteImages(code, state);
  const mine = state.items.find((i) => i.kind === "response" && i.mine);
  const [editing, setEditing] = useState(false);
  const max = Math.max(1, Number(state.settings.options.votesEach) || 1);
  return (
    <div className="space-y-6">
      {state.ended && state.summary?.counts && <Winner labels={labels} counts={state.summary.counts} images={images} />}
      {mine && !editing ? (
        <div className="glass rounded-3xl p-5" data-testid="vote-done">
          <p className="text-xl font-bold">✅ {tr("Your vote is in!", "تم تسجيل صوتك!")}</p>
          <p className="mt-1 opacity-80" dir="auto">{(mine.data.picks || []).map((p) => labels[p]).join(" · ")}</p>
          {!closed && (
            <button type="button" className="mt-3 text-sm font-semibold underline" onClick={() => setEditing(true)}>{tr("Change my vote", "تغيير صوتي")}</button>
          )}
        </div>
      ) : (
        !closed && (
          <ChoicePicker
            labels={labels}
            images={images}
            max={max}
            initial={mine?.data.picks || []}
            disabled={closed}
            submitLabel={tr("Vote", "صوّت")}
            onSubmit={async (picks) => {
              await activityApi.respond(code, who, { picks });
              setEditing(false);
              reload();
            }}
          />
        )
      )}
      {state.summary?.counts && !state.ended && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{tr("Live results", "النتائج المباشرة")}</h2>
          <ResultBars labels={labels} counts={state.summary.counts} images={images} />
        </section>
      )}
      {state.ended && state.summary?.counts && <ResultBars labels={labels} counts={state.summary.counts} images={images} highlight={winners(state.summary.counts)} />}
      {closed && !state.ended && <p className="font-semibold opacity-80">{tr("Voting is closed.", "التصويت مغلق.")}</p>}
    </div>
  );
}

export function VoteHost({ code, hostKey, state, reload, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const labels = voteChoices(state).map((c) => c.text);
  const images = voteImages(code, state);
  const o = state.settings.options;
  const counts = state.summary?.counts || [];
  const voters = state.summary?.voters ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-header px-3 py-1.5 text-sm font-bold text-sun" data-testid="vote-voters">🗳 {voters} / {state.participants.filter((p) => !p.removed).length}</span>
        <button type="button" className={hostChip(o.showResults !== false)} onClick={async () => { await saveOptions(code, hostKey, state, { showResults: o.showResults === false }).catch(() => undefined); reload(); }} data-testid="vote-show-results">
          {o.showResults !== false ? "👁 " + tr("Live results shown", "النتائج المباشرة ظاهرة") : "🙈 " + tr("Results hidden", "النتائج مخفية")}
        </button>
        <span className="text-sm opacity-75">
          {tr(`${Math.max(1, Number(o.votesEach) || 1)} vote(s) each`, `${Math.max(1, Number(o.votesEach) || 1)} صوت لكل طالب`)}
          {o.anonymous === true && " · " + tr("Anonymous", "مجهول الهوية")}
        </span>
      </div>
      {state.ended && <Winner labels={labels} counts={counts} images={images} />}
      <div className="glass rounded-[28px] p-4 sm:p-6">
        <ResultBars labels={labels} counts={counts} images={images} big={big} highlight={state.ended ? winners(counts) : []} />
      </div>
      {!state.ended && <p className="text-sm opacity-70">{tr("Press End to close voting and celebrate the winner.", "اضغط إنهاء لإغلاق التصويت والاحتفال بالفائز.")}</p>}
    </div>
  );
}

/** Admin create form: options with optional pictures (kept in `_imgs` until the activity exists). */
export function VoteOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  const choices = Array.isArray(options.choices) ? (options.choices as VoteChoice[]) : [{ text: "" }, { text: "" }];
  const imgs = (options._imgs as Record<number, string>) || {};
  const [err, setErr] = useState("");
  const set = (patch: Record<string, unknown>) => setOptions({ showResults: true, votesEach: 1, ...options, choices, _imgs: imgs, ...patch });
  const input = "min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black/20";
  return (
    <div className="space-y-3 rounded-2xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm font-semibold">{tr("Options (pictures optional, ≤200 KB after shrinking)", "الخيارات (الصور اختيارية، ≤200 ك.ب بعد التصغير)")}</p>
      {choices.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-6 text-center text-sm font-bold opacity-60">{i + 1}</span>
          <input className={input} value={c.text} maxLength={120} dir="auto" placeholder={tr(`Option ${i + 1}`, `الخيار ${i + 1}`)} onChange={(e) => set({ choices: choices.map((x, j) => (j === i ? { text: e.target.value } : x)) })} data-testid="vote-choice-input" />
          {imgs[i] ? (
            <span className="inline-flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgs[i]} alt="" className="h-9 w-9 rounded-lg object-cover" />
              <button type="button" className="text-xs text-rose-600 underline" onClick={() => { const n = { ...imgs }; delete n[i]; set({ _imgs: n }); }}>{tr("Remove", "إزالة")}</button>
            </span>
          ) : (
            <label className="cursor-pointer rounded-full border border-black/10 px-3 py-1 text-xs font-semibold dark:border-white/15">
              🖼 {tr("Picture", "صورة")}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="vote-choice-image"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setErr("");
                    set({ _imgs: { ...imgs, [i]: await compressImage(f) } });
                  } catch {
                    setErr(tr("That picture couldn't be used.", "تعذر استخدام هذه الصورة."));
                  }
                }}
              />
            </label>
          )}
          {choices.length > 2 && (
            <button
              type="button"
              className="px-2 text-rose-600"
              aria-label={tr("Remove option", "حذف الخيار")}
              onClick={() => {
                const n: Record<number, string> = {};
                Object.entries(imgs).forEach(([k, v]) => { const j = Number(k); if (j < i) n[j] = v; else if (j > i) n[j - 1] = v; });
                set({ choices: choices.filter((_, j) => j !== i), _imgs: n });
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {choices.length < 12 && (
        <button type="button" className="rounded-full border border-dashed border-black/20 px-3 py-1 text-sm font-semibold dark:border-white/25" onClick={() => set({ choices: [...choices, { text: "" }] })} data-testid="vote-choice-add">
          + {tr("Add option", "إضافة خيار")}
        </button>
      )}
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="inline-flex items-center gap-2">
          {tr("Votes per student", "عدد الأصوات لكل طالب")}
          <select className="rounded-full border border-black/10 bg-white px-2 py-1 dark:border-white/15 dark:bg-black/30" value={Number(options.votesEach) || 1} onChange={(e) => set({ votesEach: Number(e.target.value) })} data-testid="vote-each">
            {Array.from({ length: Math.max(1, choices.length - 1) }, (_, k) => k + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={options.anonymous === true} onChange={(e) => set({ anonymous: e.target.checked })} data-testid="vote-anonymous" />{tr("Anonymous (hide who voted, even from the teacher)", "مجهول (إخفاء من صوّت حتى عن المعلم)")}</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={options.showResults !== false} onChange={(e) => set({ showResults: e.target.checked })} />{tr("Live results for students", "نتائج مباشرة للطلاب")}</label>
      </div>
    </div>
  );
}
