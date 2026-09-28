"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AssessmentShell, fieldCls, ghostBtn, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { ResultsBoard, resultsCsv } from "@/components/assessment/ResultsBoard";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { formatClock, localizedTitle, useAssessmentText } from "@/lib/assessmentI18n";
import {
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
          const pick = merged.find((q) => q.slug === s) || merged[0];
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
    if (!quiz) return;
    setBusy(true);
    setError("");
    try {
      const r = await groupApi.create(quiz, Math.max(1, Math.round(minutes)) * 60, secret || undefined);
      const h = { code: r.code, hostKey: r.hostKey, quizSlug: quiz.slug };
      saveHost(h);
      setHost(h);
    } catch (e) {
      setError(e instanceof SessionError && e.status === 403 ? a("teacherSecret") : a("apiMissing"));
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
            <h1 className="text-3xl font-bold text-teal-950 dark:text-white">{a("hostTitle")}</h1>
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
                  <option key={q.id} value={q.slug}>
                    {localizedTitle(q, lang)} ({q.questions.length}){q.published ? "" : ` — ${a("disabledNote")}`}
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
            {error && <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}
            <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={busy || !quiz}>
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

  return (
    <AssessmentShell title={`${title} · ${a("sessionCode", { code: host.code })}`} exitHref="/admin" secondsLeft={secondsLeft}>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        {error && <p className="rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}

        {(status === "lobby" || status === "countdown") && (
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <div className={`${panelCls} flex flex-col items-center text-center`}>
              <p className="text-sm font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">{a("scanToJoin")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImageUrl(url, 360)} alt={url} width={300} height={300} className="mt-4 rounded-2xl bg-white p-2" />
              <p className="mt-4 text-sm opacity-70">{a("orVisit", { url: url.replace(/^https?:\/\//, "").replace(/\?.*$/, "") })}</p>
              <p className="mt-2 font-mono text-6xl font-black tracking-[0.2em] text-teal-800 dark:text-teal-200" dir="ltr">
                {host.code}
              </p>
            </div>
            <div className={panelCls}>
              {status === "countdown" && data?.startAt ? (
                <div className="py-10 text-center">
                  <p className="text-2xl font-semibold">{a("getReady")}</p>
                  <p className="text-[8rem] font-black leading-none tabular-nums text-teal-700 dark:text-teal-300">
                    {Math.max(1, Math.ceil((data.startAt - serverNow) / 1000))}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold">{a("studentsJoined", { n: data?.participantCount ?? 0 })}</h2>
                    <button type="button" className={primaryBtn} onClick={start} disabled={busy || !data || data.participantCount === 0}>
                      ▶ {a("startForEveryone")}
                    </button>
                  </div>
                  <p className="mt-2 text-sm opacity-70">
                    {a("questionsMarks", { q: data?.questionCount ?? 0, m: data?.maxScore ?? 0 })} · {a("minutes", { n: Math.round((data?.durationSec ?? 0) / 60) })}
                  </p>
                  {data && data.participants.length > 0 ? (
                    <ul className="mt-6 flex flex-wrap gap-2">
                      {data.participants.map((p, i) => (
                        <li key={`${p.name}-${i}`} className="rounded-full bg-emerald-100 px-4 py-2 text-lg font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                          {p.name}
                        </li>
                      ))}
                    </ul>
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
                <p className="text-sm font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">{a("liveProgress")}</p>
                <p className="text-6xl font-black tabular-nums text-teal-800 dark:text-teal-200" dir="ltr">
                  {formatClock(secondsLeft ?? 0)}
                </p>
              </div>
              <button type="button" className={`${ghostBtn} border-rose-300 text-rose-700 dark:text-rose-300`} onClick={end} disabled={busy}>
                ■ {a("endNow")}
              </button>
            </div>
            <ResultsBoard rows={data.rows} questionCount={data.questionCount} showProgress quiz={data.quiz} />
          </>
        )}

        {status === "ended" && data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold">🏆 {a("resultsBoard")}</h1>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={primaryBtn} onClick={downloadCsv}>
                  ⬇ {a("downloadCsv")}
                </button>
                <button type="button" className={ghostBtn} onClick={reset}>
                  {a("newSession")}
                </button>
              </div>
            </div>
            <ResultsBoard rows={data.rows} questionCount={data.questionCount} summary={data.summary} quiz={data.quiz} />
          </>
        )}
      </div>
    </AssessmentShell>
  );
}
