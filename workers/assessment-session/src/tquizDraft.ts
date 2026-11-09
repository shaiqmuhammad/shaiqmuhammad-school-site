export type DraftQ = {
  id: string;
  type: "multiple_choice" | "true_false" | "multi_select" | "matching" | "fill_blank" | "ordering";
  prompt: string;
  options: string[];
  correct: number[];
  points: number;
  promptAr?: string;
  optionsAr?: string[];
  pairs?: { left: string; right: string }[];
  blanks?: string[][];
  explanation?: string;
  sc?: string;
};
export type CurSnap = {
  id: string;
  subject: string;
  yr: string;
  term: string;
  title: string;
  titleAr: string;
  objectives: string;
  objectivesAr: string;
  sc: string[];
  scAr: string[];
  lessons: { title: string; note?: string }[];
  notes: string;
  wkFrom: number;
};
export type BankItem = { quizId: string; quizTitle: string; subject?: string; yr?: string; question: DraftQ };

type AiEnv = { AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> } };

const SC_MAX = 3;
const TYPES = new Set(["multiple_choice", "true_false", "multi_select", "matching", "fill_blank", "ordering"]);

export function unitFromRow(r: Record<string, unknown>): CurSnap {
  return {
    id: String(r.id || ""),
    subject: String(r.subject || ""),
    yr: String(r.yr || ""),
    term: String(r.term || ""),
    title: String(r.title || ""),
    titleAr: String(r.title_ar || r.titleAr || ""),
    objectives: String(r.objectives || ""),
    objectivesAr: String(r.obj_ar || r.objectivesAr || ""),
    sc: parseList(r.sc),
    scAr: parseList(r.sc_ar ?? r.scAr),
    lessons: parseLessons(r.lessons),
    notes: String(r.notes || ""),
    wkFrom: Number(r.wk_from ?? r.wkFrom ?? 0) || 0,
  };
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  const s = String(v || "").trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map((x) => String(x || "").trim()).filter(Boolean);
  } catch { /* lines */ }
  return s.split(/\n+/).map((x) => x.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean);
}

function parseLessons(v: unknown): { title: string; note?: string }[] {
  let raw: unknown = v;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const o = x && typeof x === "object" ? x as { title?: string; note?: string } : { title: String(x || "") };
    return { title: String(o.title || "").trim(), ...(o.note ? { note: String(o.note) } : {}) };
  }).filter((l) => l.title);
}

