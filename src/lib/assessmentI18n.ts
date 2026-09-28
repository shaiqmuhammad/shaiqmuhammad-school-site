"use client";

import { useCallback } from "react";
import { useI18n, type Lang } from "@/lib/i18n";
import type { Quiz, QuizQuestion } from "@/lib/quiz";

/** UI strings for the assessment experience (individual player, group join/host, results). */
const EN = {
  assessment: "Assessment",
  assessments: "Assessments",
  allAssessments: "All assessments",
  practice: "Practice",
  listSubtitle: "Test what you have learned. Each assessment is timed — finish it to download your certificate.",
  homeSubtitle: "Timed assessments from your teacher — finish one to download your certificate.",
  none: "No assessments are available yet. Check back soon.",
  questionsMarks: "{q} questions · {m} marks",
  minutes: "{n} min",
  untimed: "untimed",
  start: "Start",
  startAssessment: "Start assessment",
  next: "Next",
  previous: "Previous",
  submit: "Submit",
  submitAnswers: "Submit answers",
  timeLeft: "Time left",
  question: "Question",
  questionOf: "Question {i} of {n}",
  marks: "{n} marks",
  mark: "1 mark",
  answered: "{a}/{n} answered",
  exit: "Exit",
  exitConfirm: "Leave the assessment? Your answers on this page will be lost.",
  unansweredConfirm: "Some questions are unanswered. Submit anyway?",
  yourName: "Your full name (shown on your certificate)",
  namePlaceholder: "e.g. Aisha Khan",
  timeLimit: "Time limit: {n} minutes",
  noTimeLimit: "No time limit",
  timerNote: "The timer starts when you press Start. When time runs out your answers are submitted automatically.",
  timeUp: "Time is up — your answers were submitted automatically.",
  complete: "Assessment complete",
  wellDone: "Well done, {name}!",
  score: "Score",
  percentage: "Percentage",
  correct: "Correct",
  wrong: "Wrong",
  incorrect: "Incorrect",
  skipped: "skipped",
  position: "Provisional position",
  positionNote: "Compared with results published by your teacher. Final positions update when your teacher publishes class results.",
  downloadCertificate: "Download PDF certificate",
  savedNote: "Your result is saved on this device. Please tell your teacher you finished so they can add it to the class results.",
  review: "Review your answers",
  yourAnswer: "Your answer",
  correctAnswer: "Correct answer",
  noAnswer: "No answer",
  notSet: "(not set)",
  explanation: "Explanation",
  selectAll: "Select all that apply",
  typeAnswer: "Type your answer",
  tapPicture: "Tap the correct picture.",
  picture: "Picture {l}",
  fillBlanks: "Type the missing word(s) in each box.",
  fillTitle: "Fill in the blank",
  matchHint: "Choose the matching item for each one on the left.",
  choose: "Choose…",
  orderHint: "Put the items in the correct order (drag them, or use the arrows).",
  moveUp: "Move up",
  moveDown: "Move down",
  blank: "Blank {n}",
  notAvailable: "This assessment is not available.",
  // Group
  groupAssessment: "Class assessment",
  joinTitle: "Join a class assessment",
  joinSubtitle: "Enter the code your teacher shows on the screen, or scan the QR code.",
  joinCode: "Join code",
  enterName: "Enter your name",
  join: "Join",
  joining: "Joining…",
  waitingRoom: "You're in! Waiting for your teacher to start…",
  studentsJoined: "{n} students joined",
  startsIn: "Starting in {s}",
  getReady: "Get ready!",
  waitingOthers: "Answers submitted. Waiting for the class to finish…",
  resultsBoard: "Class results",
  rank: "#",
  name: "Name",
  total: "Total",
  noStudents: "No students yet.",
  codeNotFound: "No session found for this code. Check the code and try again.",
  sessionEnded: "This session has already ended.",
  sessionFull: "This session is full.",
  networkError: "Connection problem — retrying…",
  offlineSaved: "Saved",
  saving: "Saving…",
  finished: "Finished",
  inProgress: "In progress",
  youLabel: "You",
  // Host
  hostTitle: "Start a group session",
  hostOnly: "Teacher sign-in required. Open Admin → Assessments → Start group session.",
  goToAdmin: "Go to admin sign-in",
  chooseAssessment: "Assessment",
  duration: "Duration (minutes)",
  teacherSecret: "Teacher secret (only if configured on the server)",
  createSession: "Create session",
  creating: "Creating…",
  scanToJoin: "Scan to join",
  orVisit: "or visit {url} and enter",
  startForEveryone: "Start for everyone",
  endNow: "End now",
  endConfirm: "End the assessment for everyone now?",
  newSession: "New session",
  liveProgress: "Live progress",
  disabledNote: "disabled for students",
  downloadCsv: "Download CSV",
  sessionCode: "Session {code}",
  status_lobby: "Waiting to start",
  status_countdown: "Starting…",
  status_running: "In progress",
  status_ended: "Finished",
  apiMissing: "The live session service is not reachable.",
} as const;

