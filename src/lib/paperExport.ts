"use client";

import { dlGrant } from "@/lib/dl";
import { downloadBlob, escapeHtml, htmlBlocksToPdf, imageToPng, isArabic, safeFileName } from "@/lib/exportUtils";
import { optionLetter, quizMaxScore, topicLabel, wordBank, type Quiz, type QuizQuestion } from "@/lib/quiz";

/**
 * Clean A4 classroom worksheet (and a separate answer key) in English, Arabic, or both.
 * One language per copy — never mixed on the same page. Teachers edit questions in the
 * system, then print again for lessons and student books.
 */
export type PaperKind = "paper" | "key";
export type PaperFormat = "docx" | "xlsx" | "pdf";
export type PaperLang = "en" | "ar" | "both";
type Lang = "en" | "ar";

type Seg = { text: string; bold?: boolean; italic?: boolean; size?: number; color?: string };
type Line = { segs: Seg[]; rtl?: boolean; indent?: boolean; image?: string; gap?: boolean };

const INK = "1D4F6E";
const EDGE = "94A3B8";
const AR_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل", "م", "ن"];

export function isIslamicA(subject?: string): boolean {
  return /^(islamic|islam)(\s+education)?\s*a\b/i.test((subject || "").trim());
}

export function isIslamicB(subject?: string): boolean {
  return /^(islamic|islam)(\s+education)?\s*b\b/i.test((subject || "").trim());
}

/** Islamic A → Arabic, Islamic B → English. An Islamic A-only teacher printing a shared Islamic B paper still defaults to Arabic. */
export function defaultPaperLang(subject?: string, teacherSubjects?: string[]): PaperLang {
  if (isIslamicA(subject)) return "ar";
  const tA = (teacherSubjects || []).some(isIslamicA);
  const tB = (teacherSubjects || []).some(isIslamicB);
  if (isIslamicB(subject)) return tA && !tB ? "ar" : "en";
  if (tA && !tB) return "ar";
  return "en";
}

function langsOf(lang: PaperLang): Lang[] {
  return lang === "both" ? ["en", "ar"] : [lang];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Stable "shuffle" so the paper and its answer key always agree. */
function stableOrder(n: number, seed: string): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let h = hash(seed) || 1;
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (n > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift() as number);
  return idx;
}

const arOpt = (q: QuizQuestion, i: number) => q.optionsAr?.[i]?.trim() || "";

function pick(en: string, arabic: string | undefined, lang: Lang): string {
  if (lang === "ar") return (arabic || "").trim() || en;
  return en;
}

function letter(i: number, lang: Lang): string {
  if (lang === "ar") return AR_LETTERS[i] || String(i + 1);
  return optionLetter(i);
}

function optText(q: QuizQuestion, i: number, lang: Lang): string {
  const en = q.options[i] ?? "";
  if (lang !== "ar") return en;
  const a = arOpt(q, i);
  if (a) return a;
  if (/^true$/i.test(en.trim())) return "صحيح";
  if (/^false$/i.test(en.trim())) return "خطأ";
  return en;
}

function bankOf(q: QuizQuestion, lang: Lang): string[] {
  if (lang !== "ar") return wordBank(q);
  const seen = new Set<string>();
  const words: string[] = [];
  const extras = (q.optionsAr || []).some((o) => o?.trim()) ? q.optionsAr || [] : q.options;
  const answers = (q.blanksAr?.length ? q.blanksAr : q.blanks || []).map((b) => b[0] || "");
  for (const w of [...answers, ...extras]) {
    const v = String(w ?? "").trim();
    const key = v.toLocaleLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      words.push(v);
    }
  }
  return words.sort((a, b) => a.localeCompare(b, "ar", { sensitivity: "base", numeric: true }));
}

function pairsOf(q: QuizQuestion, lang: Lang): { left: string; right: string }[] {
  return (q.pairs || []).map((p, i) => {
    const a = q.pairsAr?.[i];
    return lang === "ar"
      ? { left: a?.left?.trim() || p.left, right: a?.right?.trim() || p.right }
      : { left: p.left, right: p.right };
  });
}

