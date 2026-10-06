"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssessmentShell, fieldCls, panelCls, primaryBtn, ghostBtn } from "@/components/assessment/AssessmentShell";
import { MissingAnswers } from "@/components/assessment/MissingAnswers";
import { QuestionStage } from "@/components/assessment/QuestionStage";
import { ResultsBoard } from "@/components/assessment/ResultsBoard";
import { Podium, ResultsCharts } from "@/components/assessment/ResultsVisuals";
import { initialAnswers } from "@/components/QuizPlayer";
import { useAssessmentText } from "@/lib/assessmentI18n";
import {
  clockOffset,
  deviceId,
  groupApi,
  loadParticipant,
  saveParticipant,
  SessionError,
  type MeState,
  type SessionInfo,
  type SessionResults,
  type StoredParticipant,
} from "@/lib/groupSession";
import { isAnswered, type QuizQuestion } from "@/lib/quiz";

function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

/** Student side of a live class assessment: code → name → wait room → shared timer → results. */
export function GroupJoin() {
  const { a, lang } = useAssessmentText();
  const params = useSearchParams();
  const [code, setCode] = useState(() => cleanCode(params.get("code") || ""));
  const [codeInput, setCodeInput] = useState(code);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [me, setMe] = useState<StoredParticipant | null>(null);
  const [state, setState] = useState<MeState | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [netIssue, setNetIssue] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Attempt state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [rightOrders, setRightOrders] = useState<Record<string, number[]>>({});
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  /** The teacher removed this student (cleared again if the teacher lets them back in). */
  const [removed, setRemoved] = useState(false);
  const answersRef = useRef(answers);
  const pending = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittingRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const errorText = useCallback(
    (e: unknown) => {
      const c = e instanceof SessionError ? e.code : "";
      if (c === "not_found" || c === "bad_code") return a("codeNotFound");
      if (c === "ended") return a("sessionEnded");
      if (c === "full") return a("sessionFull");
      if (c === "network") return a("apiMissing");
      return a("codeNotFound");
    },
    [a],
  );

  // Load session info (and any saved participant) when a code is set.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const sent = Date.now();
    groupApi
      .info(code)
      .then((i) => {
        if (cancelled) return;
        setOffset(clockOffset(i.now, sent, Date.now()));
        setInfo(i);
        setError("");
        const saved = loadParticipant(code);
        if (saved) setMe(saved);
      })
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [code, errorText]);

  // Poll my state: fast in the lobby/countdown, slower while answering.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const sent = Date.now();
      try {
        const s = await groupApi.me(me.code, me.pid, me.token);
        if (cancelled) return;
        setOffset(clockOffset(s.now, sent, Date.now()));
        setNetIssue(false);
        setRemoved(false);
        setState(s);
        if (s.me.submitted) setSubmitted(true);
        if (s.questions.length && !questions.length) {
          const init = initialAnswers(s.questions);
          setQuestions(s.questions);
          setRightOrders(init.rightOrders);
          setAnswers({ ...init.answers, ...s.me.answers });
        }
        if (s.status === "ended") {
          const r = await groupApi.results(me.code, undefined, { pid: me.pid, token: me.token }).catch(() => null);
          if (!cancelled && r) setResults(r);
          if (r) return; // final — stop polling
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof SessionError && e.code === "removed") {
          setRemoved(true);
          timer = setTimeout(tick, 5000);
          return;
        }
        if (e instanceof SessionError && e.status === 403) {
          setMe(null);
          return;
        }
        setNetIssue(true);
      }
      const running = state?.status === "running" && !submitted;
      timer = setTimeout(tick, running ? 5000 : 2000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [me, questions.length, submitted, state?.status]);

  // After the end, keep refreshing the board for a while: late auto-submits, removed students and the teacher's hide-names switch.
  const hasResults = Boolean(results);
  useEffect(() => {
    if (!me || !hasResults) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await groupApi.results(me.code, undefined, { pid: me.pid, token: me.token }).catch(() => null);
      if (r) setResults(r);
      if (n >= 200) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [me, hasResults]);

  // Local clock (corrected by the server offset) for the countdown and timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + offset;
  const status = state?.status ?? info?.status;
  const effectiveStatus =
    state && state.startAt && state.endAt
      ? serverNow < state.startAt
        ? "countdown"
        : serverNow < state.endAt
          ? "running"
          : "ended"
      : status;

  const submitAll = useCallback(async () => {
    if (!me || submittingRef.current) return;
    submittingRef.current = true;
    Object.values(pending.current).forEach(clearTimeout);
    pending.current = {};
    setSubmitted(true);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await groupApi.submit(me.code, me.pid, me.token, answersRef.current);
        return;
      } catch (e) {
        if (e instanceof SessionError && e.code === "removed") {
          setRemoved(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }, [me]);

  // Auto-submit when the shared time runs out.
  useEffect(() => {
    if (effectiveStatus === "ended" && questions.length && !submitted) submitAll();
  }, [effectiveStatus, questions.length, submitted, submitAll]);

  function setAnswer(qid: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    if (!me) return;
    clearTimeout(pending.current[qid]);
    setSaving(true);
    pending.current[qid] = setTimeout(async () => {
      delete pending.current[qid];
      try {
        await groupApi.answer(me.code, me.pid, me.token, qid, value);
        setNetIssue(false);
      } catch (e) {
        if (e instanceof SessionError && e.code === "removed") setRemoved(true);
        else setNetIssue(true);
      } finally {
        if (!Object.keys(pending.current).length) setSaving(false);
      }
    }, 500);
  }

  async function joinSession(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await groupApi.join(code, name.trim(), deviceId());
      const p = { code, pid: r.participantId, token: r.token, name: r.name };
      saveParticipant(p);
      setMe(p);
      setInfo(r);
    } catch (err) {
      if (err instanceof SessionError && err.code === "removed") setRemoved(true);
      else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const title = info ? (lang === "ar" && info.titleAr ? info.titleAr : info.title) : a("groupAssessment");

  // 1) Code entry
  if (!code || (!info && error)) {
    return (
      <AssessmentShell title={a("groupAssessment")}>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <form
            className={panelCls}
            onSubmit={(e) => {
              e.preventDefault();
              const c = cleanCode(codeInput);
              if (c.length >= 4) {
                setError("");
                setInfo(null);
                setCode(c);
              }
            }}
          >
            <h1 className="text-3xl font-bold text-teal-950 dark:text-white sm:text-4xl">{a("joinTitle")}</h1>
            <p className="mt-3 text-lg text-slate-600 dark:text-emerald-100/80">{a("joinSubtitle")}</p>
            <label className="mt-6 block text-base font-semibold">
              {a("joinCode")}
              <input
                className={fieldCls + " text-center font-mono text-3xl font-bold uppercase tracking-[0.4em]"}
                value={codeInput}
                onChange={(e) => setCodeInput(cleanCode(e.target.value))}
                placeholder="ABC123"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                dir="ltr"
                autoFocus
              />
            </label>
            {error && <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}
            <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={cleanCode(codeInput).length < 4}>
              {a("join")} →
            </button>
          </form>
        </div>
      </AssessmentShell>
    );
  }

  // Loading info
  if (!info) {
    return (
      <AssessmentShell title={a("groupAssessment")}>
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-t-teal-700" aria-hidden />
        </div>
      </AssessmentShell>
    );
  }

  // Removed by the teacher
  if (removed) {
    return (
      <AssessmentShell title={title}>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 text-center">
          <div className={panelCls} role="alert" data-testid="removed-screen">
            <p className="text-6xl" aria-hidden>
              🚫
            </p>
            <h1 className="mt-4 text-2xl font-bold text-rose-800 dark:text-rose-200 sm:text-3xl">
              {lang === "ar" ? "لقد أزالك المعلم من هذه الجلسة" : "You have been removed by the teacher"}
            </h1>
            <p className="mt-3 text-base opacity-75">
              {lang === "ar" ? "لا يمكنك العودة إلى هذه الجلسة إلا إذا سمح لك المعلم." : "You can't rejoin this session unless your teacher lets you back in."}
            </p>
          </div>
        </div>
      </AssessmentShell>
    );
  }

  // 2) Name entry
  if (!me) {
    return (
      <AssessmentShell title={title}>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <form className={panelCls} onSubmit={joinSession}>
            <p className="font-mono text-sm font-bold tracking-widest text-teal-700 dark:text-teal-300" dir="ltr">
              {a("joinCode")}: {code}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-teal-950 dark:text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 text-base opacity-70">
              {a("questionsMarks", { q: info.questionCount, m: info.maxScore })} · {a("minutes", { n: Math.round(info.durationSec / 60) })}
            </p>
            {info.status === "ended" ? (
              <p className="mt-6 rounded-xl bg-amber-100 px-4 py-3 text-base text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{a("sessionEnded")}</p>
            ) : (
              <>
                <label className="mt-6 block text-base font-semibold">
                  {a("enterName")}
                  <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={a("namePlaceholder")} maxLength={40} required autoFocus />
                </label>
                {error && <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}
                <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={busy || !name.trim()}>
                  {busy ? a("joining") : a("join")}
                </button>
              </>
            )}
          </form>
        </div>
      </AssessmentShell>
    );
  }

  // 5) Results
  if (results) {
    return (
      <AssessmentShell title={title}>
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
          <h1 className="text-3xl font-bold text-teal-950 dark:text-white sm:text-4xl">🏆 {a("resultsBoard")}</h1>
          <Podium rows={results.rows} lang={lang} />
          <ResultsCharts rows={results.rows} lang={lang} />
          <ResultsBoard rows={results.rows} questionCount={results.questionCount} highlightName={me.name} summary={results.summary} quiz={results.quiz} />
        </div>
      </AssessmentShell>
    );
  }

  // 4) Answering (shared timer)
  if (effectiveStatus === "running" && questions.length && !submitted) {
    const total = questions.length;
    const q = questions[Math.min(current, total - 1)];
    const answeredFlags = questions.map((x) => isAnswered(x, answers[x.id]));
    const answeredCount = answeredFlags.filter(Boolean).length;
    const secondsLeft = state?.endAt ? Math.max(0, (state.endAt - serverNow) / 1000) : null;
    const last = current >= total - 1;
    return (
      <AssessmentShell
        title={title}
        exitHref="/assessments"
        onExit={() => confirm(a("exitConfirm"))}
        secondsLeft={secondsLeft}
        progress={{ current, total, answered: answeredFlags, onJump: setCurrent }}
      >
        <form
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:py-12"
          onSubmit={(e) => {
            e.preventDefault();
            if (!last) return setCurrent((c) => c + 1);
            // Every question is required; the shared timer still auto-submits gaps as wrong.
            if (answeredCount < total) return setShowMissing(true);
            submitAll();
          }}
        >
          <div className="flex-1">
            <QuestionStage
              question={q}
              index={current}
              total={total}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
              rightOrder={rightOrders[q.id]}
            />
            {showMissing && (
              <MissingAnswers
                answered={answeredFlags}
                onJump={(i) => {
                  setCurrent(i);
                  window.scrollTo({ top: 0 });
                }}
                onClose={() => setShowMissing(false)}
              />
            )}
          </div>
          <div className="sticky bottom-0 mt-10 flex items-center justify-between gap-3 border-t border-emerald-900/10 bg-gradient-to-t from-white via-white/95 to-white/0 pb-4 pt-4 dark:border-emerald-100/10 dark:from-[#0a1613] dark:via-[#0a1613]/95">
            <button type="button" className={`${ghostBtn} ${current === 0 ? "invisible" : ""}`} disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              <span className="inline-block rtl:rotate-180" aria-hidden>←</span> {a("previous")}
            </button>
            <p className="text-sm font-medium opacity-70">
              {netIssue ? a("networkError") : saving ? a("saving") : `${a("offlineSaved")} · ${a("answered", { a: answeredCount, n: total })}`}
            </p>
            <button type="submit" className={primaryBtn}>
              {last ? a("submit") : a("next")} {!last && <span className="inline-block rtl:rotate-180" aria-hidden>→</span>}
            </button>
          </div>
        </form>
      </AssessmentShell>
    );
  }

  // 3) Waiting room / countdown / waiting for others
  const countdown = state?.startAt ? Math.ceil((state.startAt - serverNow) / 1000) : null;
  return (
    <AssessmentShell title={title}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        {effectiveStatus === "countdown" && countdown !== null ? (
          <>
            <p className="text-2xl font-semibold text-teal-800 dark:text-teal-200">{a("getReady")}</p>
            <p className="text-[9rem] font-black leading-none tabular-nums text-teal-700 dark:text-teal-300">{Math.max(1, countdown)}</p>
          </>
        ) : submitted || effectiveStatus === "ended" ? (
          <div className={panelCls}>
            <p className="text-5xl" aria-hidden>
              ✅
            </p>
            <p className="mt-4 text-2xl font-bold text-teal-900 dark:text-teal-100">{a("waitingOthers")}</p>
          </div>
        ) : (
          <div className={`${panelCls} w-full`}>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-teal-100 text-4xl dark:bg-teal-900/50" aria-hidden>
              ⏳
            </div>
            <p className="mt-4 text-sm font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">{me.name}</p>
            <h1 className="mt-2 text-2xl font-bold text-teal-950 dark:text-white sm:text-3xl">{a("waitingRoom")}</h1>
            <p className="mt-4 text-base opacity-70">{a("studentsJoined", { n: state?.participantCount ?? info.participantCount })}</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {(state?.participants ?? info.participants).map((p, i) => (
                <li
                  key={`${p.name}-${i}`}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    (p.id ? p.id === me.pid : p.name === me.name) ? "bg-teal-700 text-white" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                  }`}
                >
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {netIssue && <p className="text-sm text-rose-700 dark:text-rose-300">{a("networkError")}</p>}
      </div>
    </AssessmentShell>
  );
}
