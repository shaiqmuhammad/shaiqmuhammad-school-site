/**
 * Live group assessments for shaiqmuhammad.com.
 *
 * One Durable Object per session (named by its join code) holds the assessment snapshot,
 * the shared start/end time, every participant's shuffled question order and answers.
 * Scoring reuses the site's own src/lib/quiz.ts so results match the individual player.
 *
 * Endpoints (JSON, CORS *):
 *   POST /api/session/create              {quiz, durationSec?, teacherSecret?} -> {code, hostKey, ...info}
 *   GET  /api/session/:code               public join info (title, status, startAt, endAt, now, participants)
 *   POST /api/session/:code/join          {name} -> {participantId, token, name}
 *   GET  /api/session/:code/me?pid=&token=  participant state (+ shuffled questions once started)
 *   POST /api/session/:code/answer        {pid, token, questionId, answer}
 *   POST /api/session/:code/submit        {pid, token, answers?}
 *   POST /api/session/:code/start         {hostKey, countdownSec?}  -> sets startAt for everyone
 *   POST /api/session/:code/end           {hostKey}
 *   GET  /api/session/:code/results[?hostKey=][&pid=&token=]
 *        class table (host: any time; everyone: after the end) with rank (ties share a rank) and a class summary.
 *        Per-question detail (answer, correct?, earned, time) is included for every student when hostKey is
 *        given, and for the student's own row when pid+token are given. The full assessment (answer key +
 *        explanations) is included with the detail so the board can show questions and correct answers.
 */
import { DurableObject } from "cloudflare:workers";
import { isAnswered, normalizeQuiz, quizMaxScore, scoreQuestion, type Quiz, type QuizQuestion } from "../../../src/lib/quiz";

export interface Env {
  SESSIONS: DurableObjectNamespace<AssessmentSession>;
  HOST_SECRET?: string;
}

type Status = "lobby" | "countdown" | "running" | "ended";

type Meta = {
  code: string;
  hostKey: string;
  createdAt: number;
  durationSec: number;
  startAt?: number;
  endAt?: number;
  endedAt?: number;
};

type Participant = {
  id: string;
  token: string;
  name: string;
  order: string[];
  answers: Record<string, unknown>;
  /** Server time (ms) each question was last answered. Absent on sessions created before this field existed. */
  answeredAt?: Record<string, number>;
  joinedAt: number;
  submittedAt?: number;
};

type Reply = { status: number; body: unknown };

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_PARTICIPANTS = 300;
const MAX_QUIZ_BYTES = 1_800_000;
const ANSWER_GRACE_MS = 4000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
  });
}