function t(lang: Lang) {
  if (lang === "ar") {
    return {
      marks: (n: number) => (n === 1 ? "درجة واحدة" : `${n} درجات`),
      tick: "ظلل كل الإجابات الصحيحة.",
      match: "اكتب حرف الإجابة المناسبة بجانب كل رقم.",
      order: (n: number) => `رقّم المربعات من 1 إلى ${n} بالترتيب الصحيح.`,
      bank: "بنك الكلمات: ",
      picture: (L: string) => `صورة ${L}`,
      answer: "الإجابة: ",
      why: "السبب: ",
      blank: (i: number) => `الفراغ ${i}`,
      time: (m: number) => (m > 0 ? `الوقت: ${m} دقيقة` : "بدون حد للوقت"),
      counts: (n: number, total: number) => `${n} أسئلة · المجموع: ${total} درجة`,
      nameLine: "الاسم: ____________________    الصف: ________    التاريخ: ____________",
      write: "أجب عن كل سؤال. اكتب بخط واضح — يمكن وضع هذه الورقة في دفتر الطالب.",
      teacher: "نسخة المعلم — ليست للطلاب.",
      key: " — الإجابات",
      brand: "ورقة عمل · شائق محمد",
      brandKey: "إجابات المعلم · شائق محمد",
    };
  }
  return {
    marks: (n: number) => (n === 1 ? "1 mark" : `${n} marks`),
    tick: "Tick all that apply.",
    match: "Write the letter of the matching answer next to each number.",
    order: (n: number) => `Number the boxes 1–${n} in the correct order.`,
    bank: "Word bank: ",
    picture: (L: string) => `Picture ${L}`,
    answer: "Answer: ",
    why: "Why: ",
    blank: (i: number) => `Blank ${i}`,
    time: (m: number) => (m > 0 ? `Time: ${m} minutes` : "No time limit"),
    counts: (n: number, total: number) => `${n} questions · Total: ${total} marks`,
    nameLine: "Name: ____________________    Class: ________    Date: ____________",
    write: "Answer every question. Write neatly — this page can go in your book.",
    teacher: "Teacher’s copy — not for students.",
    key: " — Answer key",
    brand: "Classroom worksheet · Shaiq Muhammad",
    brandKey: "Teacher answer key · Shaiq Muhammad",
  };
}

function rtlLine(lang: Lang, text: string): boolean {
  return lang === "ar" || isArabic(text);
}

function questionLines(q: QuizQuestion, n: number, kind: PaperKind, lang: Lang): Line[] {
  const L: Line[] = [];
  const copy = t(lang);
  const pts = q.points || 1;
  const raw = pick(q.prompt, q.promptAr, lang);
  const prompt = q.type === "fill_blank" ? raw.replace(/_{3,}/g, "__________") : raw;
  L.push({ segs: [{ text: `${n}. `, bold: true }, { text: prompt, bold: true }, { text: `  (${copy.marks(pts)})`, italic: true }], rtl: rtlLine(lang, prompt) });
  if (q.media?.imageUrl) L.push({ segs: [], image: q.media.imageUrl });
  const correct = (q.correct as number[]).map(Number);

  if (kind === "paper") {
    switch (q.type) {
      case "multi_select":
        L.push({ segs: [{ text: copy.tick, italic: true }], indent: true, rtl: lang === "ar" });
      // falls through
      case "multiple_choice":
      case "true_false":
        q.options.forEach((_, i) => {
          const text = optText(q, i, lang);
          L.push({ segs: [{ text: `\u200E☐  ${letter(i, lang)}.  ${text}` }], indent: true, rtl: rtlLine(lang, text) });
        });
        break;
      case "image_choice":
        q.options.forEach((src, i) => {
          L.push({ segs: [{ text: `☐  ${copy.picture(letter(i, lang))}` }], indent: true, rtl: lang === "ar" });
          L.push({ segs: [], image: src, indent: true });
        });
        break;
      case "matching": {
        const pairs = pairsOf(q, lang);
        const order = stableOrder(pairs.length, q.id);
        L.push({ segs: [{ text: copy.match, italic: true }], indent: true, rtl: lang === "ar" });
        pairs.forEach((p, i) => L.push({ segs: [{ text: `\u200E${i + 1}.  ${p.left}   ____` }], indent: true, rtl: rtlLine(lang, p.left) }));
        order.forEach((ri, k) => L.push({ segs: [{ text: `\u200E${letter(k, lang)}.  ${pairs[ri].right}` }], indent: true, rtl: rtlLine(lang, pairs[ri].right) }));
        break;
      }
      case "fill_blank":
        L.push({ segs: [{ text: copy.bank, bold: true }, { text: bankOf(q, lang).join("   ·   ") }], indent: true, rtl: lang === "ar" });
        break;
      case "ordering": {
        const order = stableOrder(q.options.length, q.id);
        L.push({ segs: [{ text: copy.order(q.options.length), italic: true }], indent: true, rtl: lang === "ar" });
        order.forEach((oi) => {
          const text = optText(q, oi, lang);
          L.push({ segs: [{ text: `☐  ${text}` }], indent: true, rtl: rtlLine(lang, text) });
        });
        break;
      }
    }
    L.push({ segs: [{ text: "_______________________________________________" }], indent: true, rtl: lang === "ar" });
  } else {
    let answer = "";
    switch (q.type) {
      case "multiple_choice":
      case "true_false":
        answer = correct.map((i) => `${letter(i, lang)}. ${optText(q, i, lang)}`).join("; ");
        break;
      case "image_choice":
        answer = correct.map((i) => copy.picture(letter(i, lang))).join("; ");
        break;
      case "multi_select":
        answer = [...correct].sort((a, b) => a - b).map((i) => `${letter(i, lang)}. ${optText(q, i, lang)}`).join("; ");
        break;
      case "matching": {
        const pairs = pairsOf(q, lang);
        const order = stableOrder(pairs.length, q.id);
        answer = pairs.map((p, i) => `${i + 1} → ${letter(order.indexOf(i), lang)} (${p.left} → ${p.right})`).join(";  ");
        break;
      }
      case "fill_blank": {
        const blanks = lang === "ar" && q.blanksAr?.length ? q.blanksAr : q.blanks || [];
        answer = blanks.map((b, i) => `${copy.blank(i + 1)}: ${b[0] || ""}`).join(";  ");
        break;
      }
      case "ordering":
        answer = q.options.map((_, i) => `${i + 1}. ${optText(q, i, lang)}`).join("   ");
        break;
    }
    L.push({ segs: [{ text: copy.answer, bold: true }, { text: answer }], indent: true, rtl: rtlLine(lang, answer) });
    const why = pick(q.explanation || "", q.explanationAr, lang);
    if (why) L.push({ segs: [{ text: copy.why, bold: true }, { text: why }], indent: true, rtl: rtlLine(lang, why) });
  }
  return L;
}