function nid() {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function family(s: string) {
  return s.replace(/\s*[AB]$/i, "").trim().toLowerCase();
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function asIdea(s: string) {
  return s.replace(/^(i can|pupils can|students can|يمكنني|أستطيع)\s+/i, "").replace(/[.。]+$/, "").trim();
}

function extractJson(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fence ? fence[1] : raw;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(src.slice(start, end + 1));
}

const PADS = [
  "This is not part of this lesson.",
  "This belongs to a different topic.",
  "Students do not need to practise this.",
];

function mcq(prompt: string, correctText: string, distractors: string[], sc?: string, promptAr?: string): DraftQ {
  const uniq = [correctText, ...distractors.filter((d) => d && d !== correctText)];
  for (const p of PADS) if (uniq.length < 4 && !uniq.includes(p)) uniq.push(p);
  const options = shuffle(uniq).slice(0, 4);
  if (!options.includes(correctText)) options[0] = correctText;
  const idx = options.indexOf(correctText);
  return {
    id: nid(),
    type: "multiple_choice",
    prompt,
    options,
    correct: [idx < 0 ? 0 : idx],
    points: 1,
    ...(sc ? { sc } : {}),
    ...(promptAr ? { promptAr } : {}),
  };
}

function tf(idea: string, sc?: string): DraftQ {
  return {
    id: nid(),
    type: "true_false",
    prompt: `True or false: ${idea}.`,
    options: ["True", "False"],
    correct: [0],
    points: 1,
    ...(sc ? { sc } : {}),
  };
}

/** Starter questions built only from this topic’s success criteria and objectives (no AI). */
export function scaffoldFromCurriculum(u: CurSnap): DraftQ[] {
  const ideas = (u.sc.length ? u.sc : u.objectives.split(/\n+/).map((x) => x.trim()).filter(Boolean)).map(asIdea).filter(Boolean);
  const out: DraftQ[] = [];
  if (!ideas.length) {
    const title = u.title || "this lesson";
    out.push(mcq(
      `What is this lesson about?`,
      title,
      [`A different topic in ${u.subject || "this subject"}`, "Something we study later in the year", "A topic from another subject"],
    ));
    return out;
  }
  ideas.forEach((idea, i) => {
    if (out.length >= 15) return;
    const sc = u.sc.length ? `${u.id}#${i}` : undefined;
    const others = ideas.filter((_, j) => j !== i);
    out.push(mcq(
      `Which statement is correct for “${u.title || "this lesson"}”?`,
      idea,
      others.slice(0, 3),
      sc,
    ));
    if (out.length < 15) out.push(tf(idea, sc));
  });
  return out.slice(0, 15);
}

const SYSTEM = `You write classroom assessment questions for teachers.
Follow the given curriculum exactly. Use only the topic title, objectives, success criteria, lessons and notes provided.
Never invent Qur’an verses, hadith, scripture references, or facts that are not in the curriculum text.
Return JSON only, no markdown, no commentary.
Schema: {"questions":[{"type":"multiple_choice"|"true_false"|"multi_select"|"matching"|"fill_blank"|"ordering","prompt":"string","promptAr":"optional","options":["..."],"optionsAr":["optional"],"correct":[0],"pairs":[{"left":"","right":""}],"blanks":[["accepted"]],"explanation":"optional","sc":"0"}]}
Rules:
- 1–2 questions per success criterion (never more than 3).
- sc is the success-criterion index as a number or "n".
- multiple_choice / true_false / multi_select need options and correct indexes.
- true_false options must be ["True","False"] (or Arabic equivalents) with correct [0] or [1].
- matching needs pairs; fill_blank needs a prompt with ___ and blanks; ordering lists items in the correct order in options.
- Prefer multiple_choice and true_false for younger years.
- Add Arabic prompt/options when the curriculum includes Arabic.`;

function userMsg(u: CurSnap): string {
  const islamic = /islam|quran|qur’an|qur'an|tarbiyah|tafsir|تفس|ترب/i.test(`${u.subject} ${u.title}`);
  const sc = u.sc.map((s, i) => `${i}. ${s}${u.scAr[i] ? ` | ${u.scAr[i]}` : ""}`).join("\n") || "(none listed)";
  const lessons = u.lessons.map((l) => l.title + (l.note ? ` — ${l.note}` : "")).join("\n") || "(none)";
  return `Subject: ${u.subject || "(unspecified)"}
Year: ${u.yr || "?"}
Term: ${u.term || "?"}
Week: ${u.wkFrom || "?"}
Topic: ${u.title}${u.titleAr ? ` | ${u.titleAr}` : ""}
Objectives:
${u.objectives || "(none)"}${u.objectivesAr ? `\n${u.objectivesAr}` : ""}
Success criteria:
${sc}
Lessons:
${lessons}
Notes:
${clip(u.notes || "(none)", 800)}
${islamic ? "This is an Islamic / Qur’an topic. Do not fabricate verses, hadith, or rulings. Only use wording already present above.\n" : ""}
Write questions a teacher can review, edit and print as a colourful classroom worksheet.`;
}

function remapSc(raw: unknown, u: CurSnap): string | undefined {
  if (!u.sc.length) return undefined;
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d+)\s*$/);
  const n = m ? Number(m[1]) : 0;
  const i = Number.isFinite(n) ? Math.min(Math.max(0, n), u.sc.length - 1) : 0;
  return `${u.id}#${i}`;
}

