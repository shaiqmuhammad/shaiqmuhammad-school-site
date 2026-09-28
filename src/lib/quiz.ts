import { extractYouTubeId, newId, slugify } from "@/lib/content";

export type QuestionType = "multiple_choice" | "true_false" | "short_answer" | "multi_select";

export type QuestionMedia = {
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  youtubeUrl?: string;
};

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Options for MC / multi-select / true-false */
  options: string[];
  /** Correct option index(es) for MC/TF/multi; for short_answer: accepted strings (case-insensitive) */
  correct: string[] | number[];
  points: number;
  media?: QuestionMedia;
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
  published: boolean;
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
export const QUIZ_RESULTS_PATH = "/content/quiz-results.json";
export const CERTIFICATE_PATH = "/content/certificate.json";
export const GITHUB_QUIZZES_PATH = "public/content/quizzes.json";
export const GITHUB_QUIZ_RESULTS_PATH = "public/content/quiz-results.json";
export const GITHUB_CERTIFICATE_PATH = "public/content/certificate.json";

export const QUIZ_LOCAL_RESULTS_KEY = "sm_quiz_local_results_v1";

export const emptyQuizzes: QuizzesData = { quizzes: [] };
export const emptyResults: QuizResultsData = { results: [] };

export const defaultCertificate: CertificateTemplate = {
  title: "Certificate of Achievement",
  subtitle: "This certifies that the student named below has successfully completed the quiz",
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

export function normalizeQuestion(raw: Partial<QuizQuestion>): QuizQuestion {
  const type = (["multiple_choice", "true_false", "short_answer", "multi_select"] as QuestionType[]).includes(
    raw.type as QuestionType,
  )
    ? (raw.type as QuestionType)
    : "multiple_choice";

  let options = Array.isArray(raw.options) ? raw.options.map(String) : [];
  if (type === "true_false" && options.length < 2) {
    options = ["True", "False"];
  }

  let correct: string[] | number[] = [];
  if (Array.isArray(raw.correct)) {
    if (type === "short_answer") {
      correct = raw.correct.map(String);
    } else {
      correct = raw.correct.map((c) => (typeof c === "number" ? c : Number(c))).filter((n) => !Number.isNaN(n));
    }
  }

  return {
    id: raw.id || newId("q"),
    type,
    prompt: String(raw.prompt || ""),
    options,
    correct,
    points: typeof raw.points === "number" && raw.points > 0 ? raw.points : 1,
    media: normalizeMedia(raw.media),
  };
}

export function normalizeQuiz(raw: Partial<Quiz>): Quiz {
  const title = String(raw.title || "Untitled quiz");
  return {
    id: raw.id || newId("quiz"),
    slug: (raw.slug || slugify(title) || newId("quiz")).toLowerCase(),
    title,
    description: String(raw.description || ""),
    cardImage: String(raw.cardImage || "").trim(),
    timeLimitMinutes: typeof raw.timeLimitMinutes === "number" && raw.timeLimitMinutes >= 0 ? raw.timeLimitMinutes : 10,
    published: Boolean(raw.published),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    questions: Array.isArray(raw.questions) ? raw.questions.map(normalizeQuestion) : [],
  };
}

export function normalizeQuizzes(data: Partial<QuizzesData> | null | undefined): QuizzesData {
  return {
    quizzes: Array.isArray(data?.quizzes) ? data!.quizzes!.map(normalizeQuiz) : [],
  };
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

export function listPublishedQuizzes(data: QuizzesData): Quiz[] {
  return data.quizzes
    .filter((q) => q.published)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getQuizBySlug(
  data: QuizzesData,
  slug: string,
  opts?: { includeDrafts?: boolean },
): Quiz | undefined {
  return data.quizzes.find((q) => q.slug === slug && (opts?.includeDrafts || q.published));
}

export function quizMaxScore(quiz: Quiz): number {
  return quiz.questions.reduce((sum, q) => sum + (q.points || 1), 0);
}

function answersMatchShort(student: string, accepted: string[]): boolean {
  const norm = student.trim().toLowerCase();
  if (!norm) return false;
  return accepted.some((a) => a.trim().toLowerCase() === norm);
}

/** Score a single question. `answer` is option index, array of indices, or string. */
export function scoreQuestion(question: QuizQuestion, answer: unknown): number {
  const pts = question.points || 1;
  if (question.type === "short_answer") {
    const accepted = (question.correct as string[]).map(String);
    return answersMatchShort(String(answer ?? ""), accepted) ? pts : 0;
  }
  if (question.type === "multi_select") {
    const correct = new Set((question.correct as number[]).map(Number));
    const given = new Set(
      (Array.isArray(answer) ? answer : []).map((n) => Number(n)).filter((n) => !Number.isNaN(n)),
    );
    if (correct.size !== given.size) return 0;
    for (const c of correct) if (!given.has(c)) return 0;
    return pts;
  }
  // multiple_choice / true_false
  const correctIdx = Number((question.correct as number[])[0]);
  const givenIdx = Number(answer);
  if (Number.isNaN(correctIdx) || Number.isNaN(givenIdx)) return 0;
  return correctIdx === givenIdx ? pts : 0;
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
  const base: QuizQuestion = {
    id: newId("q"),
    type,
    prompt: "",
    options: type === "true_false" ? ["True", "False"] : ["Option A", "Option B"],
    correct: type === "short_answer" ? [""] : type === "multi_select" ? [0] : [0],
    points: 1,
  };
  return base;
}

export function emptyQuiz(): Quiz {
  return {
    id: newId("quiz"),
    slug: "",
    title: "",
    description: "",
    cardImage: "",
    timeLimitMinutes: 10,
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
  return normalizeQuizzes(await fetchJson(QUIZZES_PATH, emptyQuizzes));
}

export async function loadQuizResultsData(): Promise<QuizResultsData> {
  return normalizeResults(await fetchJson(QUIZ_RESULTS_PATH, emptyResults));
}

export async function loadCertificateTemplate(): Promise<CertificateTemplate> {
  return normalizeCertificate(await fetchJson(CERTIFICATE_PATH, defaultCertificate));
}
