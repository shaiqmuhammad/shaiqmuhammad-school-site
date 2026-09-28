"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { slugify } from "@/lib/content";
import { downloadJson, getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import {
  emptyQuestion, emptyQuiz, GITHUB_QUIZ_RESULTS_PATH, GITHUB_QUIZZES_PATH, loadLocalResults,
  normalizeQuiz, normalizeQuizzes, normalizeResults,
  quizMaxScore, type QuestionType, type Quiz, type QuizQuestion, type QuizResultsData, type QuizzesData,
} from "@/lib/quiz";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  data: QuizzesData;
  setData: React.Dispatch<React.SetStateAction<QuizzesData>>;
  results: QuizResultsData;
  setResults: React.Dispatch<React.SetStateAction<QuizResultsData>>;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
  multi_select: "Multi-select",
};

const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

export default function AdminQuizzes({ setStatus, onNeedToken, data, setData, results, setResults }: Props) {
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...data.quizzes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.quizzes]);

  function saveQuiz(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const slug = editing.slug.trim() || slugify(editing.title);
    if (!editing.title.trim() || !slug) { setStatus("Quiz title and slug required."); return; }
    if (!editing.questions.length) { setStatus("Add at least one question."); return; }
    const bad = editing.questions.findIndex((q) => !q.prompt.trim());
    if (bad >= 0) { setStatus(`Question ${bad + 1} needs a prompt.`); return; }
    const next = normalizeQuiz({ ...editing, slug, title: editing.title.trim(), updatedAt: new Date().toISOString() });
    setData((prev) => ({ quizzes: prev.quizzes.some((q) => q.id === next.id) ? prev.quizzes.map((q) => (q.id === next.id ? next : q)) : [...prev.quizzes, next] }));
    setEditing(null);
    setStatus(`Saved quiz "${next.title}" locally. Click "Publish quizzes" to make it live.`);
  }

  function updateQ(idx: number, patch: Partial<QuizQuestion>) {
    if (!editing) return;
    setEditing({ ...editing, questions: editing.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)) });
  }

  function changeType(idx: number, type: QuestionType) {
    const fresh = emptyQuestion(type);
    const cur = editing!.questions[idx];
    updateQ(idx, { type, options: fresh.options, correct: fresh.correct, prompt: cur.prompt, media: cur.media });
  }

  async function publish(path: string, payload: unknown, label: string) {
    const token = getStoredGithubToken();
    if (!token) { setStatus("No GitHub token. Open Settings."); onNeedToken(); return; }
    setBusy(true); setStatus(`Publishing ${label}…`);
    const r = await publishJsonToGithub(path, payload, token, `chore(quiz): update ${label} via admin`);
    setBusy(false);
    setStatus(r.ok ? `Published ${path}. Site rebuilds in ~1–2 min. ${r.htmlUrl || ""}` : r.error);
  }

  function importLocalResults() {
    const local = loadLocalResults();
    if (!local.results.length) { setStatus("No local quiz results in this browser."); return; }
    const ids = new Set(results.results.map((r) => r.id));
    const merged = [...results.results, ...local.results.filter((r) => !ids.has(r.id))];
    setResults({ results: merged });
    setStatus(`Merged ${merged.length - results.results.length} local result(s). Review then Publish results.`);
  }

  function importResultsFile(file: File) {
    file.text().then((txt) => {
      try {
        const incoming = normalizeResults(JSON.parse(txt));
        const ids = new Set(results.results.map((r) => r.id));
        const add = incoming.results.filter((r) => !ids.has(r.id));
        setResults({ results: [...results.results, ...add] });
        setStatus(`Imported ${add.length} result(s) from file.`);
      } catch { setStatus("Invalid results JSON."); }
    });
  }

  const quizTitle = (id: string) => data.quizzes.find((q) => q.id === id)?.title || id;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-xl font-semibold">Quizzes</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeQuizzes(data), "quizzes.json")}>Download quizzes.json</button>
          <button type="button" disabled={busy} className={btn} onClick={() => publish(GITHUB_QUIZZES_PATH, normalizeQuizzes(data), "quizzes.json")}>Publish quizzes</button>
          <button type="button" className={btn} onClick={() => setEditing(emptyQuiz())}>+ New quiz</button>
        </div>
      </div>

      {editing && (
        <form onSubmit={saveQuiz} className="space-y-4 rounded-2xl border border-card-border bg-card p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><input className={input} value={editing.title} onChange={(e) => { const title = e.target.value; setEditing({ ...editing, title, slug: editing.slug || slugify(title) }); }} required /></Field>
            <Field label="Slug (URL)"><input className={input} value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} required /></Field>
          </div>
          <Field label="Description"><textarea className={input + " min-h-16"} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          <Field label="Card image (URL or data:image/… — shown on Home & Quizzes list)">
            <input className={input} value={editing.cardImage || ""} onChange={(e) => setEditing({ ...editing, cardImage: e.target.value })} placeholder="https://… or upload below" />
          </Field>
          <label className="block text-sm font-medium">
            Or upload card image
            <input type="file" accept="image/*" className="mt-1.5 block w-full text-sm" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1_500_000) { setStatus("Image too large (keep under ~1.5MB) or use a hosted URL."); return; }
              const reader = new FileReader();
              reader.onload = () => setEditing({ ...editing, cardImage: String(reader.result || "") });
              reader.readAsDataURL(file);
            }} />
          </label>
          {editing.cardImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={editing.cardImage} alt="" className="max-h-36 rounded-xl border border-card-border object-cover" />
          ) : null}
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Time limit (minutes, 0 = none)"><input type="number" min={0} className={input + " w-32"} value={editing.timeLimitMinutes} onChange={(e) => setEditing({ ...editing, timeLimitMinutes: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /> Published</label>
            <p className="pb-2 text-xs text-muted">Total marks: {quizMaxScore(editing)}</p>
          </div>

          <div className="space-y-4">
            {editing.questions.map((q, idx) => (
              <div key={q.id} className="space-y-3 rounded-xl border border-dashed border-card-border bg-accent-soft/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Question {idx + 1}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select className="rounded-lg border border-card-border bg-background px-2 py-1" value={q.type} onChange={(e) => changeType(idx, e.target.value as QuestionType)}>
                      {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                    <label className="flex items-center gap-1">Marks <input type="number" min={1} className="w-16 rounded-lg border border-card-border bg-background px-2 py-1" value={q.points} onChange={(e) => updateQ(idx, { points: Math.max(1, Number(e.target.value) || 1) })} /></label>
                    <button type="button" disabled={idx === 0} className="text-muted" onClick={() => { const qs = [...editing.questions]; [qs[idx - 1], qs[idx]] = [qs[idx], qs[idx - 1]]; setEditing({ ...editing, questions: qs }); }}>↑</button>
                    <button type="button" className="text-red-600" onClick={() => setEditing({ ...editing, questions: editing.questions.filter((_, i) => i !== idx) })}>Remove</button>
                  </div>
                </div>
                <Field label="Question"><textarea className={input + " min-h-16"} value={q.prompt} onChange={(e) => updateQ(idx, { prompt: e.target.value })} /></Field>

                {q.type === "short_answer" ? (
                  <Field label="Accepted answers (one per line, not case-sensitive)">
                    <textarea className={input + " min-h-16"} value={(q.correct as string[]).join("\n")} onChange={(e) => updateQ(idx, { correct: e.target.value.split("\n") })} />
                  </Field>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted">Options — tick the correct {q.type === "multi_select" ? "answers" : "answer"}</p>
                    {q.options.map((opt, oi) => {
                      const correct = (q.correct as number[]).map(Number);
                      const isCorrect = correct.includes(oi);
                      return (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type={q.type === "multi_select" ? "checkbox" : "radio"}
                            name={`correct-${q.id}`}
                            checked={isCorrect}
                            onChange={() => updateQ(idx, { correct: q.type === "multi_select" ? (isCorrect ? correct.filter((c) => c !== oi) : [...correct, oi]) : [oi] })}
                          />
                          <input className={input + " mt-0"} value={opt} disabled={q.type === "true_false"} onChange={(e) => updateQ(idx, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })} />
                          {q.type !== "true_false" && q.options.length > 2 && (
                            <button type="button" className="text-sm text-red-600" onClick={() => updateQ(idx, { options: q.options.filter((_, j) => j !== oi), correct: correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)) })}>✕</button>
                          )}
                        </div>
                      );
                    })}
                    {q.type !== "true_false" && <button type="button" className={btnGhost} onClick={() => updateQ(idx, { options: [...q.options, `Option ${String.fromCharCode(65 + q.options.length)}`] })}>+ Option</button>}
                  </div>
                )}

                <details className="rounded-lg border border-card-border bg-background/60 p-3" open={Boolean(q.media)}>
                  <summary className="cursor-pointer text-sm font-medium">Media (optional)</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Picture URL or data:image/…"><input className={input} value={q.media?.imageUrl || ""} onChange={(e) => updateQ(idx, { media: { ...q.media, imageUrl: e.target.value } })} /></Field>
                    <Field label="Audio URL (mp3/ogg)"><input className={input} value={q.media?.audioUrl || ""} onChange={(e) => updateQ(idx, { media: { ...q.media, audioUrl: e.target.value } })} /></Field>
                    <Field label="Video file URL (mp4/webm)"><input className={input} value={q.media?.videoUrl || ""} onChange={(e) => updateQ(idx, { media: { ...q.media, videoUrl: e.target.value } })} /></Field>
                    <Field label="YouTube link"><input className={input} value={q.media?.youtubeUrl || ""} onChange={(e) => updateQ(idx, { media: { ...q.media, youtubeUrl: e.target.value } })} /></Field>
                  </div>
                </details>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                <button key={t} type="button" className={btnGhost} onClick={() => setEditing({ ...editing, questions: [...editing.questions, emptyQuestion(t)] })}>+ {TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2"><button type="submit" className={btn}>Save quiz</button><button type="button" className="text-sm text-muted" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      )}

      <ul className="divide-y divide-card-border rounded-2xl border border-card-border bg-card">
        {sorted.length === 0 && <li className="px-4 py-3 text-sm text-muted">No quizzes yet.</li>}
        {sorted.map((quiz) => (
          <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div><p className="font-medium">{quiz.title}</p><p className="text-xs text-muted">/quizzes/{quiz.slug} · {quiz.questions.length} Qs · {quiz.timeLimitMinutes || "no"} min · {quiz.published ? "Published" : "Draft"}</p></div>
            <div className="flex gap-2">
              <button type="button" className="text-sm text-primary" onClick={() => setEditing(JSON.parse(JSON.stringify(quiz)) as Quiz)}>Edit</button>
              <button type="button" className="text-sm text-red-600" onClick={() => { if (confirm(`Delete "${quiz.title}"?`)) setData((prev) => ({ quizzes: prev.quizzes.filter((q) => q.id !== quiz.id) })); }}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Results and positions</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} onClick={importLocalResults}>Import local results</button>
            <label className={btnGhost + " cursor-pointer"}>Import JSON file<input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importResultsFile(f); e.target.value = ""; }} /></label>
            <button type="button" className={btnGhost} onClick={() => downloadJson(results, "quiz-results.json")}>Download</button>
            <button type="button" disabled={busy} className={btn} onClick={() => publish(GITHUB_QUIZ_RESULTS_PATH, normalizeResults(results), "quiz-results.json")}>Publish results</button>
          </div>
        </div>
        <p className="text-xs text-muted">
          The site is static, so student attempts are saved in each student’s own browser. To rank the class: collect results (Import local results works for attempts made on this device, e.g. a classroom computer; students can also send you their result), review, then Publish results. Certificates compare each new attempt against published results to show a provisional position.
        </p>
        {results.results.length === 0 ? <p className="text-sm text-muted">No published results yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-1">Quiz</th><th>Name</th><th>Score</th><th>Date</th><th /></tr></thead>
              <tbody>
                {[...results.results].sort((a, b) => a.quizId.localeCompare(b.quizId) || b.score - a.score).map((r) => (
                  <tr key={r.id} className="border-t border-card-border">
                    <td className="py-1.5">{quizTitle(r.quizId)}</td><td>{r.name}</td><td>{r.score}/{r.maxScore} ({r.percentage}%)</td>
                    <td>{new Date(r.finishedAt).toLocaleDateString("en-GB")}</td>
                    <td><button type="button" className="text-red-600" onClick={() => setResults({ results: results.results.filter((x) => x.id !== r.id) })}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
