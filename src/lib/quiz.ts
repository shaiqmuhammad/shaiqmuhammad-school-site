import { extractYouTubeId, newId, slugify } from "@/lib/content";

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "multi_select"
  | "matching"
  | "fill_blank"
  | "ordering"
  | "image_choice";

/**
 * Types Admin can create. Students never type an answer: "short_answer" is legacy only and is
 * converted to multiple choice when a quiz is loaded; "fill_blank" is answered from a word bank.
 */
export const QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "multi_select",
  "matching",
  "fill_blank",
  "ordering",
  "image_choice",
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer (old — now multiple choice)",
  multi_select: "Choose all correct (select all that apply)",
  matching: "Matching",
  fill_blank: "Choose the word (word bank)",
  ordering: "Ordering / sequence",
  image_choice: "Image choice",
};

export type QuestionMedia = {
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  youtubeUrl?: string;
};

export type MatchPair = { left: string; right: string };

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  /** Question text. fill_blank: sentence with ___ (3+ underscores) for each blank */
  prompt: string;
  /** MC / TF / multi-select: option text. ordering: items in the CORRECT order. image_choice: image URLs */
  options: string[];
  /** MC/TF/image_choice: [index]; multi-select: indexes; short_answer: accepted strings. Unused for matching/fill_blank/ordering */
  correct: string[] | number[];
  /** matching: each left item with its correct right item (students see the right side shuffled) */
  pairs?: MatchPair[];
  /** fill_blank: accepted answers for each blank (case-insensitive, trimmed) */
  blanks?: string[][];
  /** Optional explanation shown on the review screen after submission */
  explanation?: string;
  points: number;
  media?: QuestionMedia;
  /** Optional Arabic question text (shown when the student picks العربية; falls back to `prompt`) */
  promptAr?: string;
  /** Optional Arabic option labels, same order as `options` (blank entries fall back to English) */
  optionsAr?: string[];
  /** Optional Arabic explanation for the review screen */
  explanationAr?: string;
};

export type Quiz = {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Optional card image for home / list (URL or data URL) */
  cardImage: string;
  /** Overall timer in minutes; 0 = no limit */
  timeLimitMinutes: number;
  /** Show the review screen (student answer, correct answer, explanation) after submitting */
  showAnswers: boolean;
  /** Offer the PDF certificate after an individual attempt (missing in older data = on). */
  certificateIndividual: boolean;
  /** Offer the PDF certificate (with class position) after a live group session (missing in older data = on). */
  certificateGroup: boolean;
  /**
   * "Show on website": listed on /assessments and the home page. Hidden assessments stay in Admin and the
   * teacher can still run them as a live group session. Missing in older data = shown.
   */
  visible: boolean;
  /**
   * "Active": students can start it on their own and join live sessions. An inactive assessment that is still
   * shown appears with "Not available yet". Older data: taken from `published` (Enabled=false → inactive).
   */
  active: boolean;
  /** Legacy "Enabled" flag, kept equal to `active` so older readers keep working. */
  published: boolean;
  /** Optional Arabic title / description */
  titleAr?: string;
  descriptionAr?: string;
  /** School year group (2–6) when this assessment belongs to a SOW topic; omit for general quizzes */
  year?: number;
  updatedAt: string;
  questions: QuizQuestion[];
};

export type QuizzesData = {
  quizzes: Quiz[];
};

export type QuizResult = {
  id: string;
  quizId: string;
  quizSlug: string;
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  finishedAt: string;
};

export type QuizResultsData = {
  results: QuizResult[];
};

export type CertificateTemplate = {
  title: string;
  subtitle: string;
  schoolName: string;
  borderColor: string;
  footerText: string;
  logoUrl: string;
  showPosition: boolean;
};

