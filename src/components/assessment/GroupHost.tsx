"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AssessmentShell, fieldCls, ghostBtn, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { PaperDownloads } from "@/components/assessment/PaperDownloads";
import { ResultsBoard, resultsCsv } from "@/components/assessment/ResultsBoard";
import { Podium, ResultsCharts, ResultsDownloads } from "@/components/assessment/ResultsVisuals";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { formatClock, localizedTitle, useAssessmentText } from "@/lib/assessmentI18n";
import {
  anonymousName,
  clockOffset,
  groupApi,
  HOST_DRAFT_KEY,
  joinUrl,
  loadHost,
  qrImageUrl,
  saveHost,
  SessionError,
  type SessionResults,
  type StoredHost,
} from "@/lib/groupSession";
import { loadQuizzesData, normalizeQuiz, type Quiz } from "@/lib/quiz";

/** Default live-session length (5 minutes = 300 s) when an assessment has no time limit. */
const DEFAULT_TIME_LIMIT_MINUTES = 5;

/** Teacher screen for a live class assessment: create → QR/code lobby → start → live board → results. */
export function GroupHost() {
  const { a, lang } = useAssessmentText();
  const params = useSearchParams();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [slug, setSlug] = useState(params.get("quiz") || "");
  const [minutes, setMinutes] = useState(DEFAULT_TIME_LIMIT_MINUTES);
  const [secret, setSecret] = useState("");
  const [host, setHost] = useState<StoredHost | null>(null);
  const [data, setData] = useState<SessionResults | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);

  useEffect(() => {
    const authTimer = setTimeout(() => {
      setAuthed(isAdminAuthenticated());
      const saved = loadHost();
      if (saved) setHost(saved);
    }, 0);
    let draft: Quiz | null = null;
    try {
      const raw = sessionStorage.getItem(HOST_DRAFT_KEY);
      if (raw) draft = normalizeQuiz(JSON.parse(raw));
    } catch {
      draft = null;
    }
    loadQuizzesData()
      .then((d) => {
        const list = d.quizzes.filter((q) => q.questions.length > 0);
        const merged = draft ? [draft, ...list.filter((q) => q.id !== draft!.id)] : list;
        setQuizzes(merged);
        setSlug((s) => {
          const pick = merged.find((q) => q.slug === s && q.active) || merged.find((q) => q.active) || merged[0];
          if (pick && pick.timeLimitMinutes > 0) setMinutes(pick.timeLimitMinutes);
          return pick ? pick.slug : s;
        });
      })
      .catch(() => draft && setQuizzes([draft]));
    return () => clearTimeout(authTimer);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async (h: StoredHost) => {
    const sent = Date.now();
    try {
      const r = await groupApi.results(h.code, h.hostKey);
      setOffset(clockOffset(r.now, sent, Date.now()));
      setData(r);
      setError("");
      return r;
    } catch (e) {
      if (e instanceof SessionError && (e.status === 404 || e.status === 403)) {
        saveHost(null);
        setHost(null);
        setData(null);
      } else setError(a("networkError"));
      return null;
    }
  }, [a]);

  // Poll the session while hosting.
  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await refresh(host);
      if (cancelled) return;
      if (r && r.status === "ended" && r.rows.every((x) => x.submitted)) return;
      timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [host, refresh]);

  const quiz = quizzes.find((q) => q.slug === slug);

  async function create() {
    if (!quiz || !quiz.active) return;
    setBusy(true);
    setError("");
    try {
      const r = await groupApi.create(quiz, Math.max(1, Math.round(minutes)) * 60, secret || undefined);
      const h = { code: r.code, hostKey: r.hostKey, quizSlug: quiz.slug };
      saveHost(h);
      setHost(h);
    } catch (e) {
      setError(
        e instanceof SessionError && e.code === "inactive"
          ? (lang === "ar" ? "هذا التقييم غير نشط. فعّله من الإدارة ← التقييمات ثم انشر." : "This assessment is not active. Activate it in Admin → Assessments, then publish.")
          : e instanceof SessionError && e.status === 403
            ? a("teacherSecret")
            : a("apiMissing"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!host) return;
    setBusy(true);
    try {
      await groupApi.start(host.code, host.hostKey, 5);
      await refresh(host);
    } catch {
      setError(a("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!host || !confirm(a("endConfirm"))) return;
    setBusy(true);
    try {
      const r = await groupApi.end(host.code, host.hostKey);
      setData(r);
    } catch {
      setError(a("networkError"));
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!data) return;
    const blob = new Blob(["\ufeff" + resultsCsv(data.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `assessment-${data.code}-results.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeStudent(id: string, name: string) {
    if (!host || !confirm(tr(`Remove ${name} from this session? Their device will show that the teacher removed them.`, `إزالة ${name} من هذه الجلسة؟`))) return;
    try {
      setData(await groupApi.remove(host.code, host.hostKey, id));
    } catch {
      setError(a("networkError"));
    }
  }

  async function restoreStudent(id: string) {
    if (!host) return;
    try {
      setData(await groupApi.restore(host.code, host.hostKey, id));
    } catch {
      setError(a("networkError"));
    }
  }

  async function toggleNames() {
    if (!host || !data) return;
    try {
      setData(await groupApi.setHideNames(host.code, host.hostKey, !data.hideNames));
    } catch {
      setError(a("networkError"));
    }
  }

  function reset() {
    saveHost(null);
    setHost(null);
    setData(null);
  }

  if (authed === null) return null;

  if (!authed) {
    return (
      <AssessmentShell title={a("hostTitle")} exitHref="/admin">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <div className={panelCls}>
            <h1 className="text-2xl font-bold">{a("hostTitle")}</h1>
            <p className="mt-3 text-base opacity-80">{a("hostOnly")}</p>
            <Link href="/admin/login" className={`${primaryBtn} mt-6`}>
              {a("goToAdmin")}
            </Link>
          </div>
        </div>
      </AssessmentShell>
    );
  }

  // Setup
  if (!host) {
    return (
      <AssessmentShell title={a("hostTitle")} exitHref="/admin">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <form
            className={panelCls}
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <h1 className="text-3xl font-bold text-navy dark:text-white">{a("hostTitle")}</h1>
            <label className="mt-6 block text-base font-semibold">
              {a("chooseAssessment")}
              <select
                className={fieldCls}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  const q = quizzes.find((x) => x.slug === e.target.value);
                  if (q && q.timeLimitMinutes > 0) setMinutes(q.timeLimitMinutes);
                }}
              >
                {quizzes.map((q) => (
                  <option key={q.id} value={q.slug} disabled={!q.active}>
                    {localizedTitle(q, lang)} ({q.questions.length})
                    {!q.active ? ` — ${(lang === "ar" ? "غير نشط — فعّله من الإدارة أولًا" : "inactive — activate it in Admin first")}` : !q.visible ? ` — ${(lang === "ar" ? "مخفي من الموقع" : "hidden from website")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-base font-semibold">
              {a("duration")}
              <input type="number" min={1} max={240} className={fieldCls} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 1)} />
            </label>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer opacity-70">{a("teacherSecret")}</summary>
              <input type="password" className={fieldCls} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
            </details>
            {quiz && <PaperDownloads quiz={quiz} className="mt-4 inline-block" />}
            {error && <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}
            {quiz && !quiz.active && <p className="mt-4 rounded-xl bg-amber-100 px-4 py-2 text-base text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{(lang === "ar" ? "هذا التقييم غير نشط. فعّله من الإدارة ← التقييمات ثم انشر." : "This assessment is not active. Activate it in Admin → Assessments, then publish.")}</p>}
            <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={busy || !quiz || !quiz.active}>
              {busy ? a("creating") : a("createSession")}
            </button>
          </form>
        </div>
      </AssessmentShell>
    );
  }

  const serverNow = now + offset;
  const status = data
    ? data.status !== "ended" && data.startAt && data.endAt
      ? serverNow < data.startAt
        ? "countdown"
        : serverNow < data.endAt
          ? "running"
          : "ended"
      : data.status
    : "lobby";
  const title = data ? (lang === "ar" && data.titleAr ? data.titleAr : data.title) : a("groupAssessment");
  const url = joinUrl(host.code);
  const secondsLeft = status === "running" && data?.endAt ? Math.max(0, (data.endAt - serverNow) / 1000) : null;
  // Names as shown on this (projected) screen: "Student N" in join order when the teacher hides them.
  const hidden = Boolean(data?.hideNames);
  const joinOrder = new Map((data?.participants ?? []).map((p, i) => [p.id, i]));
  const shown = (id: string | undefined, name: string) => (hidden ? anonymousName(joinOrder.get(id) ?? 0, lang) : name);
  const rows = (data?.rows ?? []).map((r) => ({ ...r, name: shown(r.id, r.name) }));
  const toolbar = data && (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={toggleNames} className={`${ghostBtn} py-2 text-sm`} aria-pressed={hidden} data-testid="toggle-names">
        {hidden ? `👁 ${tr("Show names", "إظهار الأسماء")}` : `🙈 ${tr("Hide names", "إخفاء الأسماء")}`}
      </button>
    </div>
  );
  const students = data && (data.participants.length > 0 || (data.removed?.length ?? 0) > 0) && (
    <div className="space-y-3" data-testid="manage-students">
      <ul className="flex flex-wrap gap-2">
        {data.participants.map((p, i) => (
          <li key={p.id ?? `${p.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-1.5 ps-4 pe-1.5 text-lg font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
            <span dir="auto">{shown(p.id, p.name)}</span>
            {status === "running" ? <span className="ms-1 text-xs font-medium opacity-70">{p.submitted ? "✓" : `${p.answered}/${data.questionCount}`}</span> : null}
            {p.id ? (
              <button type="button" onClick={() => removeStudent(p.id!, shown(p.id, p.name))} className="ms-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-base text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40" aria-label={tr(`Remove ${shown(p.id, p.name)}`, `إزالة ${shown(p.id, p.name)}`)} title={tr("Remove", "إزالة")} data-testid="remove-student">
                ✕
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {data.removed && data.removed.length > 0 && (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm dark:bg-rose-950/30" data-testid="removed-list">
          <p className="font-semibold text-rose-800 dark:text-rose-200">{tr("Removed (can't rejoin unless you allow it):", "تمت إزالتهم (لا يمكنهم العودة إلا بإذنك):")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.removed.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 dark:bg-white/10">
                <span dir="auto">{hidden ? tr("Student", "طالب") : p.name}</span>
                <button type="button" onClick={() => restoreStudent(p.id)} className="font-semibold text-teal-brand underline dark:text-teal-300" data-testid="restore-student">
                  {tr("Allow back", "السماح بالعودة")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <AssessmentShell title={`${title} · ${a("sessionCode", { code: host.code })}`} exitHref="/admin" secondsLeft={secondsLeft}>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        {error && <p className="rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}

        {(status === "lobby" || status === "countdown") && (
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <div className={`${panelCls} flex flex-col items-center text-center`}>
              <p className="text-sm font-bold uppercase tracking-widest text-teal-brand dark:text-teal-300">{a("scanToJoin")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImageUrl(url, 360)} alt={url} width={300} height={300} className="mt-4 rounded-2xl bg-white p-2" />
              <p className="mt-4 text-base font-semibold opacity-80" dir="ltr" data-testid="join-url">{a("orVisit", { url: url.replace(/^https?:\/\//, "").replace(/\?.*$/, "") })}</p>
              <p className="mt-2 font-mono text-6xl font-black tracking-[0.2em] text-navy dark:text-teal-200" dir="ltr">
                {host.code}
              </p>
            </div>
            <div className={panelCls}>
              {status === "countdown" && data?.startAt ? (
                <div className="py-10 text-center">
                  <p className="text-2xl font-semibold">{a("getReady")}</p>
                  <p className="text-[8rem] font-black leading-none tabular-nums text-teal-brand dark:text-teal-300">
                    {Math.max(1, Math.ceil((data.startAt - serverNow) / 1000))}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold">{a("studentsJoined", { n: data?.participantCount ?? 0 })}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {toolbar}
                      <button type="button" className={primaryBtn} onClick={start} disabled={busy || !data || data.participantCount === 0}>
                        ▶ {a("startForEveryone")}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm opacity-70">
                    {a("questionsMarks", { q: data?.questionCount ?? 0, m: data?.maxScore ?? 0 })} · {a("minutes", { n: Math.round((data?.durationSec ?? 0) / 60) })}
                  </p>
                  {students ? (
                    <div className="mt-6">{students}</div>
                  ) : (
                    <p className="mt-6 text-lg opacity-70">{a("noStudents")}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {status === "running" && data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-teal-brand dark:text-teal-300">{a("liveProgress")}</p>
                <p className="text-6xl font-black tabular-nums text-navy dark:text-teal-200" dir="ltr">
                  {formatClock(secondsLeft ?? 0)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
                <button type="button" className={`${ghostBtn} border-rose-300 text-rose-700 dark:text-rose-300`} onClick={end} disabled={busy}>
                  ■ {a("endNow")}
                </button>
              </div>
            </div>
            {students ? <div className={panelCls}>{students}</div> : null}
            <ResultsBoard rows={rows} questionCount={data.questionCount} showProgress quiz={data.quiz} />
          </>
        )}

        {status === "ended" && data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold">🏆 {a("resultsBoard")}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
                <ResultsDownloads data={data} />
                <button type="button" className={`${ghostBtn} py-2 text-sm`} onClick={downloadCsv}>
                  ⬇ {a("downloadCsv")}
                </button>
                <button type="button" className={`${ghostBtn} py-2 text-sm`} onClick={reset}>
                  {a("newSession")}
                </button>
              </div>
            </div>
            <Podium rows={rows} lang={lang} />
            <ResultsCharts rows={rows} quiz={data.quiz} lang={lang} />
            <ResultsBoard rows={rows} questionCount={data.questionCount} summary={data.summary} quiz={data.quiz} />
          </>
        )}
      </div>
    </AssessmentShell>
  );
}
