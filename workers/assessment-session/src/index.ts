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
 *   POST /api/session/:code/join          {name, deviceId?} -> {participantId, token, name} (403 "removed" for a removed device)
 *   GET  /api/session/:code/me?pid=&token=  participant state (+ shuffled questions once started)
 *   POST /api/session/:code/answer        {pid, token, questionId, answer}
 *   POST /api/session/:code/submit        {pid, token, answers?}
 *   POST /api/session/:code/start         {hostKey, countdownSec?}  -> sets startAt for everyone
 *   POST /api/session/:code/end           {hostKey}
 *   POST /api/session/:code/remove        {hostKey, pid}  -> student removed (device blocked from rejoining, left out of results)
 *   POST /api/session/:code/restore       {hostKey, pid}  -> let a removed student back in (answers kept)
 *   POST /api/session/:code/names         {hostKey, hide} -> hide/show student names on every screen
 *   GET  /api/session/:code/results[?hostKey=][&pid=&token=]
 *        class table (host: any time; everyone: after the end) with rank (ties share a rank) and a class summary.
 *        Per-question detail (answer, correct?, earned, time) is included for every student when hostKey is
 *        given, and for the student's own row when pid+token are given. The full assessment (answer key +
 *        explanations) is included with the detail so the board can show questions and correct answers.
 *
 * Admin publishing (site origins only, see ./admin.ts):
 *   POST /api/admin/login {password} -> {token, exp};  POST /api/admin/publish (Bearer token);  GET /api/admin/status
 * Moderated forum (see ./forum.ts): POST /api/forum/submit (public, pending); count/pending/approve/reject (admin).
 * Classroom activities (see ./activity.ts): /api/activity/create (admin) and /api/activity/:code/... (5-letter codes).
 * Results record (see ./results.ts): POST /api/results/attempt (site); list/get/delete (admin). Group sessions are
 * recorded automatically once they have ended.
 */
import { DurableObject } from "cloudflare:workers";
import { handleAdmin, type AdminEnv } from "./admin";
import { handleForum } from "./forum";
import { handleResults, resultsStore, type ResultRecord, type ResultsEnv } from "./results";
import { handleActivity, type ActivityEnv } from "./activity";
import { handleLms, type LmsEnv } from "./lms";
import { handleContact, handleMail } from "./mail/routes";
import { describeAnswer, describeCorrect, isAnswered, normalizeQuiz, quizMaxScore, scoreQuestion, wordBank, type Quiz, type QuizQuestion } from "../../../src/lib/quiz";

export { AdminGuard } from "./admin";
export { ForumQueue } from "./forum";
export { ResultsStore } from "./results";
export { ClassActivity } from "./activity";
export { LmsStore } from "./lms";