function headerLines(quiz: Quiz, kind: PaperKind, lang: Lang): Line[] {
  const copy = t(lang);
  const title = pick(quiz.title, quiz.titleAr, lang) + (kind === "key" ? copy.key : "");
  const topic = topicLabel(quiz.topicInfo, lang);
  const L: Line[] = [{ segs: [{ text: title, bold: true, size: 36, color: "111827" }], rtl: rtlLine(lang, title) }];
  if (topic) L.push({ segs: [{ text: topic, bold: true, size: 20, color: INK }], rtl: lang === "ar" });
  L.push({ segs: [{ text: `${copy.time(quiz.timeLimitMinutes)} · ${copy.counts(quiz.questions.length, quizMaxScore(quiz))}`, italic: true, color: "334155" }], rtl: lang === "ar" });
  if (kind === "paper") {
    L.push({ segs: [{ text: copy.nameLine, color: "111827" }], gap: true, rtl: lang === "ar" });
    L.push({ segs: [{ text: copy.write, italic: true, color: "475569" }], rtl: lang === "ar" });
  } else {
    L.push({ segs: [{ text: copy.teacher, italic: true, color: "475569" }], rtl: lang === "ar" });
  }
  return L;
}

function lineHtml(l: Line): string {
  if (l.image) return `<div${l.indent ? ' class="opt"' : ""}><img crossorigin="anonymous" src="${escapeHtml(l.image)}" alt=""></div>`;
  const inner = l.segs
    .map((s) => {
      const numOnly = /^\d+\.\s*$/.test(s.text);
      let txt = numOnly ? `<span class="qno" dir="ltr">${escapeHtml(s.text)}</span>` : escapeHtml(s.text);
      if (s.bold && !numOnly) txt = `<b>${txt}</b>`;
      if (s.italic) txt = `<i class="muted">${txt}</i>`;
      const color = s.color ? `color:#${s.color};` : "";
      const size = s.size ? `font-size:${Math.round(s.size / 1.3)}px;` : "";
      return color || size ? `<span style="${color}${size}">${txt}</span>` : txt;
    })
    .join("");
  const cls = [l.rtl ? "ar" : "", l.indent ? "opt" : ""].filter(Boolean).join(" ");
  return `<div${cls ? ` class="${cls}"` : ""}${l.gap ? ' style="margin-top:14px"' : ""} dir="${l.rtl ? "rtl" : "auto"}">${inner}</div>`;
}

