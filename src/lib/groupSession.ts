import type { Quiz, QuizQuestion } from "@/lib/quiz";

/**
 * Client for the live group-assessment Worker (workers/assessment-session).
 * Default: the deployed workers.dev URL. Override at build time with NEXT_PUBLIC_ASSESSMENT_API_URL
 * (e.g. "" to use a same-origin /api route, or http://127.0.0.1:8787 for `wrangler dev`).
 */
const DEFAULT_API = "https://assessment-session.hidden-wildflower-498c.workers.dev";
export const ASSESSMENT_API_BASE = (process.env.NEXT_PUBLIC_ASSESSMENT_API_URL ?? DEFAULT_API).replace(/\/$/, "");

export type SessionStatus = "lobby" | "countdown" | "running" | "ended";

export type SessionInfo = {
  code: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  questionCount: number;
  maxScore: number;
  durationSec: number;
  status: SessionStatus;
  startAt: number | null;
  endAt: number | null;
  now: number;
  participantCount: number;
  participants: { id?: string; name: string; answered: number; submitted: boolean }[];
  /** Teacher hid student names (students then see "Student N" for everyone else). */
  hideNames?: boolean;
  /** Host only: students the teacher removed (they can be let back in). */
  removed?: { id: string; name: string }[];
};

export type ResultRow = {
  /** Participant id (newer Worker versions). */
  id?: string;
  rank: number;
  name: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unanswered: number;
  percentage: number;
  submitted: boolean;
  finishedAt: number | null;
  /** Per-question detail: every row for the teacher, only the student's own row for a student. */
  details?: QuestionDetail[];
  isSelf?: boolean;
};

export type QuestionDetail = {
  questionId: string;
  answer: unknown;
  answered: boolean;
  earned: number;
  points: number;
  isCorrect: boolean;
  answeredAt: number | null;
  /** Seconds after the shared start when this question was (last) answered. */
  secondsFromStart: number | null;
  /** 1-based position of the question in this student's shuffled order. */
  position: number;
};

export type ClassSummary = {
  count: number;
  submitted: number;
  averagePercentage: number;
  highestPercentage: number;
  lowestPercentage: number;
  averageScore: number;
};

export type SessionResults = SessionInfo & {
  rows: ResultRow[];
  /** Older Worker versions omit this; the board computes it from rows. */
  summary?: ClassSummary;
  /** Full assessment (answer key + explanations) sent with detail. */
  quiz?: Quiz;
};

export type MeState = SessionInfo & {
  me: { id: string; name: string; submitted: boolean; answers: Record<string, unknown>; answered: number };
  questions: QuizQuestion[];
};

export class SessionError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> }): Promise<T> {
  const qs = init?.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  let res: Response;
  try {
    res = await fetch(`${ASSESSMENT_API_BASE}/api/session/${path}${qs}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new SessionError("network", 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SessionError(data.error || "error", res.status);
  return data;
}

export const groupApi = {
  create: (quiz: Quiz, durationSec: number, teacherSecret?: string) =>
    call<SessionInfo & { hostKey: string }>("create", { method: "POST", body: { quiz, durationSec, teacherSecret } }),
  info: (code: string) => call<SessionInfo>(encodeURIComponent(code)),
  join: (code: string, name: string, deviceId?: string) =>
    call<SessionInfo & { participantId: string; token: string; name: string }>(`${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: { name, deviceId },
    }),
  /** Teacher: remove a student (their device can't rejoin) or let them back in. */
  remove: (code: string, hostKey: string, pid: string) =>
    call<SessionResults>(`${encodeURIComponent(code)}/remove`, { method: "POST", body: { hostKey, pid } }),
  restore: (code: string, hostKey: string, pid: string) =>
    call<SessionResults>(`${encodeURIComponent(code)}/restore`, { method: "POST", body: { hostKey, pid } }),
  setHideNames: (code: string, hostKey: string, hide: boolean) =>
    call<SessionResults>(`${encodeURIComponent(code)}/names`, { method: "POST", body: { hostKey, hide } }),
  me: (code: string, pid: string, token: string) => call<MeState>(`${encodeURIComponent(code)}/me`, { query: { pid, token } }),
  answer: (code: string, pid: string, token: string, questionId: string, answer: unknown) =>
    call<{ ok: boolean; answered: number; now: number }>(`${encodeURIComponent(code)}/answer`, {
      method: "POST",
      body: { pid, token, questionId, answer },
    }),
  submit: (code: string, pid: string, token: string, answers: Record<string, unknown>) =>
    call<SessionInfo>(`${encodeURIComponent(code)}/submit`, { method: "POST", body: { pid, token, answers } }),
  start: (code: string, hostKey: string, countdownSec = 5) =>
    call<SessionInfo>(`${encodeURIComponent(code)}/start`, { method: "POST", body: { hostKey, countdownSec } }),
  end: (code: string, hostKey: string) => call<SessionResults>(`${encodeURIComponent(code)}/end`, { method: "POST", body: { hostKey } }),
  results: (code: string, hostKey?: string, self?: { pid: string; token: string }) =>
    call<SessionResults>(`${encodeURIComponent(code)}/results`, {
      query: hostKey ? { hostKey } : self ? { pid: self.pid, token: self.token } : undefined,
    }),
};

/** Server-clock offset in ms (server - client), from a response's `now`. */
export function clockOffset(serverNow: number, sentAt: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/**
 * Link in the QR code / on the host screen. The bare domain (shaiqmuhammad.com/join) is only
 * forwarded to the home page by the registrar, so the live site always uses www.
 */
export function joinUrl(code: string): string {
  const origin =
    typeof window === "undefined" || /(^|\.)shaiqmuhammad\.com$/.test(window.location.hostname)
      ? "https://www.shaiqmuhammad.com"
      : window.location.origin;
  return `${origin}/join?code=${encodeURIComponent(code)}`;
}

const DEVICE_KEY = "sm_group_device_v1";

/** Random id kept on this device so a student the teacher removed can't simply rejoin. */
export function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** "Student 3" placeholders when the teacher hides names (numbered in join order). */
export function anonymousName(index: number, lang: string): string {
  return lang === "ar" ? `طالب ${index + 1}` : `Student ${index + 1}`;
}

export function qrImageUrl(data: string, size = 320): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}

/** sessionStorage key the admin Assessments tab uses to hand the (possibly unpublished) quiz to the host screen. */
export const HOST_DRAFT_KEY = "sm_group_host_draft_v1";

const STUDENT_KEY = "sm_group_participant_v1";
const HOST_KEY = "sm_group_host_v1";

export type StoredParticipant = { code: string; pid: string; token: string; name: string };
export type StoredHost = { code: string; hostKey: string; quizSlug: string };

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadParticipant(code: string): StoredParticipant | null {
  if (typeof window === "undefined") return null;
  const p = readJson<StoredParticipant>(window.localStorage, STUDENT_KEY);
  return p && p.code === code ? p : null;
}

export function saveParticipant(p: StoredParticipant): void {
  window.localStorage.setItem(STUDENT_KEY, JSON.stringify(p));
}

export function loadHost(): StoredHost | null {
  if (typeof window === "undefined") return null;
  return readJson<StoredHost>(window.localStorage, HOST_KEY);
}

export function saveHost(h: StoredHost | null): void {
  if (h) window.localStorage.setItem(HOST_KEY, JSON.stringify(h));
  else window.localStorage.removeItem(HOST_KEY);
}