export interface Env extends AdminEnv, ResultsEnv, ActivityEnv, LmsEnv {
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
  /** Teacher hid names: students see "Student N" for everyone except themselves. */
  hideNames?: boolean;
  /** Fingerprint of the class results last written to the permanent results record. */
  recordedSig?: string;
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
  /** Random id stored on the student's device, used to stop a removed student rejoining. */
  deviceId?: string;
  /** Set when the teacher removed the student. */
  removedAt?: number;
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

/** Question as sent to students during the attempt: no answer key, no explanations (choose-the-word gets its full word bank). */
function forStudent(q: QuizQuestion): QuizQuestion {
  const copy: QuizQuestion = { ...q, correct: [] };
  if (q.type === "fill_blank") copy.options = wordBank(q);
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

  /** Students still in the session (not removed), in join order. */
  private active(): Participant[] {
    return [...this.participants.values()].filter((p) => !p.removedAt).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  /** Name as shown to this viewer: "Student N" when the teacher hid names (the host and the student themself see the real name). */
  private label(p: Participant, opts: { host?: boolean; selfId?: string }): string {
    if (!this.meta!.hideNames || opts.host || p.id === opts.selfId) return p.name;
    return `Student ${this.active().findIndex((x) => x.id === p.id) + 1}`;
  }

  private info(now: number, opts: { host?: boolean; selfId?: string } = {}) {
    const m = this.meta!;
    const q = this.quiz!;
    const active = this.active();
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
      participantCount: active.length,
      participants: active.map((p) => ({ id: p.id, name: this.label(p, opts), answered: this.answeredCount(p), submitted: Boolean(p.submittedAt) })),
      hideNames: Boolean(m.hideNames),
      ...(opts.host
        ? { removed: [...this.participants.values()].filter((p) => p.removedAt).sort((a, b) => a.removedAt! - b.removedAt!).map((p) => ({ id: p.id, name: p.name })) }
        : {}),
    };
  }

  private answeredCount(p: Participant): number {
    return this.quiz!.questions.filter((q) => isAnswered(q, p.answers[q.id])).length;
  }

  private results(now: number, opts: { hostDetail?: boolean; selfId?: string } = {}) {
    const q = this.quiz!;
    const maxScore = quizMaxScore(q);
    const startAt = this.meta!.startAt ?? null;
    const rows = this.active().map((p) => {
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
        id: p.id,
        name: this.label(p, { host: opts.hostDetail, selfId: opts.selfId }),
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
    return { ...this.info(now, { host: opts.hostDetail, selfId: opts.selfId }), rows: ranked, summary, ...(withDetail ? { quiz: q } : {}) };
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
    const out = await this.handleInner(action, method, body);
    try {
      await this.recordIfEnded();
    } catch {
      // The results record is best-effort; never break the live session because of it.
    }
    return out;
  }

  /** After the end, copy the class results (real names, rank, per-question detail) into the permanent results record. */
  private async recordIfEnded(): Promise<void> {
    if (!this.meta || !this.quiz || !this.env.RESULTS) return;
    const now = Date.now();
    if (this.status(now) !== "ended") return;
    const res = this.results(now, { hostDetail: true });
    const sig = JSON.stringify(res.rows.map((r) => [r.id, r.score, r.rank, r.submitted]));
    if (sig === this.meta.recordedSig) return;
    const q = this.quiz;
    const m = this.meta;
    const startAt = m.startAt ?? m.createdAt;
    const endAt = m.endedAt ?? m.endAt ?? now;
    const byId = new Map(q.questions.map((x) => [x.id, x]));
    const text = (lines: { text: string }[]) => lines.map((l) => l.text).join("; ");
    const records: ResultRecord[] = res.rows.map((r) => ({
      id: `g_${m.code}_${startAt.toString(36)}_${r.id}`,
      kind: "group",
      quizId: q.id,
      quizSlug: q.slug,
      quizTitle: q.title,
      year: typeof q.year === "number" ? q.year : null,
      name: r.name,
      sessionCode: m.code,
      score: r.score,
      maxScore: r.maxScore,
      percentage: r.percentage,
      correct: r.correct,
      wrong: r.wrong,
      unanswered: r.unanswered,
      timeSec: Math.max(0, Math.round(((r.finishedAt ?? endAt) - startAt) / 1000)),
      finishedAt: r.finishedAt ?? endAt,
      rank: r.rank,
      groupSize: res.rows.length,
      details: (r.details ?? []).map((d, i) => {
        const question = byId.get(d.questionId);
        return {
          n: i + 1,
          prompt: (question?.prompt ?? "").slice(0, 600),
          answer: question ? text(describeAnswer(question, d.answer)).slice(0, 600) : "",
          correctAnswer: question ? text(describeCorrect(question)).slice(0, 600) : "",
          isCorrect: d.isCorrect,
          answered: d.answered,
          earned: d.earned,
          points: d.points,
          seconds: d.secondsFromStart,
        };
      }),
    }));
    await resultsStore(this.env).replaceSession(m.code, startAt, records);
    m.recordedSig = sig;
    await this.ctx.storage.put("meta", m);
  }

  private async handleInner(action: string, method: string, body: Record<string, unknown>): Promise<Reply> {
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
        return { status: 200, body: this.info(now, { host: isHost }) };

      case "join": {
        if (method !== "POST") break;
        if (this.status(now) === "ended") return { status: 409, body: { error: "ended" } };
        if (this.participants.size >= MAX_PARTICIPANTS) return { status: 409, body: { error: "full" } };
        const deviceId = String(body.deviceId ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
        if (deviceId && [...this.participants.values()].some((x) => x.removedAt && x.deviceId === deviceId)) {
          return { status: 403, body: { error: "removed" } };
        }
        let name = cleanName(body.name);
        if (!name) return { status: 400, body: { error: "name_required" } };
        const taken = new Set(this.active().map((p) => p.name.toLowerCase()));
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
          ...(deviceId ? { deviceId } : {}),
        };
        await this.saveParticipant(p);
        return { status: 200, body: { participantId: p.id, token: p.token, name: p.name, ...this.info(now, { selfId: p.id }) } };
      }

      case "me": {
        const p = this.auth(body);
        if (!p) return { status: 403, body: { error: "unknown_participant" } };
        if (p.removedAt) return { status: 403, body: { error: "removed" } };
        const status = this.status(now);
        const byId = new Map(this.quiz.questions.map((q) => [q.id, q]));
        const questions =
          status === "running" || status === "ended"
            ? p.order.map((id) => byId.get(id)).filter((q): q is QuizQuestion => Boolean(q)).map(forStudent)
            : [];
        return {
          status: 200,
          body: {
            ...this.info(now, { selfId: p.id }),
            me: { id: p.id, name: p.name, submitted: Boolean(p.submittedAt), answers: p.answers, answered: this.answeredCount(p) },
            questions,
          },
        };
      }

      case "answer": {
        if (method !== "POST") break;
        const p = this.auth(body);
        if (!p) return { status: 403, body: { error: "unknown_participant" } };
        if (p.removedAt) return { status: 403, body: { error: "removed" } };
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
        if (p.removedAt) return { status: 403, body: { error: "removed" } };
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

      case "remove":
      case "restore": {
        if (method !== "POST") break;
        if (!isHost) return { status: 403, body: { error: "host_only" } };
        const p = this.participants.get(String(body.pid ?? ""));
        if (!p) return { status: 404, body: { error: "unknown_participant" } };
        if (action === "remove") p.removedAt = p.removedAt ?? now;
        else delete p.removedAt;
        await this.saveParticipant(p);
        return { status: 200, body: this.results(now, { hostDetail: true }) };
      }

      case "names": {
        if (method !== "POST") break;
        if (!isHost) return { status: 403, body: { error: "host_only" } };
        m.hideNames = Boolean(body.hide);
        await this.ctx.storage.put("meta", m);
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    // Admin publishing (own CORS: site origins only). See ./admin.ts.
    if (parts[0] === "api" && parts[1] === "admin") return handleAdmin(request, env, parts[2] || "");
    if (parts[0] === "api" && parts[1] === "forum") return handleForum(request, env, parts[2] || "");
    if (parts[0] === "api" && parts[1] === "results") return handleResults(request, env, parts[2] || "");
    if (parts[0] === "api" && parts[1] === "activity") return handleActivity(request, env, parts);
    if (parts[0] === "api" && parts[1] === "lms") return handleLms(request, env, parts[2] || "");
    if (parts[0] === "api" && parts[1] === "mail") return handleMail(request, env, parts[2] || "", ctx);
    if (parts[0] === "api" && parts[1] === "contact") return handleContact(request, env, ctx);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

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
