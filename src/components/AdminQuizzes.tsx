"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { slugify } from "@/lib/content";
import { HOST_DRAFT_KEY } from "@/lib/groupSession";
import { useI18n } from "@/lib/i18n";
import { downloadJson, getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import { AdminQuestionEditor } from "@/components/AdminQuestionEditor";
import {
  emptyQuestion, emptyQuiz, GITHUB_QUIZ_RESULTS_PATH, GITHUB_QUIZZES_PATH, loadLocalResults,
  isSowSeed, normalizeQuiz, normalizeResults, quizzesForPublish, QUESTION_TYPE_LABELS, QUESTION_TYPES, questionProblem,
  quizMaxScore, type Quiz, type QuizQuestion, type QuizResultsData, type QuizzesData,
} from "@/lib/quiz";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  data: QuizzesData;
  setData: React.Dispatch<React.SetStateAction<QuizzesData>>;
  results: QuizResultsData;
  setResults: React.Dispatch<React.SetStateAction<QuizResultsData>>;
};

const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

export default function AdminQuizzes({ setStatus, onNeedToken, data, setData, results, setResults }: Props) {
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();
  const router = useRouter();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const sorted = useMemo(() => [...data.quizzes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.quizzes]);

  function saveQuiz(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const slug = editing.slug.trim() || slugify(editing.title);
    if (!editing.title.trim() || !slug) { setStatus("Assessment title and slug required."); return; }
    if (!editing.questions.length) { setStatus("Add at least one question."); return; }
    for (let i = 0; i < editing.questions.length; i++) {
      const problem = questionProblem(editing.questions[i]);
      if (problem) { setStatus(`Question ${i + 1} ${problem}.`); return; }
    }
    const next = normalizeQuiz({ ...editing, slug, title: editing.title.trim(), updatedAt: new Date().toISOString() });
    setData((prev) => ({ quizzes: prev.quizzes.some((q) => q.id === next.id) ? prev.quizzes.map((q) => (q.id === next.id ? next : q)) : [...prev.quizzes, next] }));
    setEditing(null);
    setStatus(`Saved assessment "${next.title}" locally. Click "Publish assessments" to make it live.`);
  }

  function setQuestion(idx: number, q: QuizQuestion) {
    if (!editing) return;
    setEditing({ ...editing, questions: editing.questions.map((x, i) => (i === idx ? q : x)) });
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
    if (!local.results.length) { setStatus("No local assessment results in this browser."); return; }
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

  function toggleEnabled(quiz: Quiz) {
    const next = { ...quiz, published: !quiz.published, updatedAt: new Date().toISOString() };
    setData((prev) => ({ quizzes: prev.quizzes.map((q) => (q.id === quiz.id ? next : q)) }));
    setStatus(`"${quiz.title}" ${next.published ? "enabled" : "disabled"} locally. Click "Publish assessments" to apply it on the live site.`);
  }

  function startGroup(quiz: Quiz) {
    if (editing && !confirm("Leave the editor? Unsaved changes to the open assessment will be lost.")) return;
    try {
      sessionStorage.setItem(HOST_DRAFT_KEY, JSON.stringify(quiz));
    } catch {
      // ignore — host screen falls back to published assessments
    }
    // Same tab keeps the admin session (sessionStorage is per tab).
    router.push(`/assessments/host?quiz=${encodeURIComponent(quiz.slug)}`);
  }

  const quizTitle = (id: string) => data.quizzes.find((q) => q.id === id)?.title || id;
  /** Position within the same assessment by percentage (ties share a place: 1st, 1st, 3rd). */
  const rankOf = (r: QuizResultsData["results"][number]) => {
    const better = results.results.filter((x) => x.quizId === r.quizId && x.percentage > r.percentage).length;
    const tied = results.results.filter((x) => x.quizId === r.quizId && x.percentage === r.percentage).length > 1;
    const n = better + 1;
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return `${n}${suffix}${tied ? " (tie)" : ""}`;
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-xl font-semibold">{tr("Assessments", "التقييمات")}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => downloadJson(quizzesForPublish(data), "quizzes.json")}>{tr("Download quizzes.json", "تنزيل quizzes.json")}</button>
          <button type="button" disabled={busy} className={btn} onClick={() => publish(GITHUB_QUIZZES_PATH, quizzesForPublish(data), "quizzes.json")}>{tr("Publish assessments", "نشر التقييمات")}</button>
          <button type="button" className={btn} onClick={() => setEditing({ ...emptyQuiz(), timeLimitMinutes: 5 })}>{tr("+ New assessment", "+ تقييم جديد")}</button>
        </div>
      </div>

      {editing && (
        <form onSubmit={saveQuiz} className="space-y-4 rounded-2xl bg-card ring-1 ring-card-border/50 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><input className={input} value={editing.title} onChange={(e) => { const title = e.target.value; setEditing({ ...editing, title, slug: editing.slug || slugify(title) }); }} required /></Field>
            <Field label="Slug (URL)"><input className={input} value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} required /></Field>
          </div>
          <Field label="Description"><textarea className={input + " min-h-16"} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Arabic title (optional)"><input dir="rtl" className={input} value={editing.titleAr || ""} onChange={(e) => setEditing({ ...editing, titleAr: e.target.value })} placeholder="العنوان بالعربية" /></Field>
            <Field label="Arabic description (optional)"><input dir="rtl" className={input} value={editing.descriptionAr || ""} onChange={(e) => setEditing({ ...editing, descriptionAr: e.target.value })} placeholder="الوصف بالعربية" /></Field>
          </div>
          <Field label="Year group (optional — used for the Year filter on the Assessments page)">
            <select className={input + " w-40"} value={editing.year ?? ""} onChange={(e) => setEditing({ ...editing, year: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
          <Field label="Card image (URL or data:image/… — shown on Home & Assessments list)">
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
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /> <span className="font-medium">Enabled for students</span> <span className="text-xs text-muted">(off = hidden from the site)</span></label>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={editing.showAnswers} onChange={(e) => setEditing({ ...editing, showAnswers: e.target.checked })} /> Show answers at end</label>
            <p className="pb-2 text-xs text-muted">Total marks: {quizMaxScore(editing)}</p>
          </div>

          <div className="space-y-4">
            {editing.questions.map((q, idx) => (
              <AdminQuestionEditor
                key={q.id}
                q={q}
                idx={idx}
                setStatus={setStatus}
                onChange={(next) => setQuestion(idx, next)}
                onRemove={() => setEditing({ ...editing, questions: editing.questions.filter((_, i) => i !== idx) })}
                onMoveUp={idx === 0 ? undefined : () => { const qs = [...editing.questions]; [qs[idx - 1], qs[idx]] = [qs[idx], qs[idx - 1]]; setEditing({ ...editing, questions: qs }); }}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              {QUESTION_TYPES.map((t) => (
                <button key={t} type="button" className={btnGhost} onClick={() => setEditing({ ...editing, questions: [...editing.questions, emptyQuestion(t)] })}>+ {QUESTION_TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2"><button type="submit" className={btn}>Save assessment</button><button type="button" className="text-sm text-muted" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      )}

      <ul className="divide-y divide-card-border rounded-2xl bg-card ring-1 ring-card-border/50">
        {sorted.length === 0 && <li className="px-4 py-3 text-sm text-muted">No assessments yet.</li>}
        {sorted.map((quiz) => (
          <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{quiz.title}{quiz.titleAr ? <span className="ms-2 text-sm text-muted" dir="rtl">{quiz.titleAr}</span> : null}</p>
              <p className="text-xs text-muted">{quiz.year ? `Year ${quiz.year} · ` : ""}{isSowSeed(quiz.id) ? "SOW · " : ""}/assessments/{quiz.slug} · {quiz.questions.length} Qs · {quiz.timeLimitMinutes || "no"} min</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={quiz.published}
                onClick={() => toggleEnabled(quiz)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${quiz.published ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"}`}
                title="Enable or disable this assessment for students"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${quiz.published ? "bg-white" : "bg-slate-500"}`} />
                {quiz.published ? tr("Enabled", "مفعّل") : tr("Disabled", "معطّل")}
              </button>
              <button type="button" className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50" disabled={!quiz.questions.length} onClick={() => startGroup(quiz)}>
                👥 {tr("Start group session", "ابدأ جلسة جماعية")}
              </button>
              {quiz.published && <a className="text-sm text-primary" href={`/assessments/${quiz.slug}`} target="_blank" rel="noreferrer">{tr("Open", "فتح")}</a>}
              <button type="button" className="text-sm text-primary" onClick={() => setEditing(JSON.parse(JSON.stringify(quiz)) as Quiz)}>{tr("Edit", "تعديل")}</button>
              <button type="button" className="text-sm text-red-600" onClick={() => {
                if (isSowSeed(quiz.id)) {
                  if (confirm(`"${quiz.title}" is a built-in scheme-of-work assessment. It can't be deleted, but it will be disabled (hidden from students). Continue?`)) {
                    setData((prev) => ({ quizzes: prev.quizzes.map((q) => (q.id === quiz.id ? { ...q, published: false, updatedAt: new Date().toISOString() } : q)) }));
                    setStatus(`"${quiz.title}" disabled locally. Click "Publish assessments" to apply it on the live site.`);
                  }
                  return;
                }
                if (confirm(`Delete "${quiz.title}"?`)) setData((prev) => ({ quizzes: prev.quizzes.filter((q) => q.id !== quiz.id) }));
              }}>{tr("Delete", "حذف")}</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-2xl bg-card ring-1 ring-card-border/50 p-5">
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
          Live class sessions (Start group session) show their own results table with CSV download. For individual attempts: the site is static, so student attempts are saved in each student’s own browser. To rank the class: collect results (Import local results works for attempts made on this device, e.g. a classroom computer; students can also send you their result), review, then Publish results. Certificates compare each new attempt against published results to show a provisional position.
        </p>
        {results.results.length === 0 ? <p className="text-sm text-muted">No published results yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-1">Assessment</th><th>Pos.</th><th>Name</th><th>Score</th><th>Date</th><th /></tr></thead>
              <tbody>
                {[...results.results].sort((a, b) => a.quizId.localeCompare(b.quizId) || b.percentage - a.percentage || b.score - a.score).map((r) => (
                  <tr key={r.id} className="border-t border-card-border">
                    <td className="py-1.5">{quizTitle(r.quizId)}</td><td className="tabular-nums">{rankOf(r)}</td><td>{r.name}</td><td>{r.score}/{r.maxScore} ({r.percentage}%)</td>
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