export const QUIZZES_PATH = "/content/quizzes.json";
export const ASSESSMENTS_SOW_PATH = "/content/assessments-sow.json";
export const QUIZ_RESULTS_PATH = "/content/quiz-results.json";
export const CERTIFICATE_PATH = "/content/certificate.json";
export const GITHUB_QUIZZES_PATH = "public/content/quizzes.json";
/** Seed SOW assessments — not overwritten by Admin “Publish assessments”. */
export const GITHUB_ASSESSMENTS_SOW_PATH = "public/content/assessments-sow.json";
export const GITHUB_QUIZ_RESULTS_PATH = "public/content/quiz-results.json";
export const GITHUB_CERTIFICATE_PATH = "public/content/certificate.json";

export const QUIZ_LOCAL_RESULTS_KEY = "sm_quiz_local_results_v1";

export const emptyQuizzes: QuizzesData = { quizzes: [] };
export const emptyResults: QuizResultsData = { results: [] };

export const defaultCertificate: CertificateTemplate = {
  title: "Certificate of Achievement",
  subtitle: "This certifies that the student named below has successfully completed the assessment",
  schoolName: "Shaiq Muhammad Learning Platform",
  borderColor: "#0f766e",
  footerText: "May knowledge be a light upon your path.",
  logoUrl: "",
  showPosition: true,
};

export function normalizeMedia(raw?: Partial<QuestionMedia> | null): QuestionMedia | undefined {
  if (!raw) return undefined;
  const media: QuestionMedia = {};
  if (raw.imageUrl?.trim()) media.imageUrl = raw.imageUrl.trim();
  if (raw.audioUrl?.trim()) media.audioUrl = raw.audioUrl.trim();
  if (raw.videoUrl?.trim()) media.videoUrl = raw.videoUrl.trim();
  if (raw.youtubeUrl?.trim()) media.youtubeUrl = raw.youtubeUrl.trim();
  return Object.keys(media).length ? media : undefined;
}

const BLANK_RE = /_{3,}/g;

export function countBlanks(prompt: string): number {
  return (prompt.match(BLANK_RE) || []).length;
}

export function splitBlanks(prompt: string): string[] {
  return prompt.split(BLANK_RE);
}

export function optionLetter(i: number): string {
  return String.fromCharCode(65 + i);
}

export function normalizeQuestion(raw: Partial<QuizQuestion>): QuizQuestion {
  const type = QUESTION_TYPES.includes(raw.type as QuestionType) || raw.type === "short_answer" ? (raw.type as QuestionType) : "multiple_choice";

  let options = Array.isArray(raw.options) ? raw.options.map(String) : [];
  if (type === "true_false" && options.length < 2) {
    options = ["True", "False"];
  }

  let correct: string[] | number[] = [];
  if (Array.isArray(raw.correct)) {
    if (type === "short_answer") {
      correct = raw.correct.map(String);
    } else if (type === "matching" || type === "fill_blank" || type === "ordering") {
      correct = [];
    } else {
      correct = raw.correct.map((c) => (typeof c === "number" ? c : Number(c))).filter((n) => !Number.isNaN(n));
    }
  }

  const q: QuizQuestion = {
    id: raw.id || newId("q"),
    type,
    prompt: String(raw.prompt || ""),
    options,
    correct,
    points: typeof raw.points === "number" && raw.points > 0 ? raw.points : 1,
    media: normalizeMedia(raw.media),
  };
  if (type === "matching") {
    q.pairs = (Array.isArray(raw.pairs) ? raw.pairs : []).map((p) => ({
      left: String(p?.left ?? ""),
      right: String(p?.right ?? ""),
    }));
  }
  if (type === "fill_blank") {
    q.blanks = (Array.isArray(raw.blanks) ? raw.blanks : []).map((b) =>
      Array.isArray(b) ? b.map(String) : [String(b ?? "")],
    );
  }
  const explanation = String(raw.explanation ?? "").trim();
  if (explanation) q.explanation = explanation;
  const promptAr = String(raw.promptAr ?? "").trim();
  if (promptAr) q.promptAr = promptAr;
  const optionsAr = Array.isArray(raw.optionsAr) ? raw.optionsAr.map((o) => String(o ?? "")) : [];
  if (optionsAr.some((o) => o.trim())) q.optionsAr = optionsAr;
  const explanationAr = String(raw.explanationAr ?? "").trim();
  if (explanationAr) q.explanationAr = explanationAr;
  return q;
}