type Key = keyof typeof EN;

const AR: Record<Key, string> = {
  assessment: "تقييم",
  assessments: "التقييمات",
  allAssessments: "كل التقييمات",
  practice: "تدريب",
  listSubtitle: "اختبر ما تعلّمته. لكل تقييم وقت محدد — أكمله لتنزيل شهادتك.",
  homeSubtitle: "تقييمات محددة بوقت من معلمك — أكمل أحدها لتنزيل شهادتك.",
  none: "لا توجد تقييمات متاحة بعد. يرجى العودة قريبًا.",
  questionsMarks: "{q} أسئلة · {m} درجة",
  minutes: "{n} دقيقة",
  untimed: "بدون وقت",
  start: "ابدأ",
  startAssessment: "ابدأ التقييم",
  next: "التالي",
  previous: "السابق",
  submit: "إرسال",
  submitAnswers: "إرسال الإجابات",
  timeLeft: "الوقت المتبقي",
  question: "سؤال",
  questionOf: "السؤال {i} من {n}",
  marks: "{n} درجات",
  mark: "درجة واحدة",
  answered: "تمت الإجابة على {a}/{n}",
  exit: "خروج",
  exitConfirm: "هل تريد مغادرة التقييم؟ ستفقد إجاباتك في هذه الصفحة.",
  unansweredConfirm: "بعض الأسئلة بدون إجابة. هل تريد الإرسال على أي حال؟",
  yourName: "اسمك الكامل (يظهر على شهادتك)",
  namePlaceholder: "مثال: عائشة خان",
  timeLimit: "الوقت المحدد: {n} دقيقة",
  noTimeLimit: "بدون وقت محدد",
  timerNote: "يبدأ المؤقت عند الضغط على «ابدأ». عند انتهاء الوقت تُرسل إجاباتك تلقائيًا.",
  timeUp: "انتهى الوقت — تم إرسال إجاباتك تلقائيًا.",
  complete: "اكتمل التقييم",
  wellDone: "أحسنت يا {name}!",
  score: "الدرجة",
  percentage: "النسبة",
  correct: "صحيح",
  wrong: "خطأ",
  incorrect: "غير صحيح",
  skipped: "بدون إجابة",
  position: "الترتيب المبدئي",
  positionNote: "مقارنة بالنتائج التي نشرها معلمك. يتم تحديث الترتيب النهائي عند نشر نتائج الصف.",
  downloadCertificate: "تنزيل الشهادة (PDF)",
  savedNote: "تم حفظ نتيجتك على هذا الجهاز. أخبر معلمك أنك انتهيت ليضيفها إلى نتائج الصف.",
  review: "راجع إجاباتك",
  yourAnswer: "إجابتك",
  correctAnswer: "الإجابة الصحيحة",
  noAnswer: "لا توجد إجابة",
  notSet: "(غير محدد)",
  explanation: "الشرح",
  selectAll: "اختر كل الإجابات الصحيحة",
  typeAnswer: "اكتب إجابتك",
  tapPicture: "اضغط على الصورة الصحيحة.",
  picture: "الصورة {l}",
  fillBlanks: "اكتب الكلمة (الكلمات) الناقصة في كل مربع.",
  fillTitle: "املأ الفراغ",
  matchHint: "اختر العنصر المطابق لكل عنصر على اليمين.",
  choose: "اختر…",
  orderHint: "رتّب العناصر بالترتيب الصحيح (اسحبها أو استخدم الأسهم).",
  moveUp: "تحريك لأعلى",
  moveDown: "تحريك لأسفل",
  blank: "الفراغ {n}",
  notAvailable: "هذا التقييم غير متاح.",
  groupAssessment: "تقييم جماعي للصف",
  joinTitle: "انضم إلى تقييم الصف",
  joinSubtitle: "أدخل الرمز الذي يعرضه معلمك على الشاشة، أو امسح رمز QR.",
  joinCode: "رمز الانضمام",
  enterName: "أدخل اسمك",
  join: "انضمام",
  joining: "جارٍ الانضمام…",
  waitingRoom: "لقد انضممت! بانتظار أن يبدأ المعلم…",
  studentsJoined: "انضم {n} طالب",
  startsIn: "يبدأ خلال {s}",
  getReady: "استعد!",
  waitingOthers: "تم إرسال الإجابات. بانتظار انتهاء الصف…",
  resultsBoard: "نتائج الصف",
  rank: "#",
  name: "الاسم",
  total: "المجموع",
  noStudents: "لا يوجد طلاب بعد.",
  codeNotFound: "لا توجد جلسة بهذا الرمز. تحقق من الرمز وحاول مرة أخرى.",
  sessionEnded: "انتهت هذه الجلسة بالفعل.",
  sessionFull: "هذه الجلسة ممتلئة.",
  networkError: "مشكلة في الاتصال — جارٍ إعادة المحاولة…",
  offlineSaved: "تم الحفظ",
  saving: "جارٍ الحفظ…",
  finished: "انتهى",
  inProgress: "قيد التقدم",
  youLabel: "أنت",
  hostTitle: "ابدأ جلسة جماعية",
  hostOnly: "يلزم تسجيل دخول المعلم. افتح لوحة الإدارة ← التقييمات ← ابدأ جلسة جماعية.",
  goToAdmin: "الذهاب إلى تسجيل دخول المشرف",
  chooseAssessment: "التقييم",
  duration: "المدة (بالدقائق)",
  teacherSecret: "الرمز السري للمعلم (فقط إذا تم إعداده على الخادم)",
  createSession: "إنشاء الجلسة",
  creating: "جارٍ الإنشاء…",
  scanToJoin: "امسح للانضمام",
  orVisit: "أو افتح {url} وأدخل",
  startForEveryone: "ابدأ للجميع",
  endNow: "إنهاء الآن",
  endConfirm: "هل تريد إنهاء التقييم للجميع الآن؟",
  newSession: "جلسة جديدة",
  liveProgress: "التقدم المباشر",
  disabledNote: "معطّل للطلاب",
  downloadCsv: "تنزيل CSV",
  sessionCode: "الجلسة {code}",
  status_lobby: "بانتظار البدء",
  status_countdown: "جارٍ البدء…",
  status_running: "قيد التقدم",
  status_ended: "انتهى",
  apiMissing: "خدمة الجلسات المباشرة غير متاحة.",
};

