"use client";

import { optionLetter, splitBlanks, type QuizQuestion } from "@/lib/quiz";

type Props = {
  q: QuizQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Display order of the right-hand matching items (shuffled when the quiz starts) */
  rightOrder?: number[];
};

const optionCls =
  "flex cursor-pointer items-center gap-3 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-accent-soft/60";
const inputCls =
  "rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function QuizQuestionInput({ q, value, onChange, rightOrder }: Props) {
  if (q.type === "multiple_choice" || q.type === "true_false") {
    return (
      <div className="space-y-2">
        {q.options.map((opt, idx) => (
          <label key={idx} className={optionCls}>
            <input type="radio" name={q.id} checked={value === idx} onChange={() => onChange(idx)} />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (q.type === "multi_select") {
    const cur = Array.isArray(value) ? (value as number[]) : [];
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">Select all that apply</p>
        {q.options.map((opt, idx) => (
          <label key={idx} className={optionCls}>
            <input
              type="checkbox"
              checked={cur.includes(idx)}
              onChange={() => onChange(cur.includes(idx) ? cur.filter((n) => n !== idx) : [...cur, idx])}
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (q.type === "short_answer") {
    return (
      <input
        className={inputCls + " w-full"}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer"
      />
    );
  }

  if (q.type === "image_choice") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">Tap the correct picture.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {q.options.map((src, idx) => {
            const selected = value === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onChange(idx)}
                aria-pressed={selected}
                className={`overflow-hidden rounded-xl border-2 bg-background text-left transition ${
                  selected ? "border-primary ring-2 ring-primary/30" : "border-card-border hover:border-primary/40"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Picture ${optionLetter(idx)}`} className="aspect-square w-full object-contain p-2" />
                <span className="block border-t border-card-border px-2 py-1 text-xs font-medium">
                  {selected ? "\u2713 " : ""}Picture {optionLetter(idx)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === "fill_blank") {
    const parts = splitBlanks(q.prompt);
    const cur = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">Type the missing word(s) in each box.</p>
        <p className="text-base leading-[2.75rem]">
          {parts.map((part, i) => (
            <span key={i}>
              <span className="whitespace-pre-wrap">{part}</span>
              {i < parts.length - 1 && (
                <input
                  aria-label={`Blank ${i + 1}`}
                  className={inputCls + " mx-1 inline-block w-40 py-1"}
                  value={cur[i] ?? ""}
                  onChange={(e) => {
                    const next = Array.from({ length: parts.length - 1 }, (_, j) => cur[j] ?? "");
                    next[i] = e.target.value;
                    onChange(next);
                  }}
                />
              )}
            </span>
          ))}
        </p>
      </div>
    );
  }

  if (q.type === "matching") {
    const pairs = q.pairs || [];
    const order = rightOrder && rightOrder.length === pairs.length ? rightOrder : pairs.map((_, i) => i);
    const cur = Array.isArray(value) ? (value as number[]) : pairs.map(() => -1);
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">Choose the matching item for each one on the left.</p>
        {pairs.map((p, i) => (
          <div key={i} className="grid items-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm sm:grid-cols-2">
            <span className="font-medium">{p.left}</span>
            <select
              aria-label={`Match for ${p.left}`}
              className={inputCls}
              value={cur[i] ?? -1}
              onChange={(e) => onChange(pairs.map((_, j) => (j === i ? Number(e.target.value) : cur[j] ?? -1)))}
            >
              <option value={-1}>Choose…</option>
              {order.map((ri) => (
                <option key={ri} value={ri}>
                  {pairs[ri].right}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  }

  if (q.type === "ordering") {
    const cur = Array.isArray(value) ? (value as number[]) : q.options.map((_, i) => i);
    const moveTo = (from: number, to: number) => {
      if (to < 0 || to >= cur.length || from === to) return;
      const next = [...cur];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onChange(next);
    };
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">Put the items in the correct order (drag them, or use the arrows).</p>
        <ol className="space-y-2">
          {cur.map((idx, pos) => (
            <li
              key={idx}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(pos))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (!Number.isNaN(from)) moveTo(from, pos);
              }}
              className="flex cursor-grab items-center gap-3 rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              <span className="w-6 text-muted">{pos + 1}.</span>
              <span className="flex-1">{q.options[idx]}</span>
              <button
                type="button"
                aria-label="Move up"
                disabled={pos === 0}
                onClick={() => moveTo(pos, pos - 1)}
                className="rounded border border-card-border px-2 py-0.5 disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={pos === cur.length - 1}
                onClick={() => moveTo(pos, pos + 1)}
                className="rounded border border-card-border px-2 py-0.5 disabled:opacity-40"
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return null;
}
