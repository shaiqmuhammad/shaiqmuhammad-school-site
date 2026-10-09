"use client";

import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { describeAnswer, describeCorrect, isAnswered, scoreQuestion, type Quiz } from "@/lib/quiz";

/** Permanent results record kept by the Worker (see workers/assessment-session/src/results.ts). */
export type ResultDetail = {
  n: number;
  prompt: string;
  answer: string;
  correctAnswer: string;
  isCorrect: boolean;
  answered: boolean;
  earned: number;
  points: number;
  seconds?: number | null;
};

export type ResultRecord = {
  id: string;
  kind: "individual" | "group";
  quizId: string;
  quizSlug: string;
  quizTitle: string;
  year: number | null;
  name: string;
  sessionCode: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  unanswered: number;
  timeSec: number | null;
  finishedAt: number;
  rank: number | null;
  groupSize: number | null;
  details?: ResultDetail[];
};

export type ResultFilters = { quiz?: string; year?: number; mode?: "" | "individual" | "group"; from?: number; to?: number; q?: string };

const API = `${ASSESSMENT_API_BASE}/api/results`;
const lines = (l: { text: string }[]) => l.map((x) => x.text).join("; ");

/** Per-question detail for an individual attempt (prompt, the student's answer, the correct answer). */
export function attemptDetails(quiz: Quiz, answers: Record<string, unknown>): ResultDetail[] {
  return quiz.questions.map((q, i) => {
    const earned = scoreQuestion(q, answers[q.id]);
    const points = q.points || 1;
    return {
      n: i + 1,
      prompt: q.prompt.slice(0, 600),
      answer: lines(describeAnswer(q, answers[q.id])).slice(0, 600),
      correctAnswer: lines(describeCorrect(q)).slice(0, 600),
      isCorrect: earned >= points,
      answered: isAnswered(q, answers[q.id]),
      earned,
      points,
    };
  });
}

/** Save an individual attempt to the server record (best effort; the student still sees the result offline). */
export async function recordAttempt(payload: {
  quiz: Quiz;
  name: string;
  score: number;
  maxScore: number;
  answers: Record<string, unknown>;
  timeSec: number | null;
}): Promise<boolean> {
  const details = attemptDetails(payload.quiz, payload.answers);
  const correct = details.filter((d) => d.isCorrect).length;
  try {
    const res = await fetch(`${API}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        quizId: payload.quiz.id,
        quizSlug: payload.quiz.slug,
        quizTitle: payload.quiz.title,
        year: payload.quiz.year ?? null,
        name: payload.name,
        score: payload.score,
        maxScore: payload.maxScore,
        correct,
        wrong: details.length - correct,
        unanswered: details.filter((d) => !d.answered).length,
        timeSec: payload.timeSec,
        details,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function adminCall<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T | null> {
  const session = getServerSession();
  if (!session) return null;
  try {
    const res = await fetch(`${API}/${path}`, {
      method: init?.method || "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.token}`, ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function listResults(f: ResultFilters, withDetails = false): Promise<ResultRecord[] | null> {
  const p = new URLSearchParams();
  if (f.quiz) p.set("quiz", f.quiz);
  if (f.year) p.set("year", String(f.year));
  if (f.mode) p.set("mode", f.mode);
  if (f.from) p.set("from", String(f.from));
  if (f.to) p.set("to", String(f.to));
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (withDetails) p.set("details", "1");
  const r = await adminCall<{ items: ResultRecord[] }>(`list?${p}`);
  return r ? r.items : null;
}

export async function getResult(id: string): Promise<ResultRecord | null> {
  const r = await adminCall<{ item: ResultRecord }>(`get?id=${encodeURIComponent(id)}`);
  return r ? r.item : null;
}

export async function deleteResults(ids: string[]): Promise<number | null> {
  const r = await adminCall<{ deleted: number }>("delete", { method: "POST", body: { ids } });
  return r ? r.deleted : null;
}

/** Dubai wall-clock date/time (the school's time zone) for tables and downloads. */
export function dubaiDateTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
}

/** Start (00:00) of a yyyy-mm-dd day in Dubai (UTC+4, no DST) as epoch ms. */
export function dubaiDayStart(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00+04:00`);
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