function normalizeAi(raw: unknown, u: CurSnap): DraftQ[] {
  const obj = raw && typeof raw === "object" ? raw as { questions?: unknown } : {};
  const list = Array.isArray(obj.questions) ? obj.questions : Array.isArray(raw) ? raw : [];
  const counts: Record<string, number> = {};
  const out: DraftQ[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    let type = String(q.type || "multiple_choice");
    if (type === "short_answer" || type === "image_choice") type = "multiple_choice";
    if (!TYPES.has(type)) type = "multiple_choice";
    const prompt = String(q.prompt || "").trim();
    if (!prompt) continue;
    const sc = remapSc(q.sc, u);
    if (sc) {
      counts[sc] = (counts[sc] || 0) + 1;
      if (counts[sc] > SC_MAX) continue;
    }
    const base: DraftQ = {
      id: nid(),
      type: type as DraftQ["type"],
      prompt,
      options: Array.isArray(q.options) ? q.options.map((x) => String(x ?? "").trim()).filter((x, i, a) => x || i < 2) : [],
      correct: Array.isArray(q.correct) ? q.correct.map((x) => (typeof x === "number" ? x : Number(x))).filter((n) => Number.isFinite(n)) : [],
      points: 1,
      ...(sc ? { sc } : {}),
    };
    const promptAr = String(q.promptAr || "").trim();
    if (promptAr) base.promptAr = promptAr;
    if (Array.isArray(q.optionsAr)) base.optionsAr = q.optionsAr.map((x) => String(x ?? ""));
    const expl = String(q.explanation || "").trim();
    if (expl) base.explanation = expl;
    if (type === "true_false") {
      if (base.options.length < 2) base.options = ["True", "False"];
      if (!base.correct.length) base.correct = [0];
      base.correct = [Number(base.correct[0]) ? 1 : 0];
    } else if (type === "matching") {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      base.pairs = pairs.map((p) => {
        const o = p && typeof p === "object" ? p as { left?: string; right?: string } : {};
        return { left: String(o.left || "").trim(), right: String(o.right || "").trim() };
      }).filter((p) => p.left && p.right);
      if (!base.pairs.length) continue;
      base.options = [];
      base.correct = [];
    } else if (type === "fill_blank") {
      const blanks = Array.isArray(q.blanks) ? q.blanks : [];
      base.blanks = blanks.map((b) => (Array.isArray(b) ? b : [b]).map((x) => String(x || "").trim()).filter(Boolean)).filter((b) => b.length);
      if (!base.blanks.length) continue;
      if (!/_{3,}/.test(base.prompt)) base.prompt = `${base.prompt} ______`;
    } else if (type === "ordering") {
      if (base.options.length < 2) continue;
      base.correct = [];
    } else {
      if (base.options.length < 2) continue;
      const ok = (base.correct as number[]).filter((n) => n >= 0 && n < base.options.length);
      if (!ok.length) continue;
      base.correct = type === "multi_select" ? ok : [ok[0]];
    }
    out.push(base);
    if (out.length >= 15) break;
  }
  return out;
}

export async function draftFromCurriculum(env: AiEnv, u: CurSnap): Promise<{ questions: DraftQ[]; source: "ai" | "curriculum"; title: string; description: string }> {
  const title = [u.subject, u.title].filter(Boolean).join(": ");
  const description = [u.yr, u.term, u.wkFrom ? `Week ${u.wkFrom}` : ""].filter(Boolean).join(" · ");
  const fallback = { questions: scaffoldFromCurriculum(u), source: "curriculum" as const, title, description };
  try {
    if (!env.AI?.run) return fallback;
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg(u) },
      ],
      max_tokens: 2800,
    });
    const text = typeof result === "string"
      ? result
      : JSON.stringify((result as { response?: unknown; result?: unknown }).response
        ?? (result as { response?: unknown; result?: unknown }).result
        ?? result);
    const parsed = extractJson(text);
    const questions = normalizeAi(parsed, u);
    if (!questions.length) return fallback;
    return { questions, source: "ai", title, description };
  } catch {
    return fallback;
  }
}

