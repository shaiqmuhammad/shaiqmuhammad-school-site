"use client";

import { downloadBlob, escapeHtml, htmlBlocksToPdf, imageToPng, isArabic, safeFileName } from "@/lib/exportUtils";
import { optionLetter, quizMaxScore, wordBank, type Quiz, type QuizQuestion } from "@/lib/quiz";

/**
 * Printable question paper and separate answer key for an assessment, as Word (.docx),
 * Excel (.xlsx) or PDF. Everything is built in the browser. English with the Arabic version
 * underneath when the question has one.
 */
export type PaperKind = "paper" | "key";
export type PaperFormat = "docx" | "xlsx" | "pdf";

type Seg = { text: string; bold?: boolean; italic?: boolean; size?: number };
type Line = { segs: Seg[]; rtl?: boolean; indent?: boolean; image?: string; gap?: boolean };

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

const ar = (q: QuizQuestion, i: number) => q.optionsAr?.[i]?.trim() || "";
const withAr = (en: string, a: string) => (a && a !== en ? `${en}  |  ${a}` : en);
const marks = (n: number) => (n === 1 ? "1 mark" : `${n} marks`);

function questionLines(q: QuizQuestion, n: number, kind: PaperKind): Line[] {
  const L: Line[] = [];
  const pts = q.points || 1;
  const prompt = q.type === "fill_blank" ? q.prompt.replace(/_{3,}/g, "__________") : q.prompt;
  L.push({ segs: [{ text: `${n}. `, bold: true }, { text: prompt, bold: true }, { text: `  (${marks(pts)})`, italic: true }] });
  if (q.promptAr?.trim()) L.push({ segs: [{ text: q.type === "fill_blank" ? q.promptAr.replace(/_{3,}/g, "__________") : q.promptAr }], rtl: true });
  if (q.media?.imageUrl) L.push({ segs: [], image: q.media.imageUrl });
  const correct = (q.correct as number[]).map(Number);

  if (kind === "paper") {
    switch (q.type) {
      case "multi_select":
        L.push({ segs: [{ text: "Tick all that apply.", italic: true }], indent: true });
      // falls through
      case "multiple_choice":
      case "true_false":
        q.options.forEach((o, i) => L.push({ segs: [{ text: `☐  ${optionLetter(i)}.  ${withAr(o, ar(q, i))}` }], indent: true }));
        break;
      case "image_choice":
        q.options.forEach((src, i) => {
          L.push({ segs: [{ text: `☐  Picture ${optionLetter(i)}` }], indent: true });
          L.push({ segs: [], image: src, indent: true });
        });
        break;
      case "matching": {
        const pairs = q.pairs || [];
        const order = stableOrder(pairs.length, q.id);
        L.push({ segs: [{ text: "Write the letter of the matching answer next to each number.", italic: true }], indent: true });
        pairs.forEach((p, i) => L.push({ segs: [{ text: `${i + 1}.  ${p.left}   ____` }], indent: true }));
        order.forEach((ri, k) => L.push({ segs: [{ text: `${optionLetter(k)}.  ${pairs[ri].right}` }], indent: true }));
        break;
      }
      case "fill_blank":
        L.push({ segs: [{ text: "Word bank: ", bold: true }, { text: wordBank(q).join("   ·   ") }], indent: true });
        break;
      case "ordering": {
        const order = stableOrder(q.options.length, q.id);
        L.push({ segs: [{ text: `Number the boxes 1–${q.options.length} in the correct order.`, italic: true }], indent: true });
        order.forEach((oi) => L.push({ segs: [{ text: `☐  ${withAr(q.options[oi], ar(q, oi))}` }], indent: true }));
        break;
      }
    }
  } else {
    let answer = "";
    switch (q.type) {
      case "multiple_choice":
      case "true_false":
        answer = correct.map((i) => `${optionLetter(i)}. ${withAr(q.options[i] ?? "", ar(q, i))}`).join("; ");
        break;
      case "image_choice":
        answer = correct.map((i) => `Picture ${optionLetter(i)}`).join("; ");
        break;
      case "multi_select":
        answer = [...correct].sort((a, b) => a - b).map((i) => `${optionLetter(i)}. ${withAr(q.options[i] ?? "", ar(q, i))}`).join("; ");
        break;
      case "matching": {
        const pairs = q.pairs || [];
        const order = stableOrder(pairs.length, q.id);
        answer = pairs.map((p, i) => `${i + 1} → ${optionLetter(order.indexOf(i))} (${p.left} → ${p.right})`).join(";  ");
        break;
      }
      case "fill_blank":
        answer = (q.blanks || []).map((b, i) => `Blank ${i + 1}: ${b[0] || ""}`).join(";  ");
        break;
      case "ordering":
        answer = q.options.map((o, i) => `${i + 1}. ${withAr(o, ar(q, i))}`).join("   ");
        break;
    }
    L.push({ segs: [{ text: "Answer: ", bold: true }, { text: answer }], indent: true });
    if (q.explanation) L.push({ segs: [{ text: "Why: ", bold: true }, { text: q.explanation }], indent: true });
    if (q.explanationAr) L.push({ segs: [{ text: q.explanationAr }], rtl: true, indent: true });
  }
  return L;
}