function randomString(length: number, alphabet: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function randomToken(): string {
  return randomString(32, "abcdefghijklmnopqrstuvwxyz0123456789");
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Question as sent to students during the attempt: no answer key, no explanations. */
function forStudent(q: QuizQuestion): QuizQuestion {
  const copy: QuizQuestion = { ...q, correct: [] };
  delete copy.blanks;
  delete copy.explanation;
  delete copy.explanationAr;
  return copy;
}

export class AssessmentSession extends DurableObject<Env> {
  private meta: Meta | null = null;
  private quiz: Quiz | null = null;
  private participants = new Map<string, Participant>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get<Meta>("meta")) ?? null;
      this.quiz = (await ctx.storage.get<Quiz>("quiz")) ?? null;
      const stored = await ctx.storage.list<Participant>({ prefix: "p:" });
      for (const p of stored.values()) this.participants.set(p.id, p);
    });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.meta = null;
    this.quiz = null;
    this.participants.clear();
  }

  private status(now: number): Status {
    const m = this.meta!;
    if (!m.startAt) return m.endedAt ? "ended" : "lobby";
    if (m.endedAt || (m.endAt !== undefined && now >= m.endAt)) return "ended";
    if (now < m.startAt) return "countdown";
    return "running";
  }

  private info(now: number) {
    const m = this.meta!;
    const q = this.quiz!;
    return {
      code: m.code,
      title: q.title,
      titleAr: q.titleAr || "",
      description: q.description,
      descriptionAr: q.descriptionAr || "",
      questionCount: q.questions.length,
      maxScore: quizMaxScore(q),
      durationSec: m.durationSec,
      status: this.status(now),
      startAt: m.startAt ?? null,
      endAt: m.endedAt ?? m.endAt ?? null,
      now,
      participantCount: this.participants.size,
      participants: [...this.participants.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({ name: p.name, answered: this.answeredCount(p), submitted: Boolean(p.submittedAt) })),
    };
  }

  private answeredCount(p: Participant): number {
    return this.quiz!.questions.filter((q) => isAnswered(q, p.answers[q.id])).length;
  }

  private results(now: number, opts: { hostDetail?: boolean; selfId?: string } = {}) {
    const q = this.quiz!;
    const maxScore = quizMaxScore(q);
    const startAt = this.meta!.startAt ?? null;
    const rows = [...this.participants.values()].map((p) => {
      let score = 0;
      let correct = 0;
      let unanswered = 0;
      const details: {
        questionId: string;
        answer: unknown;
        answered: boolean;
        earned: number;
        points: number;
        isCorrect: boolean;
        answeredAt: number | null;
        secondsFromStart: number | null;
        position: number;
      }[] = [];
      for (const question of q.questions) {
        const answer = p.answers[question.id];
        const earned = scoreQuestion(question, answer);
        const answered = isAnswered(question, answer);
        score += earned;
        if (earned >= (question.points || 1)) correct++;
        if (!answered) unanswered++;
        const at = p.answeredAt?.[question.id] ?? null;
        details.push({
          questionId: question.id,
          answer: answer ?? null,
          answered,
          earned,
          points: question.points || 1,
          isCorrect: earned >= (question.points || 1),
          answeredAt: at,
          secondsFromStart: at !== null && startAt !== null ? Math.max(0, Math.round((at - startAt) / 1000)) : null,
          position: p.order.indexOf(question.id) + 1,
        });
      }
      const total = q.questions.length;
      const showDetail = opts.hostDetail || (opts.selfId !== undefined && opts.selfId === p.id);
      return {
        name: p.name,
        ...(showDetail ? { details } : {}),
        ...(opts.selfId !== undefined && opts.selfId === p.id ? { isSelf: true } : {}),
        score,
        maxScore,
        correct,
        wrong: total - correct,
        unanswered,
        percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
        submitted: Boolean(p.submittedAt),
        finishedAt: p.submittedAt ?? null,
      };
    });
    rows.sort((a, b) => b.score - a.score || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || a.name.localeCompare(b.name));
    let rank = 0;
    let prev: number | null = null;
    const ranked = rows.map((r, i) => {
      if (prev === null || r.score !== prev) rank = i + 1;
      prev = r.score;
      return { rank, ...r };
    });
    const pcts = ranked.map((r) => r.percentage);
    const summary = {
      count: ranked.length,
      submitted: ranked.filter((r) => r.submitted).length,
      averagePercentage: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0,
      highestPercentage: pcts.length ? Math.max(...pcts) : 0,
      lowestPercentage: pcts.length ? Math.min(...pcts) : 0,
      averageScore: ranked.length ? Math.round((ranked.reduce((a, r) => a + r.score, 0) / ranked.length) * 10) / 10 : 0,
    };
    const withDetail = opts.hostDetail || opts.selfId !== undefined;
    return { ...this.info(now), rows: ranked, summary, ...(withDetail ? { quiz: q } : {}) };
  }

  private auth(body: Record<string, unknown>): Participant | null {
    const p = this.participants.get(String(body.pid ?? ""));
    return p && p.token === String(body.token ?? "") ? p : null;
  }

  private canAnswer(now: number): boolean {
    const m = this.meta!;
    if (!m.startAt || now < m.startAt) return false;
    if (m.endedAt) return now < m.endedAt + ANSWER_GRACE_MS;
    return m.endAt === undefined || now < m.endAt + ANSWER_GRACE_MS;
  }

  private async saveParticipant(p: Participant): Promise<void> {
    this.participants.set(p.id, p);
    await this.ctx.storage.put(`p:${p.id}`, p);
  }

  /** Single RPC entry point used by the Worker router. */
  async handle(action: string, method: string, body: Record<string, unknown>): Promise<Reply> {
    const now = Date.now();

    if (action === "init") {
      if (this.meta) return { status: 409, body: { error: "code_taken" } };
      const quiz = body.quiz as Quiz;
      const durationSec = Math.max(30, Math.min(4 * 60 * 60, Math.round(Number(body.durationSec) || 600)));
      this.quiz = quiz;
      this.meta = { code: String(body.code), hostKey: randomToken(), createdAt: now, durationSec };
      await this.ctx.storage.put({ meta: this.meta, quiz });
      await this.ctx.storage.setAlarm(now + SESSION_TTL_MS);
      return { status: 200, body: { hostKey: this.meta.hostKey, ...this.info(now) } };
    }

    if (!this.meta || !this.quiz) return { status: 404, body: { error: "not_found" } };
    const m = this.meta;
    const isHost = typeof body.hostKey === "string" && body.hostKey === m.hostKey;

    switch (action) {
      case "info":
        return { status: 200, body: this.info(now) };

      case "join": {
        if (method !== "POST") break;
        if (this.status(now) === "ended") return { status: 409, body: { error: "ended" } };
        if (this.participants.size >= MAX_PARTICIPANTS) return { status: 409, body: { error: "full" } };
        let name = cleanName(body.name);
        if (!name) return { status: 400, body: { error: "name_required" } };
        const taken = new Set([...this.participants.values()].map((p) => p.name.toLowerCase()));
        if (taken.has(name.toLowerCase())) {
          let n = 2;
          while (taken.has(`${name} (${n})`.toLowerCase())) n++;
          name = `${name} (${n})`;
        }
        const p: Participant = {
          id: randomString(10, "abcdefghijklmnopqrstuvwxyz0123456789"),
          token: randomToken(),
          name,
          order: shuffle(this.quiz.questions.map((q) => q.id)),
          answers: {},
          joinedAt: now,
        };
        await this.saveParticipant(p);
        return { status: 200, body: { participantId: p.id, token: p.token, name: p.name, ...this.info(now) } };
      }

      case "me": {
        const p = this.auth(body);
        if (!p) return { status: 403, body: { error: "unknown_participant" } };
        const status = this.status(now);
        const byId = new Map(this.quiz.questions.map((q) => [q.id, q]));
        const questions =
          status === "running" || status === "ended"
            ? p.order.map((id) => byId.get(id)).filter((q): q is QuizQuestion => Boolean(q)).map(forStudent)
            : [];
        return {
          status: 200,
          body: {
            ...this.info(now),
            me: { id: p.id, name: p.name, submitted: Boolean(p.submittedAt), answers: p.answers, answered: this.answeredCount(p) },
            questions,
          },
        };
      }

      case "answer": {
        if (method !== "POST") break;
        const p = this.auth(body);
        if (!p) return { status: 403, body: { error: "unknown_participant" } };
        if (p.submittedAt) return { status: 409, body: { error: "already_submitted" } };
        if (!this.canAnswer(now)) return { status: 409, body: { error: "not_running", ...this.info(now) } };
        const qid = String(body.questionId ?? "");
        if (!this.quiz.questions.some((q) => q.id === qid)) return { status: 400, body: { error: "bad_question" } };
        if (JSON.stringify(body.answer ?? null).length > 5000) return { status: 413, body: { error: "answer_too_large" } };
        p.answers = { ...p.answers, [qid]: body.answer };
        p.answeredAt = { ...(p.answeredAt ?? {}), [qid]: now };
        await this.saveParticipant(p);
        return { status: 200, body: { ok: true, answered: this.answeredCount(p), now } };
      }

      case "submit": {
        if (method !== "POST") break;
        const p = this.auth(body);
        if (!p) return { status: 403, body: { error: "unknown_participant" } };
        if (!p.submittedAt) {
          if (body.answers && typeof body.answers === "object" && this.canAnswer(now)) {
            const incoming = body.answers as Record<string, unknown>;
            const ids = new Set(this.quiz.questions.map((q) => q.id));
            const merged = { ...p.answers };
            const times = { ...(p.answeredAt ?? {}) };
            for (const [k, v] of Object.entries(incoming)) {
              if (ids.has(k) && JSON.stringify(v ?? null).length <= 5000) {
                if (JSON.stringify(merged[k] ?? null) !== JSON.stringify(v ?? null) || times[k] === undefined) times[k] = now;
                merged[k] = v;
              }
            }
            p.answers = merged;
            p.answeredAt = times;
          }
          p.submittedAt = now;
          await this.saveParticipant(p);
        }
        return { status: 200, body: { ok: true, ...this.info(now) } };
      }

      case "start": {
        if (method !== "POST") break;
        if (!isHost) return { status: 403, body: { error: "host_only" } };
        if (!m.startAt && !m.endedAt) {
          const countdown = Math.max(0, Math.min(30, Math.round(Number(body.countdownSec ?? 5))));
          m.startAt = now + countdown * 1000;
          m.endAt = m.startAt + m.durationSec * 1000;
          await this.ctx.storage.put("meta", m);
        }
        return { status: 200, body: this.info(now) };
      }

      case "end": {
        if (method !== "POST") break;
        if (!isHost) return { status: 403, body: { error: "host_only" } };
        if (this.status(now) !== "ended") {
          m.endedAt = now;
          if (!m.startAt) m.startAt = now;
          await this.ctx.storage.put("meta", m);
        }
        return { status: 200, body: this.results(now, { hostDetail: true }) };
      }

      case "results": {
        if (!isHost && this.status(now) !== "ended") return { status: 403, body: { error: "not_ended", ...this.info(now) } };
        const self = !isHost && body.pid ? this.auth(body) : null;
        return { status: 200, body: this.results(now, { hostDetail: isHost, selfId: self?.id }) };
      }
    }
    return { status: 404, body: { error: "unknown_action" } };
  }
}