/** Returns a problem description for the admin editor, or null when the question is valid. */
export function questionProblem(q: QuizQuestion): string | null {
  const filled = (list: string[]) => list.filter((x) => x.trim()).length;
  if (!q.prompt.trim()) return q.type === "fill_blank" ? "needs a sentence with ___ blanks" : "needs a question";
  switch (q.type) {
    case "short_answer":
      return filled(q.correct as string[]) ? null : "needs at least one accepted answer";
    case "fill_blank": {
      const n = countBlanks(q.prompt);
      if (!n) return "needs at least one ___ blank in the sentence";
      for (let i = 0; i < n; i++) if (!filled(q.blanks?.[i] || [])) return `blank ${i + 1} needs an accepted answer`;
      return null;
    }
    case "matching": {
      const pairs = q.pairs || [];
      if (pairs.length < 2) return "needs at least two pairs";
      return pairs.every((p) => p.left.trim() && p.right.trim()) ? null : "every pair needs both sides filled in";
    }
    case "ordering":
      return filled(q.options) >= 2 && filled(q.options) === q.options.length ? null : "needs at least two items (no empty items)";
    case "image_choice":
      if (filled(q.options) < 2 || filled(q.options) !== q.options.length) return "needs at least two pictures (no empty ones)";
      return (q.correct as number[]).length ? null : "tick the correct picture";
    default:
      if (q.options.length < 2) return "needs at least two options";
      return (q.correct as number[]).length ? null : "tick the correct answer";
  }
}

export function normalizeQuiz(raw: Partial<Quiz>): Quiz {
  const title = String(raw.title || "Untitled assessment");
  const titleAr = String(raw.titleAr ?? "").trim();
  const descriptionAr = String(raw.descriptionAr ?? "").trim();
  // Migration: older data only has `published` ("Enabled"); Enabled=false becomes Active=false.
  const active = typeof raw.active === "boolean" ? raw.active : Boolean(raw.published);
  return {
    id: raw.id || newId("quiz"),
    slug: (raw.slug || slugify(title) || newId("quiz")).toLowerCase(),
    title,
    description: String(raw.description || ""),
    cardImage: String(raw.cardImage || "").trim(),
    timeLimitMinutes: typeof raw.timeLimitMinutes === "number" && raw.timeLimitMinutes >= 0 ? raw.timeLimitMinutes : 10,
    showAnswers: raw.showAnswers !== false,
    certificateIndividual: raw.certificateIndividual !== false,
    certificateGroup: raw.certificateGroup !== false,
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    active,
    published: active,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    questions: Array.isArray(raw.questions) ? withoutTyping(raw.questions.map(normalizeQuestion)) : [],
    ...(titleAr ? { titleAr } : {}),
    ...(descriptionAr ? { descriptionAr } : {}),
    ...(typeof raw.year === "number" && raw.year >= 1 && raw.year <= 13 ? { year: Math.round(raw.year) } : {}),
  };
}

/** Small stable hash (for deterministic option order). */
function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Wrong-answer candidates for a converted question, taken from the other answers in the same quiz. */
function distractorsFor(target: QuizQuestion, all: QuizQuestion[], answers: string[], want: number): string[] {
  const taken = new Set(answers.map(normText));
  const out: string[] = [];
  const add = (t: string) => {
    const v = String(t ?? "").trim();
    if (!v || v.length > 60 || taken.has(normText(v)) || /^(true|false)$/i.test(v) || /^(\/|https?:|data:)/i.test(v)) return;
    taken.add(normText(v));
    out.push(v);
  };
  const first = answers[0] ?? "";
  if (/^\d+$/.test(first.trim())) {
    const n = Number(first.trim());
    [n - 1, n + 10, Math.round(n / 2), n + 1].filter((x) => x > 0).forEach((x) => add(String(x)));
  }
  const pool: string[] = [];
  for (const q of all) {
    if (q === target) continue;
    if (q.type === "multiple_choice" || q.type === "multi_select" || q.type === "ordering") pool.push(...q.options);
    if (q.type === "matching") pool.push(...(q.pairs || []).map((p) => p.right));
    if (q.type === "fill_blank") pool.push(...(q.blanks || []).map((b) => b[0] || ""));
  }
  const h = hashText(target.id);
  for (let i = 0; i < pool.length && out.length < want; i++) add(pool[(i + h) % pool.length]);
  return out.slice(0, want);
}