function headerLines(quiz: Quiz, kind: PaperKind): Line[] {
  const L: Line[] = [{ segs: [{ text: quiz.title + (kind === "key" ? " — Answer key" : ""), bold: true, size: 32 }] }];
  if (quiz.titleAr) L.push({ segs: [{ text: quiz.titleAr + (kind === "key" ? " — الإجابات" : ""), bold: true, size: 26 }], rtl: true });
  const time = quiz.timeLimitMinutes > 0 ? `Time: ${quiz.timeLimitMinutes} minutes · ` : "";
  L.push({ segs: [{ text: `${time}${quiz.questions.length} questions · Total: ${quizMaxScore(quiz)} marks`, italic: true }] });
  if (kind === "paper") {
    L.push({ segs: [{ text: "Name: ______________________    Class: ________    Date: ____________" }], gap: true });
    L.push({ segs: [{ text: "Answer every question.", italic: true }] });
  } else {
    L.push({ segs: [{ text: "Teacher’s copy — not for students.", italic: true }] });
  }
  return L;
}

function blocks(quiz: Quiz, kind: PaperKind): Line[][] {
  return [headerLines(quiz, kind), ...quiz.questions.map((q, i) => questionLines(q, i + 1, kind))];
}

async function toDocx(quiz: Quiz, kind: PaperKind): Promise<Blob> {
  const d = await import("docx");
  const children: InstanceType<typeof d.Paragraph>[] = [];
  for (const block of blocks(quiz, kind)) {
    for (const line of block) {
      if (line.image) {
        const png = await imageToPng(line.image, 600);
        if (png) {
          const w = Math.min(360, png.width);
          children.push(new d.Paragraph({ indent: line.indent ? { left: 360 } : undefined, children: [new d.ImageRun({ type: "png", data: png.data, transformation: { width: w, height: Math.round((png.height / png.width) * w) } })] }));
        } else {
          children.push(new d.Paragraph({ indent: line.indent ? { left: 360 } : undefined, children: [new d.TextRun({ text: `[Picture: ${line.image.slice(0, 120)}]`, italics: true })] }));
        }
        continue;
      }
      const rtl = Boolean(line.rtl);
      children.push(
        new d.Paragraph({
          bidirectional: rtl,
          alignment: rtl ? d.AlignmentType.RIGHT : undefined,
          indent: line.indent ? (rtl ? { right: 360 } : { left: 360 }) : undefined,
          spacing: { before: line.gap ? 200 : 40, after: 40 },
          children: line.segs.map(
            (s) => new d.TextRun({ text: s.text, bold: s.bold, italics: s.italic, size: s.size ?? 22, rightToLeft: rtl || isArabic(s.text) ? true : undefined, font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial" } }),
          ),
        }),
      );
    }
    children.push(new d.Paragraph({ children: [] }));
  }
  const doc = new d.Document({ creator: "Shaiq Muhammad", title: quiz.title, sections: [{ properties: {}, children }] });
  return d.Packer.toBlob(doc);
}

async function toXlsx(quiz: Quiz, kind: PaperKind): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shaiq Muhammad";
  const ws = wb.addWorksheet(kind === "paper" ? "Question paper" : "Answer key");
  ws.addRow([quiz.title + (kind === "key" ? " — Answer key" : "")]).font = { bold: true, size: 14 };
  if (quiz.titleAr) ws.addRow([quiz.titleAr]).alignment = { horizontal: "right", readingOrder: "rtl" };
  ws.addRow([`${quiz.timeLimitMinutes > 0 ? `Time: ${quiz.timeLimitMinutes} min · ` : ""}${quiz.questions.length} questions · ${quizMaxScore(quiz)} marks`]);
  if (kind === "paper") ws.addRow(["Name:", "", "Class:", "", "Date:"]);
  ws.addRow([]);
  const head = kind === "paper"
    ? ["No.", "Question", "Question (Arabic)", "Marks", "Choices / items", "Choices (Arabic)", "Your answer"]
    : ["No.", "Question", "Question (Arabic)", "Marks", "Correct answer", "Explanation", "Explanation (Arabic)"];
  const hr = ws.addRow(head);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; });
  quiz.questions.forEach((q, i) => {
    const lines = questionLines(q, i + 1, kind).slice(1).filter((l) => !l.image);
    const text = (l: Line) => l.segs.map((s) => s.text).join("");
    const enLines = lines.filter((l) => !l.rtl).map(text);
    const arLines = lines.filter((l) => l.rtl).map(text);
    const prompt = q.type === "fill_blank" ? q.prompt.replace(/_{3,}/g, "______") : q.prompt;
    const promptAr = arLines.length && q.promptAr ? arLines.shift() || "" : "";
    const row = kind === "paper"
      ? ws.addRow([i + 1, prompt, promptAr, q.points || 1, enLines.join("\n"), (q.optionsAr || []).filter(Boolean).join("\n"), ""])
      : ws.addRow([i + 1, prompt, promptAr, q.points || 1, enLines.filter((t) => t.startsWith("Answer: ")).map((t) => t.slice(8)).join("\n"), q.explanation || "", q.explanationAr || ""]);
    row.alignment = { wrapText: true, vertical: "top" };
    [3, 6, 7].forEach((col) => {
      const c = row.getCell(col);
      if (isArabic(String(c.value ?? ""))) c.alignment = { wrapText: true, vertical: "top", horizontal: "right", readingOrder: "rtl" };
    });
  });
  ws.columns = [{ width: 6 }, { width: 48 }, { width: 40 }, { width: 8 }, { width: 50 }, { width: 40 }, { width: 24 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function lineHtml(l: Line): string {
  if (l.image) return `<div${l.indent ? ' style="margin-left:18px"' : ""}><img crossorigin="anonymous" src="${escapeHtml(l.image)}" alt=""></div>`;
  const inner = l.segs
    .map((s) => {
      let t = escapeHtml(s.text);
      if (s.bold) t = `<b>${t}</b>`;
      if (s.italic) t = `<i class="muted">${t}</i>`;
      return s.size ? `<span style="font-size:${Math.round(s.size / 1.3)}px">${t}</span>` : t;
    })
    .join("");
  const cls = [l.rtl ? "ar" : "", l.indent ? "opt" : ""].filter(Boolean).join(" ");
  return `<div${cls ? ` class="${cls}"` : ""}${l.gap ? ' style="margin-top:14px"' : ""} dir="${l.rtl ? "rtl" : "auto"}">${inner}</div>`;
}

export async function downloadPaper(quiz: Quiz, kind: PaperKind, format: PaperFormat): Promise<void> {
  const name = `${safeFileName(quiz.title)} - ${kind === "paper" ? "Question paper" : "Answer key"}.${format}`;
  if (format === "docx") return downloadBlob(await toDocx(quiz, kind), name);
  if (format === "xlsx") return downloadBlob(await toXlsx(quiz, kind), name);
  return htmlBlocksToPdf(blocks(quiz, kind).map((b) => b.map(lineHtml).join("")), name);
}