function headerHtml(quiz: Quiz, kind: PaperKind, lang: Lang): string {
  const copy = t(lang);
  const title = pick(quiz.title, quiz.titleAr, lang) + (kind === "key" ? copy.key : "");
  const topic = topicLabel(quiz.topicInfo, lang);
  return `<div class="ws-hdr">
    <div class="ws-brand">${escapeHtml(kind === "key" ? copy.brandKey : copy.brand)}</div>
    <h1 dir="${rtlLine(lang, title) ? "rtl" : "ltr"}">${escapeHtml(title)}</h1>
    ${topic ? `<span class="ws-topic">${escapeHtml(topic)}</span>` : ""}
    <p class="ws-sub">${escapeHtml(`${copy.time(quiz.timeLimitMinutes)} · ${copy.counts(quiz.questions.length, quizMaxScore(quiz))}`)}</p>
    ${kind === "paper"
      ? `<div class="ws-meta"><span>${escapeHtml(copy.nameLine)}</span></div>
         <p class="ws-note">${escapeHtml(copy.write)}</p>`
      : `<p class="ws-note">${escapeHtml(copy.teacher)}</p>`}
  </div>`;
}

function cardHtml(q: QuizQuestion, i: number, kind: PaperKind, lang: Lang): string {
  return `<div class="ws-card">${questionLines(q, i + 1, kind, lang).map(lineHtml).join("")}</div>`;
}

export function worksheetCss(): string {
  return `
@page { size: A4 portrait; margin: 10mm; }
html, body { margin: 0; background: #fff; color: #111827; }
body { font: 12.5pt/1.45 Arial, "Noto Naskh Arabic", "Noto Sans Arabic", "Amiri", Tahoma, sans-serif; }
.ws-frame {
  box-sizing: border-box;
  min-height: calc(297mm - 20mm);
  padding: 14pt 16pt 18pt;
  background: #fff;
  border: 2.25pt solid #1d4f6e;
  outline: 0.75pt solid #1d4f6e;
  outline-offset: 3.25pt;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.ws-break { break-before: page; page-break-before: always; height: 0; margin: 0; border: 0; }
.ws-hdr { background: #fff; color: #111827; border-bottom: 1.5pt solid #1d4f6e; padding: 0 0 12pt; margin: 0 0 14pt; }
.ws-hdr h1 { color: #111827; font-size: 18pt; margin: 0 0 6pt; line-height: 1.25; }
.ws-brand { font-size: 10pt; letter-spacing: .06em; text-transform: uppercase; color: #1d4f6e; font-weight: 800; margin-bottom: 8pt; }
.ws-topic { display: inline-block; background: #fff; color: #1d4f6e; border: 1pt solid #1d4f6e; border-radius: 999px; padding: 2pt 10pt; font-size: 10pt; font-weight: 700; }
.ws-sub { margin: 8pt 0 0; color: #334155; }
.ws-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12pt; background: #fff; color: #111827; border: 1pt solid #cbd5e1; border-radius: 8pt; padding: 8pt 10pt; font-weight: 700; }
.ws-note { margin: 8pt 0 0; font-style: italic; color: #475569; }
.ws-card { background: #fff; border: 1pt solid #94a3b8; border-radius: 8pt; padding: 10pt 12pt; margin: 0 0 10pt; }
.ws-card .opt { background: #fff; border: 1pt solid #e2e8f0; border-radius: 6pt; padding: 4pt 8pt; margin: 4pt 0 4pt 4pt; }
.ws-card .muted { color: #475569; }
.ar { direction: rtl; text-align: right; font-family: "Noto Naskh Arabic", "Amiri", "Geeza Pro", Tahoma, Arial, sans-serif; }
img { max-width: 100%; max-height: 240px; }
.pg { background: #fff !important; box-shadow: inset 0 0 0 2.25pt #1d4f6e, inset 0 0 0 5.5pt #fff, inset 0 0 0 7pt #1d4f6e; }
`.trim();
}

function worksheetBlocks(quiz: Quiz, kind: PaperKind, lang: Lang): string[] {
  return [headerHtml(quiz, kind, lang), ...quiz.questions.map((q, i) => cardHtml(q, i, kind, lang))];
}