/**
 * No question makes a student type. Legacy short-answer questions become multiple choice (the
 * first accepted answer plus wrong answers from the same quiz, in a stable shuffled order), and
 * choose-the-word (fill_blank) questions get at least two extra words in their word bank.
 */
function withoutTyping(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.map((q) => {
    if (q.type === "short_answer") {
      const accepted = (q.correct as string[]).map((c) => String(c).trim()).filter(Boolean);
      const answer = accepted[0] || "";
      const wrong = [...q.options.filter((o) => o.trim() && !accepted.some((a) => normText(a) === normText(o)))];
      if (wrong.length < 3) wrong.push(...distractorsFor(q, questions, [...accepted, ...wrong], 3 - wrong.length));
      const options = [answer, ...wrong.slice(0, 3)];
      const at = hashText(q.id) % options.length;
      options.splice(0, 1);
      options.splice(at, 0, answer);
      return { ...q, type: "multiple_choice" as QuestionType, options, correct: [at], optionsAr: undefined };
    }
    if (q.type === "fill_blank") {
      const answers = (q.blanks || []).map((b) => b[0] || "").filter(Boolean);
      const extra = q.options.filter((o) => o.trim());
      if (extra.length < 2) {
        const more = distractorsFor(q, questions, [...answers, ...extra, ...(q.blanks || []).flat()], 2 - extra.length);
        return { ...q, options: [...extra, ...more] };
      }
    }
    return q;
  });
}

/** Words a student chooses from for a fill_blank question: each blank's answer + the extra words, A–Z. */
export function wordBank(q: QuizQuestion): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of [...(q.blanks || []).map((b) => b[0] || ""), ...q.options]) {
    const v = String(w ?? "").trim();
    if (v && !seen.has(normText(v))) {
      seen.add(normText(v));
      words.push(v);
    }
  }
  return words.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
}

export function normalizeQuizzes(data: Partial<QuizzesData> | null | undefined): QuizzesData {
  return {
    quizzes: Array.isArray(data?.quizzes) ? data!.quizzes!.map(normalizeQuiz) : [],
  };
}

/**
 * Merge scheme-of-work seed assessments (assessments-sow.json, owned by the repo) with the
 * CMS-published quizzes.json (owned by Admin). A quizzes.json entry with the same `id` or `slug`
 * as a seed replaces that seed, so Admin can edit or disable a seed without touching the seed file.
 * Order: CMS-only assessments first, then seeds (or their overrides) by year.
 */
export function mergeQuizzes(sow: QuizzesData, cms: QuizzesData): QuizzesData {
  const seeds = normalizeQuizzes(sow).quizzes;
  const overrides = normalizeQuizzes(cms).quizzes;
  const used = new Set<number>();
  const merged: Quiz[] = [];
  for (const seed of seeds) {
    const i = overrides.findIndex((o, idx) => !used.has(idx) && (o.id === seed.id || o.slug === seed.slug));
    if (i >= 0) {
      used.add(i);
      merged.push({ ...overrides[i], year: overrides[i].year ?? seed.year });
    } else merged.push(seed);
  }
  merged.sort((a, b) => (a.year ?? 99) - (b.year ?? 99));
  const cmsOnly = overrides.filter((_, idx) => !used.has(idx));
  return { quizzes: [...cmsOnly, ...merged] };
}

/** Seeds from the last loadQuizzesData() call (client only). */
let sowSeedCache: Quiz[] = [];

export function isSowSeed(id: string): boolean {
  return sowSeedCache.some((q) => q.id === id);
}

/**
 * What Admin should write to quizzes.json: everything except seeds that are still identical
 * to assessments-sow.json (so future seed updates keep flowing in).
 */
