/**
 * Permanent assessment results record (individual attempts + live group sessions).
 *
 *   POST /api/results/attempt  (site origins; 20 per 10 min per IP)  {quizId, quizSlug, quizTitle, year?, name,
 *        score, maxScore, percentage, correct, wrong, unanswered?, timeSec?, details:[...]} -> {ok, id}
 *   GET  /api/results/list     (admin Bearer) ?quiz=&year=&mode=individual|group&from=&to=(ms)&q=&details=1 -> {items}
 *   GET  /api/results/get      (admin Bearer) ?id= -> {item}
 *   POST /api/results/delete   (admin Bearer) {ids:[...]} -> {ok, deleted}
 *
 * Group sessions are written by the AssessmentSession Durable Object itself when a session ends
 * (one record per student, with the class rank), so they can't be faked from a browser.
 * Individual attempts are scored in the student's browser (the site is static), so a determined
 * student could post a fake score; records show "individual" so the teacher can tell them apart.
 */
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, originAllowed, reply, verifyToken, type AdminEnv } from "./admin";

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

export interface ResultsEnv extends AdminEnv {
  RESULTS: DurableObjectNamespace<ResultsStore>;
}

const MAX_RECORDS = 100_000;
const ATTEMPT_MAX = 20;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY = 300_000;
const MAX_DETAILS = 200;

const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const num = (v: unknown, min = 0, max = 1e6) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : 0;
};

export function cleanDetails(raw: unknown): ResultDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_DETAILS).map((d, i) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      n: num(o.n ?? i + 1, 1, 1000),
      prompt: str(o.prompt, 600),
      answer: str(o.answer, 600),
      correctAnswer: str(o.correctAnswer, 600),
      isCorrect: Boolean(o.isCorrect),
      answered: o.answered !== false,
      earned: num(o.earned, 0, 1000),
      points: num(o.points, 0, 1000),
      seconds: o.seconds == null ? null : num(o.seconds, 0, 86400),
    };
  });
}

/** Single instance ("main") holding every record in SQLite. */
export class ResultsStore extends DurableObject {
  private ready = false;

