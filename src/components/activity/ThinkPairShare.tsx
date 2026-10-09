"use client";

import { useState } from "react";
import { fieldCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { WallBoard, WallComposer } from "@/components/activity/WallBoard";
import { actErr, hostChip, saveOptions, useTr, type Tr } from "@/components/activity/common";
import { shuffled } from "@/components/activity/ClassNames";
import { activityApi, type ActivityState, type Who } from "@/lib/activity";

export type Stage = "think" | "pair" | "share";
const STAGES: Stage[] = ["think", "pair", "share"];
const DEFAULT_MIN: Record<Stage, number> = { think: 2, pair: 3, share: 5 };

export const tpsStage = (state: ActivityState): Stage => (STAGES.includes(state.settings.options.stage as Stage) ? (state.settings.options.stage as Stage) : "think");
const minutes = (state: ActivityState, s: Stage) => Number((state.settings.options.minutes as Record<string, number> | undefined)?.[s]) || DEFAULT_MIN[s];
const stageLabel = (s: Stage, tr: Tr) => (s === "think" ? tr("Think", "فكّر") : s === "pair" ? tr("Pair", "زاوج") : tr("Share", "شارك"));
const STAGE_ICON: Record<Stage, string> = { think: "💭", pair: "🤝", share: "📣" };

/** Random pairs from the active participants (an odd one out joins the last pair as a trio). */
export function makePairs(ids: string[]): string[][] {
  const s = shuffled(ids);
  const out: string[][] = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push([s[i], s[i + 1]]);
  if (s.length % 2) {
    if (out.length) out[out.length - 1].push(s[s.length - 1]);
    else out.push([s[s.length - 1]]);
  }
  return out;
}

function StageBar({ stage, tr }: { stage: Stage; tr: Tr }) {
  return (
    <ol className="flex gap-2" data-testid="tps-stages">
      {STAGES.map((s, i) => {
        const on = s === stage;
        const done = STAGES.indexOf(stage) > i;
        return (
          <li key={s} className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-base font-bold sm:text-lg ${on ? "bg-sun text-navy shadow" : done ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300" : "glass opacity-70"}`} aria-current={on ? "step" : undefined} data-testid={on ? "tps-stage-current" : undefined} data-stage={s}>
            <span aria-hidden>{done ? "✓" : STAGE_ICON[s]}</span>
            {stageLabel(s, tr)}
          </li>
        );
      })}
    </ol>
  );
}

const pairsOf = (state: ActivityState): string[][] => (Array.isArray(state.settings.options.pairs) ? (state.settings.options.pairs as string[][]) : []);

export function TpsStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const stage = tpsStage(state);
  const me = state.me.id;
  const myNote = state.items.find((i) => i.kind === "think" && i.mine);
  const [text, setText] = useState(myNote?.data.text || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const group = pairsOf(state).find((g) => g.includes(me)) || [];
  const partners = group.filter((id) => id !== me);
  const nameOf = (id: string) => state.participants.find((p) => p.id === id)?.name || tr("Classmate", "زميل");

  return (
    <div className="space-y-5">
      <StageBar stage={stage} tr={tr} />
      {stage === "think" && (
        <form
          className="glass space-y-3 rounded-3xl p-4 sm:p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            setBusy(true);
            setMsg("");
            try {
              await activityApi.respond(code, who, { text: text.trim() });
              setMsg(tr("Saved ✓", "تم الحفظ ✓"));
              reload();
            } catch (err) {
              setMsg(actErr(err, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-lg font-bold">💭 {tr("Think on your own and jot down your idea. Only you, your partner and your teacher will see it.", "فكّر وحدك واكتب فكرتك. لن يراها إلا أنت وزميلك ومعلمك.")}</p>
          <textarea className={fieldCls + " min-h-32 text-lg"} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} disabled={closed} dir="auto" data-testid="tps-think-input" />
          {!closed && (
            <button type="submit" className={primaryBtn} disabled={busy || !text.trim()} data-testid="tps-think-save">
              {myNote ? tr("Update my idea", "تحديث فكرتي") : tr("Save my idea", "احفظ فكرتي")}
            </button>
          )}
          {msg && <p className="text-sm font-semibold" role="status" data-testid="tps-msg">{msg}</p>}
        </form>
      )}
      {stage === "pair" && (
        <section className="glass space-y-4 rounded-3xl p-4 sm:p-5" data-testid="tps-pair">
          {partners.length ? (
            <>
              <p className="text-2xl font-bold">
                🤝 {tr("Your partner:", "زميلك:")} <span className="text-teal-700 dark:text-teal-300" dir="auto" data-testid="tps-partner">{partners.map(nameOf).join(" & ")}</span>
              </p>
              <p className="opacity-80">{tr("Find them, compare your ideas and agree on your best one.", "ابحث عنه، قارنا أفكاركما واتفقا على أفضل فكرة.")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.map((id) => {
                  const note = state.items.find((i) => i.kind === "think" && i.pid === id);
                  return (
                    <div key={id} className="rounded-2xl bg-white/85 p-3 dark:bg-white/5" data-testid="tps-note">
                      <p className="text-sm font-bold opacity-70" dir="auto">{id === me ? tr("You", "أنت") : nameOf(id)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-lg" dir="auto">{note?.data.text || <span className="opacity-50">{tr("(no idea saved)", "(لم تحفظ فكرة)")}</span>}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-lg font-semibold">{tr("Your teacher is making pairs — wait a moment…", "المعلم يكوّن الأزواج — انتظر قليلًا…")}</p>
          )}
        </section>
      )}
      {stage === "share" && (
        <>
          {!closed && <WallComposer code={code} who={who} state={state} onPosted={reload} kind="share" stage="share" />}
          <WallBoard code={code} who={who} state={state} onChanged={reload} />
        </>
      )}
    </div>
  );
}

export function TpsHost({ code, hostKey, state, reload, big, now }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean; now: number }) {
  const { tr } = useTr();
  const stage = tpsStage(state);
  const active = state.participants.filter((p) => !p.removed);
  const pairs = pairsOf(state);
  const notes = state.items.filter((i) => i.kind === "think");
  const nameOf = (id: string) => state.participants.find((p) => p.id === id)?.name || "?";

  const go = async (s: Stage) => {
    const patch: Record<string, unknown> = { stage: s };
    if (s === "pair" && (!pairs.length || pairs.flat().length !== active.length)) patch.pairs = makePairs(active.map((p) => p.id));
    await saveOptions(code, hostKey, state, patch, { timerEnd: now + minutes(state, s) * 60000, locked: false }).catch(() => undefined);
    reload();
  };
  const next = STAGES[STAGES.indexOf(stage) + 1];

  return (
    <div className="space-y-4">
      <StageBar stage={stage} tr={tr} />
      <div className="flex flex-wrap items-center gap-2">
        {STAGES.map((s) => (
          <button key={s} type="button" className={hostChip(s === stage)} onClick={() => go(s)} data-testid={`tps-go-${s}`}>
            {STAGE_ICON[s]} {stageLabel(s, tr)} · {minutes(state, s)}′
          </button>
        ))}
        {next && (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-emerald-700" onClick={() => go(next)} data-testid="tps-next">
            {tr("Next:", "التالي:")} {stageLabel(next, tr)} →
          </button>
        )}
        <button type="button" className={hostChip(false)} onClick={async () => { await saveOptions(code, hostKey, state, { pairs: makePairs(active.map((p) => p.id)) }).catch(() => undefined); reload(); }} data-testid="tps-repair">
          🔀 {tr("New random pairs", "أزواج عشوائية جديدة")}
        </button>
      </div>

      {stage === "think" && (
        <section className="glass rounded-[28px] p-6 text-center">
          <p className="text-6xl font-black tabular-nums" data-testid="tps-notes-count">{new Set(notes.map((n) => n.pid)).size} / {active.length}</p>
          <p className="mt-2 text-lg font-semibold opacity-80">{tr("students have saved an idea", "طالبًا حفظوا فكرة")}</p>
        </section>
      )}
      {stage === "pair" && (
        <div className={`grid gap-3 sm:grid-cols-2 ${big ? "xl:grid-cols-4" : "lg:grid-cols-3"}`} data-testid="tps-pairs">
          {pairs.length === 0 && <p className="opacity-70">{tr("No pairs yet.", "لا توجد أزواج بعد.")}</p>}
          {pairs.map((g, k) => (
            <div key={k} className="glass rounded-3xl p-4" data-testid="tps-pair-card">
              <p className="text-sm font-bold opacity-60">{tr(`Pair ${k + 1}`, `الزوج ${k + 1}`)}</p>
              {g.map((id) => (
                <div key={id} className="mt-2">
                  <p className="text-lg font-bold" dir="auto">{nameOf(id)}</p>
                  <p className="whitespace-pre-wrap text-sm opacity-80" dir="auto">{notes.find((n) => n.pid === id)?.data.text || "—"}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {stage === "share" && <WallBoard code={code} who={{ hostKey }} state={state} onChanged={reload} big={big} />}
    </div>
  );
}

export function TpsOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  const m = { ...DEFAULT_MIN, ...((options.minutes as Record<string, number>) || {}) };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
      {tr("Stage timers (minutes):", "مؤقتات المراحل (دقائق):")}
      {STAGES.map((s) => (
        <label key={s} className="inline-flex items-center gap-1">
          {STAGE_ICON[s]} {stageLabel(s, tr)}
          <select className="rounded-full border border-black/10 bg-white px-2 py-1 dark:border-white/15 dark:bg-black/30" value={m[s]} onChange={(e) => setOptions({ ...options, stage: "think", minutes: { ...m, [s]: Number(e.target.value) } })} data-testid={`tps-min-${s}`}>
            {[1, 2, 3, 4, 5, 7, 10, 15].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