export function quizzesForPublish(data: QuizzesData): QuizzesData {
  const seedJson = new Map(sowSeedCache.map((q) => [q.id, JSON.stringify(normalizeQuiz(q))]));
  return normalizeQuizzes({
    quizzes: normalizeQuizzes(data).quizzes.filter((q) => seedJson.get(q.id) !== JSON.stringify(normalizeQuiz(q))),
  });
}

export function normalizeResults(data: Partial<QuizResultsData> | null | undefined): QuizResultsData {
  const results = Array.isArray(data?.results) ? data!.results! : [];
  return {
    results: results.map((r) => ({
      id: r.id || newId("result"),
      quizId: String(r.quizId || ""),
      quizSlug: String(r.quizSlug || ""),
      name: String(r.name || "Student"),
      score: Number(r.score) || 0,
      maxScore: Number(r.maxScore) || 0,
      percentage: Number(r.percentage) || 0,
      finishedAt: r.finishedAt || new Date().toISOString(),
    })),
  };
}

export function normalizeCertificate(raw: Partial<CertificateTemplate> | null | undefined): CertificateTemplate {
  return {
    title: raw?.title?.trim() || defaultCertificate.title,
    subtitle: raw?.subtitle?.trim() || defaultCertificate.subtitle,
    schoolName: raw?.schoolName?.trim() || defaultCertificate.schoolName,
    borderColor: raw?.borderColor?.trim() || defaultCertificate.borderColor,
    footerText: raw?.footerText?.trim() || defaultCertificate.footerText,
    logoUrl: raw?.logoUrl?.trim() || "",
    showPosition: raw?.showPosition !== false,
  };
}