  private init() {
    if (this.ready) return;
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, quiz_id TEXT, quiz_slug TEXT, quiz_title TEXT, year INTEGER,
      name TEXT, session_code TEXT, score REAL, max_score REAL, percentage REAL, correct INTEGER, wrong INTEGER,
      unanswered INTEGER, time_sec INTEGER, finished_at INTEGER, rank INTEGER, group_size INTEGER, details TEXT)`);
    sql.exec("CREATE INDEX IF NOT EXISTS rec_time ON records(finished_at)");
    sql.exec("CREATE INDEX IF NOT EXISTS rec_session ON records(session_code)");
    sql.exec("CREATE TABLE IF NOT EXISTS rl (ip TEXT, t INTEGER)");
    this.ready = true;
  }

  private insert(r: ResultRecord) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      r.id, r.kind, r.quizId, r.quizSlug, r.quizTitle, r.year, r.name, r.sessionCode, r.score, r.maxScore, r.percentage,
      r.correct, r.wrong, r.unanswered, r.timeSec, r.finishedAt, r.rank, r.groupSize, JSON.stringify(r.details ?? []),
    );
  }

  private count(): number {
    return Number(this.ctx.storage.sql.exec("SELECT COUNT(*) AS c FROM records").one().c);
  }

  /** Returns false when this IP is over the limit. */
  async allowAttempt(ip: string): Promise<boolean> {
    this.init();
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM rl WHERE t < ?", now - ATTEMPT_WINDOW_MS);
    const c = Number(sql.exec("SELECT COUNT(*) AS c FROM rl WHERE ip = ?", ip).one().c);
    if (c >= ATTEMPT_MAX) return false;
    sql.exec("INSERT INTO rl VALUES (?, ?)", ip, now);
    return true;
  }

  async add(r: ResultRecord): Promise<"ok" | "full"> {
    this.init();
    if (this.count() >= MAX_RECORDS) return "full";
    this.insert(r);
    return "ok";
  }

  /** Replace every record of one group session (re-run when the teacher removes a student after the end). */
  async replaceSession(code: string, startedAt: number, rows: ResultRecord[]): Promise<void> {
    this.init();
    this.ctx.storage.sql.exec("DELETE FROM records WHERE session_code = ? AND finished_at >= ?", code, startedAt - 864e5);
    for (const r of rows) this.insert(r);
  }

  async list(f: { quiz?: string; year?: number; mode?: string; from?: number; to?: number; q?: string; details?: boolean }): Promise<ResultRecord[]> {
    this.init();
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (f.quiz) { where.push("(quiz_id = ? OR quiz_slug = ?)"); args.push(f.quiz, f.quiz); }
    if (f.year) { where.push("year = ?"); args.push(f.year); }
    if (f.mode === "individual" || f.mode === "group") { where.push("kind = ?"); args.push(f.mode); }
    if (f.from) { where.push("finished_at >= ?"); args.push(f.from); }
    if (f.to) { where.push("finished_at <= ?"); args.push(f.to); }
    if (f.q) { where.push("(LOWER(name) LIKE ? OR LOWER(session_code) LIKE ?)"); const like = `%${f.q.toLowerCase()}%`; args.push(like, like); }
    const cursor = this.ctx.storage.sql.exec(
      `SELECT * FROM records ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY finished_at DESC LIMIT 5000`,
      ...args,
    );
    return [...cursor].map((row) => toRecord(row, Boolean(f.details)));
  }

  async get(id: string): Promise<ResultRecord | null> {
    this.init();
    const rows = [...this.ctx.storage.sql.exec("SELECT * FROM records WHERE id = ?", id)];
    return rows[0] ? toRecord(rows[0], true) : null;
  }

  async remove(ids: string[]): Promise<number> {
    this.init();
    let n = 0;
    for (const id of ids.slice(0, 5000)) n += this.ctx.storage.sql.exec("DELETE FROM records WHERE id = ?", id).rowsWritten;
    return n;
  }
}

function toRecord(row: Record<string, SqlStorageValue>, withDetails: boolean): ResultRecord {
  const r: ResultRecord = {
    id: String(row.id),
    kind: row.kind === "group" ? "group" : "individual",
    quizId: String(row.quiz_id ?? ""),
    quizSlug: String(row.quiz_slug ?? ""),
    quizTitle: String(row.quiz_title ?? ""),
    year: row.year == null ? null : Number(row.year),
    name: String(row.name ?? ""),
    sessionCode: row.session_code == null ? null : String(row.session_code),
    score: Number(row.score ?? 0),
    maxScore: Number(row.max_score ?? 0),
    percentage: Number(row.percentage ?? 0),
    correct: Number(row.correct ?? 0),
    wrong: Number(row.wrong ?? 0),
    unanswered: Number(row.unanswered ?? 0),
    timeSec: row.time_sec == null ? null : Number(row.time_sec),
    finishedAt: Number(row.finished_at ?? 0),
    rank: row.rank == null ? null : Number(row.rank),
    groupSize: row.group_size == null ? null : Number(row.group_size),
  };
  if (withDetails) {
    try {
      r.details = JSON.parse(String(row.details || "[]")) as ResultDetail[];
    } catch {
      r.details = [];
    }
  }
  return r;
}

export function resultsStore(env: ResultsEnv) {
  return env.RESULTS.get(env.RESULTS.idFromName("main"));
}

export async function handleResults(request: Request, env: ResultsEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(origin)) return reply(null, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const store = resultsStore(env);
  const url = new URL(request.url);

  if (action === "attempt") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (!origin) return reply(null, { error: "origin_required" }, 403);
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(origin, { error: "too_large" }, 413);
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(text || "{}") as Record<string, unknown>;
    } catch {
      return reply(origin, { error: "bad_json" }, 400);
    }
    const name = str(b.name, 40);
    const quizId = str(b.quizId, 80);
    if (!name || !quizId) return reply(origin, { error: "missing_fields" }, 400);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!(await store.allowAttempt(ip))) return reply(origin, { error: "too_many" }, 429);
    const maxScore = num(b.maxScore, 0, 10000);
    const score = Math.min(num(b.score, 0, 10000), maxScore);
    const year = Number(b.year);
    const rec: ResultRecord = {
      id: `r_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
      kind: "individual",
      quizId,
      quizSlug: str(b.quizSlug, 120),
      quizTitle: str(b.quizTitle, 200),
      year: Number.isInteger(year) && year >= 1 && year <= 13 ? year : null,
      name,
      sessionCode: null,
      score,
      maxScore,
      percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
      correct: num(b.correct, 0, 1000),
      wrong: num(b.wrong, 0, 1000),
      unanswered: num(b.unanswered, 0, 1000),
      timeSec: b.timeSec == null ? null : num(b.timeSec, 0, 86400),
      finishedAt: Date.now(),
      rank: null,
      groupSize: null,
      details: cleanDetails(b.details),
    };
    const r = await store.add(rec);
    return r === "ok" ? reply(origin, { ok: true, id: rec.id }) : reply(origin, { error: "full" }, 507);
  }

  const session = await verifyToken(env, request.headers.get("Authorization"));
  if (!session) return reply(origin, { error: "unauthorized" }, 401);

  if (action === "list") {
    const p = url.searchParams;
    const items = await store.list({
      quiz: p.get("quiz") || undefined,
      year: Number(p.get("year")) || undefined,
      mode: p.get("mode") || undefined,
      from: Number(p.get("from")) || undefined,
      to: Number(p.get("to")) || undefined,
      q: (p.get("q") || "").trim().slice(0, 60) || undefined,
      details: p.get("details") === "1",
    });
    return reply(origin, { ok: true, items });
  }
  if (action === "get") {
    const item = await store.get(String(url.searchParams.get("id") || ""));
    return item ? reply(origin, { ok: true, item }) : reply(origin, { error: "not_found" }, 404);
  }
  if (action === "delete") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    let ids: string[] = [];
    try {
      const b = (await request.json()) as { ids?: unknown };
      ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    } catch {
      ids = [];
    }
    if (!ids.length) return reply(origin, { error: "no_ids" }, 400);
    return reply(origin, { ok: true, deleted: await store.remove(ids) });
  }
  return reply(origin, { error: "not_found" }, 404);
}