export type AssessmentKey = Key;

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function assessmentText(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  return fill(lang === "ar" ? AR[key] : EN[key], vars);
}

/** `a("questionOf", {i: 1, n: 5})` → localized string. Also returns lang/dir. */
export function useAssessmentText() {
  const { lang, dir } = useI18n();
  const a = useCallback((key: Key, vars?: Record<string, string | number>) => assessmentText(lang, key, vars), [lang]);
  return { a, lang, dir };
}

/** Question copy with Arabic prompt/options/explanation swapped in (per item, falling back to English). */
export function localizeQuestion(q: QuizQuestion, lang: Lang): QuizQuestion {
  if (lang !== "ar") return q;
  const out: QuizQuestion = { ...q };
  if (q.promptAr?.trim()) {
    // fill_blank: only use the Arabic sentence when it has the same number of blanks
    const blanks = (s: string) => (s.match(/_{3,}/g) || []).length;
    if (q.type !== "fill_blank" || blanks(q.promptAr) === blanks(q.prompt)) out.prompt = q.promptAr;
  }
  if (q.optionsAr?.length && q.type !== "image_choice") {
    out.options = q.options.map((o, i) => q.optionsAr?.[i]?.trim() || o);
  }
  if (q.explanationAr?.trim()) out.explanation = q.explanationAr;
  return out;
}

export function localizedTitle(quiz: Pick<Quiz, "title" | "titleAr">, lang: Lang): string {
  return lang === "ar" && quiz.titleAr?.trim() ? quiz.titleAr : quiz.title;
}

export function localizedDescription(quiz: Pick<Quiz, "description" | "descriptionAr">, lang: Lang): string {
  return lang === "ar" && quiz.descriptionAr?.trim() ? quiz.descriptionAr : quiz.description;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