/** Assessments shown on the website (/assessments and home cards), active or not. */
export function listPublishedQuizzes(data: QuizzesData): Quiz[] {
  return data.quizzes
    .filter((q) => q.visible)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getQuizBySlug(
  data: QuizzesData,
  slug: string,
  opts?: { includeDrafts?: boolean },
): Quiz | undefined {
  return data.quizzes.find((q) => q.slug === slug && (opts?.includeDrafts || q.visible));
}

export function quizMaxScore(quiz: Quiz): number {
  return quiz.questions.reduce((sum, q) => sum + (q.points || 1), 0);
}

function normText(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function answersMatchShort(student: string, accepted: string[]): boolean {
  const norm = normText(student);
  if (!norm) return false;
  return accepted.some((a) => normText(a) === norm);
}

function numList(answer: unknown): number[] {
  return Array.isArray(answer) ? answer.map((n) => Number(n)) : [];
}

/**
 * Score a single question (full marks only when completely correct).
 * Answers: MC/TF/image_choice index; multi_select index[]; short_answer string;
 * matching number[] (chosen pair index per left item, -1 = none); fill_blank string[]; ordering index[] in student order.
 */
export function scoreQuestion(question: QuizQuestion, answer: unknown): number {
  const pts = question.points || 1;
  switch (question.type) {
    case "short_answer": {
      const accepted = (question.correct as string[]).map(String);
      return answersMatchShort(String(answer ?? ""), accepted) ? pts : 0;
    }
    case "multi_select": {
      const correct = new Set((question.correct as number[]).map(Number));
      const given = new Set(numList(answer).filter((n) => !Number.isNaN(n)));
      if (correct.size !== given.size) return 0;
      for (const c of correct) if (!given.has(c)) return 0;
      return pts;
    }
    case "matching": {
      const pairs = question.pairs || [];
      if (!pairs.length) return 0;
      const given = numList(answer);
      return pairs.every((p, i) => {
        const chosen = pairs[given[i]];
        return chosen !== undefined && normText(chosen.right) === normText(p.right);
      })
        ? pts
        : 0;
    }
    case "fill_blank": {
      const n = countBlanks(question.prompt);
      if (!n) return 0;
      const given = Array.isArray(answer) ? answer.map((a) => String(a ?? "")) : [];
      for (let i = 0; i < n; i++) {
        if (!answersMatchShort(given[i] ?? "", question.blanks?.[i] || [])) return 0;
      }
      return pts;
    }
    case "ordering": {
      const n = question.options.length;
      const given = numList(answer);
      if (n < 2 || given.length !== n) return 0;
      return given.every((idx, pos) => normText(question.options[idx] ?? "\\u0000") === normText(question.options[pos]))
        ? pts
        : 0;
    }
    default: {
      // multiple_choice / true_false / image_choice
      const correctIdx = Number((question.correct as number[])[0]);
      const givenIdx = typeof answer === "number" ? answer : Number.NaN;
      if (Number.isNaN(correctIdx) || Number.isNaN(givenIdx)) return 0;
      return correctIdx === givenIdx ? pts : 0;
    }
  }
}

export function isAnswered(question: QuizQuestion, answer: unknown): boolean {
  if (answer === undefined || answer === null || answer === "") return false;
  switch (question.type) {
    case "matching":
      return numList(answer).length === (question.pairs || []).length && numList(answer).every((n) => n >= 0);
    case "fill_blank": {
      const n = countBlanks(question.prompt);
      const given = Array.isArray(answer) ? answer.map((a) => String(a ?? "").trim()) : [];
      return n > 0 && given.length >= n && given.slice(0, n).every(Boolean);
    }
    case "multi_select":
    case "ordering":
      return Array.isArray(answer) && answer.length > 0;
    default:
      return typeof answer === "number" || String(answer).trim() !== "";
  }
}

export type ReviewLine = { text: string; image?: string };

/** Human-readable version of a student's answer for the review screen. */
export function describeAnswer(q: QuizQuestion, answer: unknown): ReviewLine[] {
  if (!isAnswered(q, answer) && q.type !== "matching" && q.type !== "fill_blank") return [];
  switch (q.type) {
    case "short_answer":
      return [{ text: String(answer) }];
    case "multi_select":
      return numList(answer)
        .sort((a, b) => a - b)
        .map((i) => ({ text: q.options[i] ?? "?" }));
    case "matching": {
      const pairs = q.pairs || [];
      const given = numList(answer);
      if (!given.some((n) => n >= 0)) return [];
      return pairs.map((p, i) => ({ text: `${p.left} \\u2192 ${pairs[given[i]]?.right ?? "(no answer)"}` }));
    }
    case "fill_blank": {
      const given = Array.isArray(answer) ? answer.map((a) => String(a ?? "").trim()) : [];
      if (!given.some(Boolean)) return [];
      return Array.from({ length: countBlanks(q.prompt) }, (_, i) => ({ text: `Blank ${i + 1}: ${given[i] || "(empty)"}` }));
    }
    case "ordering":
      return numList(answer).map((idx, pos) => ({ text: `${pos + 1}. ${q.options[idx] ?? "?"}` }));
    case "image_choice": {
      const i = Number(answer);
      return [{ text: `Picture ${optionLetter(i)}`, image: q.options[i] }];
    }
    default:
      return [{ text: q.options[Number(answer)] ?? "?" }];
  }
}

/** Human-readable correct answer for the review screen. */
export function describeCorrect(q: QuizQuestion): ReviewLine[] {
  switch (q.type) {
    case "short_answer":
      return [{ text: (q.correct as string[]).filter((a) => a.trim()).join(" / ") }];
    case "matching":
      return (q.pairs || []).map((p) => ({ text: `${p.left} \\u2192 ${p.right}` }));
    case "fill_blank":
      return Array.from({ length: countBlanks(q.prompt) }, (_, i) => ({
        text: `Blank ${i + 1}: ${(q.blanks?.[i] || []).filter((a) => a.trim()).join(" / ")}`,
      }));
    case "ordering":
      return q.options.map((o, i) => ({ text: `${i + 1}. ${o}` }));
    case "image_choice":
      return (q.correct as number[]).map((i) => ({ text: `Picture ${optionLetter(i)}`, image: q.options[i] }));
    default:
      return (q.correct as number[]).map((i) => ({ text: q.options[i] ?? "?" }));
  }
}

export function scoreQuiz(
  quiz: Quiz,
  answers: Record<string, unknown>,
): { score: number; maxScore: number; percentage: number } {
  let score = 0;
  const maxScore = quizMaxScore(quiz);
  for (const q of quiz.questions) {
    score += scoreQuestion(q, answers[q.id]);
  }
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
  return { score, maxScore, percentage };
}

/**
 * Rank among published results for this quiz (1 = highest score, then earliest finish).
 * Includes the provisional attempt if provided.
 */
export function computeRank(
  published: QuizResult[],
  quizId: string,
  provisional?: Pick<QuizResult, "score" | "finishedAt" | "id">,
): { rank: number; total: number } {
  const list = published.filter((r) => r.quizId === quizId);
  const all = provisional
    ? [...list.filter((r) => r.id !== provisional.id), { ...provisional, quizId } as QuizResult]
    : list;
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.finishedAt.localeCompare(b.finishedAt);
  });
  if (!provisional) return { rank: 0, total: all.length };
  const idx = all.findIndex((r) => r.id === provisional.id);
  return { rank: idx >= 0 ? idx + 1 : all.length, total: all.length };
}