function allBlocks(quiz: Quiz, kind: PaperKind, lang: PaperLang): string[] {
  const out: string[] = [];
  langsOf(lang).forEach((L, i) => {
    if (i) out.push("<!--pagebreak-->");
    out.push(...worksheetBlocks(quiz, kind, L));
  });
  return out;
}

function printBody(quiz: Quiz, kind: PaperKind, lang: PaperLang): string {
  return langsOf(lang)
    .map((L, i) => `${i ? '<div class="ws-break"></div>' : ""}<div class="ws-frame" dir="${L === "ar" ? "rtl" : "ltr"}">${worksheetBlocks(quiz, kind, L).join("")}</div>`)
    .join("");
}

/** Open a clean A4 worksheet in a print dialog (for lessons and student books). */
export function printWorksheet(quiz: Quiz, kind: PaperKind = "paper", lang: PaperLang = "en"): void {
  const first = langsOf(lang)[0];
  const html = `<!DOCTYPE html><html lang="${first}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escapeHtml(pick(quiz.title, quiz.titleAr, first))}</title><style>${worksheetCss()}</style></head><body>${printBody(quiz, kind, lang)}</body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 800); }, 250);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch { /* */ } };
  const imgs = Array.from(w.document.images);
  if (!imgs.length) { w.onload = go; setTimeout(go, 200); return; }
  let n = 0;
  imgs.forEach((im) => { im.onload = im.onerror = () => { if (++n >= imgs.length) go(); }; });
  setTimeout(go, 1200);
}

function borders(d: typeof import("docx"), color: string) {
  const edge = { style: d.BorderStyle.SINGLE, size: 12, color };
  return { top: edge, bottom: edge, left: { ...edge, size: 18 }, right: edge };
}

function pageBorders(d: typeof import("docx")) {
  const edge = { style: d.BorderStyle.DOUBLE, size: 18, color: INK, space: 16 };
  return {
    pageBorders: { display: d.PageBorderDisplay.ALL_PAGES, offsetFrom: d.PageBorderOffsetFrom.PAGE },
    pageBorderTop: edge,
    pageBorderRight: edge,
    pageBorderBottom: edge,
    pageBorderLeft: edge,
  };
}

async function paraOf(d: typeof import("docx"), line: Line) {
  if (line.image) {
    const png = await imageToPng(line.image, 600);
    if (png) {
      const w = Math.min(360, png.width);
      return new d.Paragraph({ indent: line.indent ? { left: 200 } : undefined, children: [new d.ImageRun({ type: "png", data: png.data, transformation: { width: w, height: Math.round((png.height / png.width) * w) } })] });
    }
    return new d.Paragraph({ indent: line.indent ? { left: 200 } : undefined, children: [new d.TextRun({ text: `[Picture: ${line.image.slice(0, 120)}]`, italics: true })] });
  }
  const rtl = Boolean(line.rtl);
  return new d.Paragraph({
    bidirectional: rtl,
    alignment: rtl ? d.AlignmentType.RIGHT : undefined,
    indent: line.indent ? (rtl ? { right: 160 } : { left: 160 }) : undefined,
    spacing: { before: line.gap ? 160 : 40, after: 40 },
    children: line.segs.map(
      (s) => new d.TextRun({ text: s.text, bold: s.bold, italics: s.italic, color: s.color, size: s.size ?? 22, rightToLeft: rtl || isArabic(s.text) ? true : undefined, font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial" } }),
    ),
  });
}

async function cardTable(d: typeof import("docx"), lines: Line[], edge: string) {
  const children = [];
  for (const line of lines) children.push(await paraOf(d, line));
  if (!children.length) children.push(new d.Paragraph({ children: [] }));
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [new d.TableRow({
      children: [new d.TableCell({
        shading: { type: d.ShadingType.CLEAR, fill: "FFFFFF" },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        borders: borders(d, edge),
        children,
      })],
    })],
  });
}

async function toDocx(quiz: Quiz, kind: PaperKind, lang: PaperLang): Promise<Blob> {
  const d = await import("docx");
  const children: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [];
  for (const [i, L] of langsOf(lang).entries()) {
    if (i) children.push(new d.Paragraph({ children: [new d.PageBreak()] }));
    children.push(await cardTable(d, headerLines(quiz, kind, L), INK));
    children.push(new d.Paragraph({ spacing: { after: 120 }, children: [] }));
    for (let qi = 0; qi < quiz.questions.length; qi++) {
      children.push(await cardTable(d, questionLines(quiz.questions[qi], qi + 1, kind, L), EDGE));
      children.push(new d.Paragraph({ spacing: { after: 80 }, children: [] }));
    }
  }
  const doc = new d.Document({
    creator: "Shaiq Muhammad",
    title: quiz.title,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 }, borders: pageBorders(d) } },
      children,
    }],
  });
  return d.Packer.toBlob(doc);
}

async function toXlsx(quiz: Quiz, kind: PaperKind, lang: PaperLang): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shaiq Muhammad";
  for (const L of langsOf(lang)) {
    const copy = t(L);
    const ws = wb.addWorksheet(L === "ar" ? (kind === "paper" ? "Arabic" : "Answer key AR") : (kind === "paper" ? "English" : "Answer key EN"));
    const title = pick(quiz.title, quiz.titleAr, L) + (kind === "key" ? copy.key : "");
    const titleRow = ws.addRow([title]);
    titleRow.font = { bold: true, size: 16, color: { argb: "FF111827" } };
    if (L === "ar") titleRow.alignment = { horizontal: "right", readingOrder: "rtl" };
    const topic = topicLabel(quiz.topicInfo, L);
    if (topic) {
      const tr = ws.addRow([topic]);
      tr.font = { bold: true, color: { argb: `FF${INK}` } };
      if (L === "ar") tr.alignment = { horizontal: "right", readingOrder: "rtl" };
    }
    ws.addRow([`${copy.time(quiz.timeLimitMinutes)} · ${copy.counts(quiz.questions.length, quizMaxScore(quiz))}`]);
    if (kind === "paper") ws.addRow([copy.nameLine]);
    ws.addRow([]);
    const head = kind === "paper"
      ? [L === "ar" ? "رقم" : "No.", L === "ar" ? "السؤال" : "Question", L === "ar" ? "الدرجات" : "Marks", L === "ar" ? "الخيارات" : "Choices / items", L === "ar" ? "إجابتك" : "Your answer"]
      : [L === "ar" ? "رقم" : "No.", L === "ar" ? "السؤال" : "Question", L === "ar" ? "الدرجات" : "Marks", L === "ar" ? "الإجابة" : "Correct answer", L === "ar" ? "الشرح" : "Explanation"];
    const hr = ws.addRow(head);
    hr.font = { bold: true, color: { argb: `FF${INK}` } };
    hr.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      c.border = { bottom: { style: "medium", color: { argb: `FF${INK}` } } };
    });
    quiz.questions.forEach((q, i) => {
      const lines = questionLines(q, i + 1, kind, L).slice(1).filter((line) => !line.image);
      const text = (line: Line) => line.segs.map((s) => s.text).join("");
      const extra = lines.map(text);
      const prompt = pick(q.prompt, q.promptAr, L);
      const promptShown = q.type === "fill_blank" ? prompt.replace(/_{3,}/g, "______") : prompt;
      const why = pick(q.explanation || "", q.explanationAr, L);
      const row = kind === "paper"
        ? ws.addRow([i + 1, promptShown, q.points || 1, extra.join("\n"), ""])
        : ws.addRow([i + 1, promptShown, q.points || 1, extra.filter((x) => x.startsWith(copy.answer)).map((x) => x.slice(copy.answer.length)).join("\n"), why]);
      row.alignment = { wrapText: true, vertical: "top", ...(L === "ar" ? { horizontal: "right", readingOrder: "rtl" as const } : {}) };
      row.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        c.border = { top: { style: "thin", color: { argb: "FFE2E8F0" } }, bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      });
    });
    ws.columns = [{ width: 6 }, { width: 52 }, { width: 10 }, { width: 56 }, { width: 28 }];
    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function langFileLabel(lang: PaperLang): string {
  if (lang === "ar") return "Arabic";
  if (lang === "both") return "English and Arabic";
  return "English";
}

export async function downloadPaper(quiz: Quiz, kind: PaperKind, format: PaperFormat, lang: PaperLang = "en"): Promise<void> {
  if (!(await dlGrant("export"))) return;
  const name = `${safeFileName(quiz.title)} - ${kind === "paper" ? "Worksheet" : "Answer key"} - ${langFileLabel(lang)}.${format}`;
  if (format === "docx") return downloadBlob(await toDocx(quiz, kind, lang), name);
  if (format === "xlsx") return downloadBlob(await toXlsx(quiz, kind, lang), name);
  return htmlBlocksToPdf(allBlocks(quiz, kind, lang), name, { css: worksheetCss() });
}
