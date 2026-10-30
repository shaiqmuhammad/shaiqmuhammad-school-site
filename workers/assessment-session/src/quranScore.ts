/**
 * Quran grading on three criteria, each 1–3 (1 Needs practice · 2 Good · 3 Excellent):
 *   m = Makharij (articulation points), t = Tajweed (rules), r = Recitation (fluency / memorisation accuracy).
 * Overall rule (documented for teachers):
 *   all three = 3            → green  "Excellent — Memorised"        (passed)
 *   any criterion = 1        → red    "Needs practice — Try again"   (not passed; same verses again)
 *   otherwise (mix of 2s/3s) → yellow "Good — Minor corrections"     (passed)
 * Older colour-only grades map to all three criteria equal (green 3/3/3, yellow 2/2/2, red 1/1/1).
 */
export type Level = 1 | 2 | 3;
/** t328: h = Memorisation (hifz), optional so older grades stay valid; when present it counts in the overall rule. */
export type Scores = { m: Level; t: Level; r: Level; h?: Level; notes?: { m?: string; t?: string; r?: string; h?: string }; fb?: { en: string; ar: string } };

const lv = (v: unknown): Level | null => (v === 1 || v === 2 || v === 3 ? v : [1, 2, 3].includes(Number(v)) ? (Number(v) as Level) : null);
export const overallOf = (s: Pick<Scores, "m" | "t" | "r" | "h">): "green" | "yellow" | "red" => {
  const v = [s.m, s.t, s.r, ...(s.h ? [s.h] : [])];
  return v.every((x) => x === 3) ? "green" : Math.min(...v) === 1 ? "red" : "yellow";
};
export const fromGrade = (g: string): Scores | null => {
  const l = g === "green" ? 3 : g === "yellow" ? 2 : g === "red" ? 1 : 0;
  return l ? { m: l as Level, t: l as Level, r: l as Level } : null;
};
export function parseScores(raw: unknown): Scores | null {
  const o = (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as Record<string, unknown> | null;
  if (!o) return null;
  const m = lv(o.m), t = lv(o.t), r = lv(o.r), h = lv(o.h);
  if (!m || !t || !r) return null;
  const n = (o.notes || {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);
  const fb = o.fb as { en?: string; ar?: string } | undefined;
  return { m, t, r, ...(h ? { h } : {}), notes: { m: s(n.m), t: s(n.t), r: s(n.r), h: s(n.h) }, fb: fb?.en ? { en: String(fb.en), ar: String(fb.ar || fb.en) } : undefined };
}

const LINES: Record<"m" | "t" | "r" | "h", Record<Level, [string, string]>> = {
  h: {
    3: ["Memorisation: excellent — recited fully from memory.", "الحفظ: ممتاز — تلاوة كاملة من الحفظ."],
    2: ["Memorisation: good — a few verses need more revision.", "الحفظ: جيد — بعض الآيات تحتاج مراجعة."],
    1: ["Memorisation: needs practice — revise the verses daily until they are secure.", "الحفظ: يحتاج تدريبًا — راجع الآيات يوميًا حتى تثبت."],
  },
  m: {
    3: ["Makharij: excellent — every letter comes from its correct point.", "المخارج: ممتازة — كل حرف يخرج من مخرجه الصحيح."],
    2: ["Makharij: good — polish a few letters (e.g. ح/ه, ع/ء, ق/ك).", "المخارج: جيدة — حسّن بعض الحروف (مثل ح/ه، ع/ء، ق/ك)."],
    1: ["Makharij: needs practice — slow down and work on the articulation points of the letters.", "المخارج: تحتاج تدريبًا — تمهّل وتدرّب على مخارج الحروف."],
  },
  t: {
    3: ["Tajweed: excellent — rules applied correctly.", "التجويد: ممتاز — الأحكام مطبّقة بشكل صحيح."],
    2: ["Tajweed: good — remember ghunnah, madd and qalqalah where they occur.", "التجويد: جيد — انتبه للغنة والمد والقلقلة في مواضعها."],
    1: ["Tajweed: needs practice — listen to the reciter and repeat the rules (ghunnah, madd, qalqalah).", "التجويد: يحتاج تدريبًا — استمع للقارئ وكرّر الأحكام (الغنة، المد، القلقلة)."],
  },
  r: {
    3: ["Recitation: fluent and accurate from memory.", "التلاوة: سلسة ودقيقة من الحفظ."],
    2: ["Recitation: mostly fluent — a few hesitations or small slips.", "التلاوة: سلسة غالبًا — بعض التردد أو الأخطاء البسيطة."],
    1: ["Recitation: keep practising until you can recite without stopping or mistakes.", "التلاوة: استمر في التدريب حتى تتلو دون توقف أو أخطاء."],
  },
};
const OVERALL: Record<string, [string, string]> = {
  green: ["Excellent — Memorised. MashaAllah, move on to the next verses!", "ممتاز — محفوظ. ما شاء الله، انتقل إلى الآيات التالية!"],
  yellow: ["Good — Minor corrections. Passed; keep polishing the points below.", "جيد — تصحيحات بسيطة. ناجح؛ واصل تحسين النقاط التالية."],
  red: ["Needs practice — Try again. Practise the same verses and record again.", "يحتاج تدريبًا — حاول مجددًا. تدرّب على الآيات نفسها وسجّل مرة أخرى."],
};

/** Student feedback text built from the three levels + per-criterion comments + mistake notes + the teacher's note. */
export function buildFeedback(s: Scores, mistakes: { text: string; note?: string }[] = [], teacherNote = ""): { en: string; ar: string } {
  const o = overallOf(s);
  const en: string[] = [OVERALL[o][0]], ar: string[] = [OVERALL[o][1]];
  for (const k of ["m", "t", "r", "h"] as const) {
    if (k === "h" && !s.h) continue;
    const note = s.notes?.[k];
    const lvK = s[k] as Level;
    en.push(`• ${LINES[k][lvK][0]}${note ? ` ${note}` : ""}`);
    ar.push(`• ${LINES[k][lvK][1]}${note ? ` ${note}` : ""}`);
  }
  if (mistakes.length) {
    const list = mistakes.slice(0, 12).map((x) => `${x.text}${x.note ? ` (${x.note})` : ""}`).join("، ");
    en.push(`• Words to fix: ${list}`);
    ar.push(`• كلمات للتصحيح: ${list}`);
  }
  if (teacherNote.trim()) { en.push(`• Teacher: ${teacherNote.trim()}`); ar.push(`• المعلم: ${teacherNote.trim()}`); }
  return { en: en.join("\n"), ar: ar.join("\n") };
}
