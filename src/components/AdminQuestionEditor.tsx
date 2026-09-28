"use client";

import type { ReactNode } from "react";
import {
  countBlanks,
  emptyQuestion,
  optionLetter,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type QuestionType,
  type QuizQuestion,
} from "@/lib/quiz";

type Props = {
  q: QuizQuestion;
  idx: number;
  onChange: (q: QuizQuestion) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  setStatus: (s: string) => void;
};

const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";
const hint = "text-xs font-semibold uppercase text-muted";

function readImage(file: File, setStatus: (s: string) => void, done: (url: string) => void) {
  if (file.size > 1_500_000) {
    setStatus("Image too large (keep under ~1.5MB) or use a hosted URL.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result || ""));
  reader.readAsDataURL(file);
}

export function AdminQuestionEditor({ q, idx, onChange, onRemove, onMoveUp, setStatus }: Props) {
  const set = (patch: Partial<QuizQuestion>) => onChange({ ...q, ...patch });
  const correct = (q.correct as number[]).map(Number);
  const pairs = q.pairs || [];
  const blankCount = countBlanks(q.prompt);
  const blanks = Array.from({ length: blankCount }, (_, i) => q.blanks?.[i] || [""]);

  function changeType(type: QuestionType) {
    const fresh = emptyQuestion(type);
    onChange({ ...fresh, id: q.id, prompt: q.prompt, media: q.media, explanation: q.explanation, points: q.points });
  }

  function setOption(oi: number, value: string) {
    set({ options: q.options.map((o, j) => (j === oi ? value : o)) });
  }

  function removeOption(oi: number) {
    set({
      options: q.options.filter((_, j) => j !== oi),
      correct: correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)),
    });
  }

  function moveOption(oi: number, dir: -1 | 1) {
    const t = oi + dir;
    if (t < 0 || t >= q.options.length) return;
    const next = [...q.options];
    [next[oi], next[t]] = [next[t], next[oi]];
    set({ options: next });
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-card-border bg-accent-soft/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Question {idx + 1}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            className="rounded-lg border border-card-border bg-background px-2 py-1"
            value={q.type}
            onChange={(e) => changeType(e.target.value as QuestionType)}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            Marks
            <input
              type="number"
              min={1}
              className="w-16 rounded-lg border border-card-border bg-background px-2 py-1"
              value={q.points}
              onChange={(e) => set({ points: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <button type="button" disabled={!onMoveUp} className="text-muted disabled:opacity-40" onClick={onMoveUp}>
            ↑
          </button>
          <button type="button" className="text-red-600" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <Field label={q.type === "fill_blank" ? "Sentence — type ___ (three underscores) where each blank goes" : "Question"}>
        <textarea className={input + " min-h-16"} value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </Field>

      {q.type === "short_answer" && (
        <Field label="Accepted answers (one per line, not case-sensitive)">
          <textarea
            className={input + " min-h-16"}
            value={(q.correct as string[]).join("\n")}
            onChange={(e) => set({ correct: e.target.value.split("\n") })}
          />
        </Field>
      )}

      {q.type === "fill_blank" &&
        (blankCount === 0 ? (
          <p className="text-xs text-red-600">Add at least one ___ blank to the sentence, e.g. The Quran has ___ surahs.</p>
        ) : (
          blanks.map((b, bi) => (
            <Field key={bi} label={`Blank ${bi + 1} \u2014 accepted answers (one per line, not case-sensitive)`}>
              <textarea
                className={input + " min-h-14"}
                value={b.join("\n")}
                onChange={(e) => set({ blanks: blanks.map((x, j) => (j === bi ? e.target.value.split("\n") : x)) })}
              />
            </Field>
          ))
        ))}

      {q.type === "matching" && (
        <div className="space-y-2">
          <p className={hint}>Pairs — left item and its correct match (students see the right side shuffled)</p>
          {pairs.map((p, pi) => (
            <div key={pi} className="flex items-center gap-2">
              <input
                className={input + " mt-0"}
                placeholder="Left item"
                value={p.left}
                onChange={(e) => set({ pairs: pairs.map((x, j) => (j === pi ? { ...x, left: e.target.value } : x)) })}
              />
              <span className="text-muted">→</span>
              <input
                className={input + " mt-0"}
                placeholder="Correct match"
                value={p.right}
                onChange={(e) => set({ pairs: pairs.map((x, j) => (j === pi ? { ...x, right: e.target.value } : x)) })}
              />
              {pairs.length > 2 && (
                <button type="button" className="text-sm text-red-600" onClick={() => set({ pairs: pairs.filter((_, j) => j !== pi) })}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className={btnGhost} onClick={() => set({ pairs: [...pairs, { left: "", right: "" }] })}>
            + Pair
          </button>
          <p className="text-xs text-muted">Full marks only when every pair is matched correctly.</p>
        </div>
      )}

      {q.type === "ordering" && (
        <div className="space-y-2">
          <p className={hint}>Items in the CORRECT order (students see them shuffled)</p>
          {q.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="w-6 text-sm text-muted">{oi + 1}.</span>
              <input className={input + " mt-0"} value={opt} onChange={(e) => setOption(oi, e.target.value)} />
              <button type="button" disabled={oi === 0} className="text-muted disabled:opacity-40" onClick={() => moveOption(oi, -1)}>
                ↑
              </button>
              <button
                type="button"
                disabled={oi === q.options.length - 1}
                className="text-muted disabled:opacity-40"
                onClick={() => moveOption(oi, 1)}
              >
                ↓
              </button>
              {q.options.length > 2 && (
                <button type="button" className="text-sm text-red-600" onClick={() => removeOption(oi)}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className={btnGhost} onClick={() => set({ options: [...q.options, `Item ${q.options.length + 1}`] })}>
            + Item
          </button>
        </div>
      )}

      {q.type === "image_choice" && (
        <div className="space-y-2">
          <p className={hint}>Picture options — tick the correct picture (URL or upload)</p>
          {q.options.map((src, oi) => (
            <div key={oi} className="flex flex-wrap items-center gap-2 rounded-lg border border-card-border bg-background/60 p-2">
              <input
                type="radio"
                name={`correct-${q.id}`}
                checked={correct.includes(oi)}
                onChange={() => set({ correct: [oi] })}
                aria-label={`Picture ${optionLetter(oi)} is correct`}
              />
              <span className="text-sm font-medium">{optionLetter(oi)}</span>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-14 w-14 rounded border border-card-border bg-white object-contain" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-card-border text-xs text-muted">
                  none
                </span>
              )}
              <input
                className={input + " mt-0 min-w-0 flex-1"}
                placeholder="https://… or data:image/…"
                value={src}
                onChange={(e) => setOption(oi, e.target.value)}
              />
              <label className={btnGhost + " cursor-pointer"}>
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readImage(f, setStatus, (url) => setOption(oi, url));
                    e.target.value = "";
                  }}
                />
              </label>
              {q.options.length > 2 && (
                <button type="button" className="text-sm text-red-600" onClick={() => removeOption(oi)}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className={btnGhost} onClick={() => set({ options: [...q.options, ""] })}>
            + Picture
          </button>
        </div>
      )}

      {(q.type === "multiple_choice" || q.type === "true_false" || q.type === "multi_select") && (
        <div className="space-y-2">
          <p className={hint}>
            Options — tick the correct {q.type === "multi_select" ? "answers (students see “Select all that apply”)" : "answer"}
          </p>
          {q.options.map((opt, oi) => {
            const isCorrect = correct.includes(oi);
            return (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type={q.type === "multi_select" ? "checkbox" : "radio"}
                  name={`correct-${q.id}`}
                  checked={isCorrect}
                  onChange={() =>
                    set({
                      correct:
                        q.type === "multi_select" ? (isCorrect ? correct.filter((c) => c !== oi) : [...correct, oi]) : [oi],
                    })
                  }
                />
                <input
                  className={input + " mt-0"}
                  value={opt}
                  disabled={q.type === "true_false"}
                  onChange={(e) => setOption(oi, e.target.value)}
                />
                {q.type !== "true_false" && q.options.length > 2 && (
                  <button type="button" className="text-sm text-red-600" onClick={() => removeOption(oi)}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {q.type !== "true_false" && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => set({ options: [...q.options, `Option ${optionLetter(q.options.length)}`] })}
            >
              + Option
            </button>
          )}
        </div>
      )}

      <details className="rounded-lg border border-card-border bg-background/60 p-3" open={Boolean(q.media)}>
        <summary className="cursor-pointer text-sm font-medium">Media (optional)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label="Picture URL or data:image/…">
            <input className={input} value={q.media?.imageUrl || ""} onChange={(e) => set({ media: { ...q.media, imageUrl: e.target.value } })} />
          </Field>
          <Field label="Audio URL (mp3/ogg)">
            <input className={input} value={q.media?.audioUrl || ""} onChange={(e) => set({ media: { ...q.media, audioUrl: e.target.value } })} />
          </Field>
          <Field label="Video file URL (mp4/webm)">
            <input className={input} value={q.media?.videoUrl || ""} onChange={(e) => set({ media: { ...q.media, videoUrl: e.target.value } })} />
          </Field>
          <Field label="YouTube link">
            <input className={input} value={q.media?.youtubeUrl || ""} onChange={(e) => set({ media: { ...q.media, youtubeUrl: e.target.value } })} />
          </Field>
        </div>
      </details>

      <Field label="Explanation (optional — shown on the review screen after submitting)">
        <textarea
          className={input + " min-h-14"}
          value={q.explanation || ""}
          onChange={(e) => set({ explanation: e.target.value })}
          placeholder="Why is this the right answer?"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
