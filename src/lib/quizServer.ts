import { readFileSync } from "fs";
import { join } from "path";
import {
  defaultCertificate,
  emptyQuizzes,
  emptyResults,
  normalizeCertificate,
  normalizeQuizzes,
  normalizeResults,
  type CertificateTemplate,
  type QuizResultsData,
  type QuizzesData,
} from "@/lib/quiz";

function readJson<T>(relative: string, fallback: T): T {
  try {
    const filePath = join(process.cwd(), "public", "content", relative);
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function loadQuizzesSync(): QuizzesData {
  return normalizeQuizzes(readJson("quizzes.json", emptyQuizzes));
}

export function loadQuizResultsSync(): QuizResultsData {
  return normalizeResults(readJson("quiz-results.json", emptyResults));
}

export function loadCertificateSync(): CertificateTemplate {
  return normalizeCertificate(readJson("certificate.json", defaultCertificate));
}