export function youtubeIdFromMedia(media?: QuestionMedia): string | null {
  if (!media?.youtubeUrl) return null;
  return extractYouTubeId(media.youtubeUrl);
}

export function emptyQuestion(type: QuestionType = "multiple_choice"): QuizQuestion {
  const base: QuizQuestion = { id: newId("q"), type, prompt: "", options: [], correct: [], points: 1 };
  switch (type) {
    case "true_false":
      return { ...base, options: ["True", "False"], correct: [0] };
    case "short_answer":
      return { ...base, correct: [""] };
    case "matching":
      return { ...base, pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
    case "fill_blank":
      return { ...base, blanks: [[""]] };
    case "ordering":
      return { ...base, options: ["First item", "Second item", "Third item"] };
    case "image_choice":
      return { ...base, options: ["", ""], correct: [0] };
    default:
      return { ...base, options: ["Option A", "Option B"], correct: [0] };
  }
}

export function emptyQuiz(): Quiz {
  return {
    id: newId("quiz"),
    slug: "",
    title: "",
    description: "",
    cardImage: "",
    timeLimitMinutes: 5,
    showAnswers: true,
    certificateIndividual: true,
    certificateGroup: true,
    visible: true,
    active: true,
    published: true,
    updatedAt: new Date().toISOString(),
    questions: [emptyQuestion("multiple_choice")],
  };
}

export function loadLocalResults(): QuizResultsData {
  if (typeof window === "undefined") return emptyResults;
  try {
    const raw = localStorage.getItem(QUIZ_LOCAL_RESULTS_KEY);
    if (!raw) return emptyResults;
    return normalizeResults(JSON.parse(raw) as QuizResultsData);
  } catch {
    return emptyResults;
  }
}

export function saveLocalResults(data: QuizResultsData): void {
  localStorage.setItem(QUIZ_LOCAL_RESULTS_KEY, JSON.stringify(normalizeResults(data)));
}

export function appendLocalResult(result: QuizResult): void {
  const current = loadLocalResults();
  current.results.push(result);
  saveLocalResults(current);
}

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function loadQuizzesData(): Promise<QuizzesData> {
  const [cms, sow] = await Promise.all([
    fetchJson(QUIZZES_PATH, emptyQuizzes),
    fetchJson(ASSESSMENTS_SOW_PATH, emptyQuizzes),
  ]);
  sowSeedCache = normalizeQuizzes(sow).quizzes;
  return mergeQuizzes(normalizeQuizzes(sow), normalizeQuizzes(cms));
}

export async function loadQuizResultsData(): Promise<QuizResultsData> {
  return normalizeResults(await fetchJson(QUIZ_RESULTS_PATH, emptyResults));
}

export async function loadCertificateTemplate(): Promise<CertificateTemplate> {
  return normalizeCertificate(await fetchJson(CERTIFICATE_PATH, defaultCertificate));
}