async function readBody(request: Request, limit: number): Promise<Record<string, unknown> | null> {
  if (request.method !== "POST") return {};
  const text = await request.text();
  if (text.length > limit) return null;
  try {
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

    if (parts.length === 0 || (parts[0] === "api" && parts.length === 1)) {
      return json({ ok: true, service: "assessment-session" });
    }
    if (parts[0] !== "api" || parts[1] !== "session") return json({ error: "not_found" }, 404);

    const body = await readBody(request, MAX_QUIZ_BYTES + 50_000);
    if (body === null) return json({ error: "too_large" }, 413);

    if (parts[2] === "create") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      if (env.HOST_SECRET && body.teacherSecret !== env.HOST_SECRET) return json({ error: "teacher_secret" }, 403);
      const quiz = normalizeQuiz((body.quiz ?? {}) as Partial<Quiz>);
      if (!quiz.questions.length) return json({ error: "no_questions" }, 400);
      delete (quiz as Partial<Quiz>).cardImage;
      if (JSON.stringify(quiz).length > MAX_QUIZ_BYTES) return json({ error: "quiz_too_large" }, 413);
      const durationSec = Number(body.durationSec) || (quiz.timeLimitMinutes > 0 ? quiz.timeLimitMinutes * 60 : 300);
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = randomString(6, CODE_ALPHABET);
        const stub = env.SESSIONS.get(env.SESSIONS.idFromName(code));
        const reply = (await stub.handle("init", "POST", { code, quiz, durationSec })) as unknown as Reply;
        if (reply.status !== 409) return json(reply.body, reply.status);
      }
      return json({ error: "try_again" }, 503);
    }

    const code = String(parts[2] || "").toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return json({ error: "bad_code" }, 400);
    const action = parts[3] || "info";
    const input: Record<string, unknown> = { ...Object.fromEntries(url.searchParams), ...body };
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(code));
    const reply = (await stub.handle(action, request.method, input)) as unknown as Reply;
    return json(reply.body, reply.status);
  },
};
