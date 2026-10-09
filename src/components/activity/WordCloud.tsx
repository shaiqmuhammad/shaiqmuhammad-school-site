"use client";

import { useState } from "react";
import { fieldCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { actErr, useTr } from "@/components/activity/common";
import { activityApi, type ActivityState, type Who } from "@/lib/activity";

const CLOUD_COLORS = ["text-sky-600 dark:text-sky-300", "text-amber-600 dark:text-amber-300", "text-emerald-600 dark:text-emerald-300", "text-rose-600 dark:text-rose-300", "text-violet-600 dark:text-violet-300", "text-teal-600 dark:text-teal-300", "text-navy dark:text-sun"];

export type CloudWord = { word: string; count: number; ids: string[] };

/** Groups word items case-insensitively (Arabic stays as typed). */
export function cloudWords(state: ActivityState): CloudWord[] {
  const map = new Map<string, CloudWord>();
  for (const i of state.items) {
    if (i.kind !== "word" || !i.data.word) continue;
    const key = i.data.word.toLocaleLowerCase();
    const w = map.get(key) || { word: i.data.word, count: 0, ids: [] };
    w.count++;
    w.ids.push(i.id);
    map.set(key, w);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

export function Cloud({ words, big = false, onDelete }: { words: CloudWord[]; big?: boolean; onDelete?: (w: CloudWord) => void }) {
  const { tr } = useTr();
  if (!words.length) return <p className="glass rounded-3xl px-6 py-12 text-center text-lg opacity-80" data-testid="cloud-empty">{tr("No words yet…", "لا توجد كلمات بعد…")}</p>;
  const max = words[0].count;
  // Biggest in the middle: interleave so the cloud looks balanced.
  const ordered: CloudWord[] = [];
  words.forEach((w, i) => (i % 2 ? ordered.push(w) : ordered.unshift(w)));
  return (
    <div className={`glass flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-[28px] px-4 py-8 ${big ? "min-h-[50vh]" : "min-h-56"}`} data-testid="word-cloud">
      {ordered.map((w) => {
        const k = max > 1 ? (w.count - 1) / (max - 1) : 1;
        const rem = (big ? 1.4 : 1.1) + k * (big ? 4.2 : 2.6);
        // Colour by popularity rank so neighbouring words always differ.
        const color = CLOUD_COLORS[words.indexOf(w) % CLOUD_COLORS.length];
        return (
          <span key={w.word} className={`group relative inline-flex items-center font-extrabold leading-tight ${color}`} style={{ fontSize: `${rem}rem` }} dir="auto" data-testid="cloud-word" data-count={w.count}>
            {w.word}
            {w.count > 1 && <sup className="ms-0.5 text-[0.35em] opacity-60">{w.count}</sup>}
            {onDelete && (
              <button type="button" className="ms-1 rounded-full bg-rose-600 px-1.5 text-xs leading-5 text-white opacity-25 transition group-hover:opacity-100 focus:opacity-100" onClick={() => onDelete(w)} aria-label={tr(`Delete ${w.word}`, `حذف ${w.word}`)} data-testid="cloud-delete">
                ✕
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function WordCloudStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const max = Number(state.settings.options.maxPerStudent) || 3;
  const mine = state.items.filter((i) => i.kind === "word" && i.mine).length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-5">
      {!closed && mine < max && (
        <form
          className="glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            setBusy(true);
            setMsg("");
            try {
              await activityApi.respond(code, who, { word: text.trim() });
              setText("");
              reload();
            } catch (err) {
              setMsg(actErr(err, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input className={fieldCls + " mt-0 flex-1 text-xl"} value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder={tr("1–3 words", "١–٣ كلمات")} dir="auto" autoComplete="off" data-testid="word-input" aria-label={tr("Your word", "كلمتك")} />
          <button type="submit" className={primaryBtn} disabled={busy || !text.trim() || words > 3} data-testid="word-submit">
            {tr("Send", "أرسل")}
          </button>
        </form>
      )}
      <p className="text-sm font-semibold opacity-80" data-testid="word-left">
        {mine >= max ? tr("Thanks! You've sent all your words.", "شكرًا! أرسلت كل كلماتك.") : tr(`${max - mine} of ${max} left`, `بقي ${max - mine} من ${max}`)}
        {words > 3 && <span className="ms-2 text-rose-600">{tr("Max 3 words", "٣ كلمات كحد أقصى")}</span>}
      </p>
      {msg && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert">{msg}</p>}
      <Cloud words={cloudWords(state)} />
    </div>
  );
}

export function WordCloudHost({ code, hostKey, state, reload, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const words = cloudWords(state);
  const total = state.items.filter((i) => i.kind === "word").length;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold opacity-80" data-testid="cloud-stats">
        {tr(`${total} entries · ${words.length} different words`, `${total} مشاركة · ${words.length} كلمة مختلفة`)}
      </p>
      <Cloud
        words={words}
        big={big}
        onDelete={async (w) => {
          for (const id of w.ids) await activityApi.moderate(code, hostKey, "delete", { id }).catch(() => undefined);
          reload();
        }}
      />
    </div>
  );
}

export function WordCloudOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold">
      {tr("Entries per student", "عدد المشاركات لكل طالب")}
      <select className="rounded-full border border-black/10 bg-white px-3 py-1.5 dark:border-white/15 dark:bg-black/30" value={Number(options.maxPerStudent) || 3} onChange={(e) => setOptions({ ...options, maxPerStudent: Number(e.target.value) })} data-testid="wc-max">
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