export function bankFromTquizzes(rows: { id?: unknown; title?: unknown; data?: unknown }[], unit?: CurSnap): BankItem[] {
  const items: BankItem[] = [];
  for (const row of rows) {
    let data: { subject?: string; topicInfo?: { yr?: string }; questions?: DraftQ[] } = {};
    try { data = JSON.parse(String(row.data || "{}")); } catch { continue; }
    const subject = String(data.subject || "");
    const yr = String(data.topicInfo?.yr || "");
    if (unit && subject && unit.subject && family(subject) !== family(unit.subject)) continue;
    const title = String(row.title || "Assessment");
    const id = String(row.id || "");
    for (const q of data.questions || []) {
      if (!q || !String(q.prompt || "").trim()) continue;
      items.push({
        quizId: id,
        quizTitle: title,
        ...(subject ? { subject } : {}),
        ...(yr ? { yr } : {}),
        question: { ...q, id: nid() },
      });
      if (items.length >= 80) return items;
    }
  }
  return items;
}

const QSTART = /^(?:q(?:uestion)?\s*)?(\d+)[.)\-:]\s+/i;
const OPT = /^(?:[A-Ha-h]|[1-8])[.)\-]\s+(.*)$/;
const ANS = /^(?:answer|answers|correct|الإجابة|الاجابة)\s*[:\-]\s*(.*)$/i;

export function parseImportText(text: string, unit?: CurSnap): DraftQ[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  type Block = { prompt: string; options: string[]; answer: string };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const push = () => { if (cur && cur.prompt) blocks.push(cur); cur = null; };
  for (const line of lines) {
    if (!line) continue;
    const qs = line.match(QSTART);
    if (qs) {
      push();
      cur = { prompt: line.slice(qs[0].length).trim(), options: [], answer: "" };
      continue;
    }
    if (!cur) {
      if (/^[A-Ha-h][.)\-]/.test(line) || ANS.test(line)) continue;
      cur = { prompt: line, options: [], answer: "" };
      continue;
    }
    const am = line.match(ANS);
    if (am) { cur.answer = am[1].trim(); continue; }
    const om = line.match(OPT);
    if (om) { cur.options.push(om[1].trim()); continue; }
    if (cur.options.length || cur.answer) continue;
    cur.prompt = `${cur.prompt} ${line}`.trim();
  }
  push();

  const out: DraftQ[] = [];
  for (const b of blocks) {
    if (out.length >= 30) break;
    const sc = unit?.sc.length ? `${unit.id}#${out.length % unit.sc.length}` : undefined;
    const lookTf = /true or false|صح أم خطأ|صحيح أو خطأ/i.test(b.prompt) || /^(true|false|صحيح|خطأ|صح)$/i.test(b.answer);
    if (lookTf) {
      const yes = /^(true|صحيح|صح)/i.test(b.answer || "true");
      out.push({
        id: nid(),
        type: "true_false",
        prompt: b.prompt.replace(/^true or false[:\s-]*/i, "").trim() || b.prompt,
        options: ["True", "False"],
        correct: [yes ? 0 : 1],
        points: 1,
        ...(sc ? { sc } : {}),
      });
      continue;
    }
    if (b.options.length >= 2) {
      let idx = 0;
      if (b.answer) {
        const letter = b.answer.trim().toUpperCase().match(/^([A-H])/);
        if (letter) idx = letter[1].charCodeAt(0) - 65;
        else {
          const n = Number(b.answer);
          if (Number.isFinite(n) && n >= 1 && n <= b.options.length) idx = n - 1;
          else {
            const found = b.options.findIndex((o) => o.toLowerCase() === b.answer.toLowerCase());
            if (found >= 0) idx = found;
          }
        }
      }
      idx = Math.min(Math.max(0, idx), b.options.length - 1);
      out.push({
        id: nid(),
        type: "multiple_choice",
        prompt: b.prompt,
        options: b.options,
        correct: [idx],
        points: 1,
        ...(sc ? { sc } : {}),
      });
      continue;
    }
    if (b.prompt) {
      out.push(mcq(b.prompt, b.answer || b.prompt, PADS, sc));
    }
  }
  return out;
}
