"use client";

import { dlGrant } from "@/lib/dl";
import { downloadBlob, escapeHtml, htmlBlocksToPdf, imageToPng, isArabic, safeFileName } from "@/lib/exportUtils";
import { optionLetter, quizMaxScore, wordBank, type Quiz, type QuizQuestion } from "@/lib/quiz";

/**
 * Colourful classroom worksheet (and a separate answer key) for an assessment.
 * Built in the browser as Word, PDF, Excel, or a direct print. Teachers edit
 * questions in the system, then print again for lessons and student books.
 */
export type PaperKind = "paper" | "key";
export type PaperFormat = "docx" | "xlsx" | "pdf";

type Seg = { text: string; bold?: boolean; italic?: boolean; size?: number; color?: string };
type Line = { segs: Seg[]; rtl?: boolean; indent?: boolean; image?: string; gap?: boolean };

const CARDS = [
  { fill: "FFF7ED", edge: "EA580C" },
  { fill: "ECFDF5", edge: "059669" },
  { fill: "EFF6FF", edge: "2563EB" },
  { fill: "FEF3C7", edge: "D97706" },
  { fill: "FDF2F8", edge: "DB2777" },
] as const;

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

function topicLine(quiz: Quiz): string {
  const t = quiz.topicInfo;
  if (!t) return "";
  return [t.yr, t.term, t.wk ? `Week ${t.wk}` : "", t.title].filter(Boolean).join(" · ");
}

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
    L.push({ segs: [{ text: "_______________________________________________" }], indent: true });
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

function headerLines(quiz: Quiz, kind: PaperKind, white = false): Line[] {
  const ink = white ? "FFFFFF" : undefined;
  const mute = white ? "CCFBF1" : undefined;
  const L: Line[] = [{ segs: [{ text: quiz.title + (kind === "key" ? " — Answer key" : ""), bold: true, size: 36, color: ink }] }];
  if (quiz.titleAr) L.push({ segs: [{ text: quiz.titleAr + (kind === "key" ? " — الإجابات" : ""), bold: true, size: 26, color: ink }], rtl: true });
  const topic = topicLine(quiz);
  if (topic) L.push({ segs: [{ text: topic, bold: true, size: 20, color: white ? "99F6E4" : "0F766E" }] });
  const time = quiz.timeLimitMinutes > 0 ? `Time: ${quiz.timeLimitMinutes} minutes · ` : "";
  L.push({ segs: [{ text: `${time}${quiz.questions.length} questions · Total: ${quizMaxScore(quiz)} marks`, italic: true, color: mute }] });
  if (kind === "paper") {
    L.push({ segs: [{ text: "Name: ______________________    Class: ________    Date: ____________", color: white ? "F0FDFA" : undefined }], gap: true });
    L.push({ segs: [{ text: "Answer every question. Write neatly — this page can go in your book.", italic: true, color: mute }] });
  } else {
    L.push({ segs: [{ text: "Teacher’s copy — not for students.", italic: true, color: mute }] });
  }
  return L;
}

function lineHtml(l: Line): string {
  if (l.image) return `<div${l.indent ? ' class="opt"' : ""}><img crossorigin="anonymous" src="${escapeHtml(l.image)}" alt=""></div>`;
  const inner = l.segs
    .map((s) => {
      let t = escapeHtml(s.text);
      if (s.bold) t = `<b>${t}</b>`;
      if (s.italic) t = `<i class="muted">${t}</i>`;
      const color = s.color ? `color:#${s.color};` : "";
      const size = s.size ? `font-size:${Math.round(s.size / 1.3)}px;` : "";
      return color || size ? `<span style="${color}${size}">${t}</span>` : t;
    })
    .join("");
  const cls = [l.rtl ? "ar" : "", l.indent ? "opt" : ""].filter(Boolean).join(" ");
  return `<div${cls ? ` class="${cls}"` : ""}${l.gap ? ' style="margin-top:14px"' : ""} dir="${l.rtl ? "rtl" : "auto"}">${inner}</div>`;
}

function headerHtml(quiz: Quiz, kind: PaperKind): string {
  const topic = topicLine(quiz);
  const time = quiz.timeLimitMinutes > 0 ? `Time: ${quiz.timeLimitMinutes} minutes` : "No time limit";
  return `<div class="ws-hdr">
    <div class="ws-brand">${kind === "key" ? "Teacher answer key" : "Classroom worksheet"} · Shaiq Muhammad</div>
    <h1>${escapeHtml(quiz.title + (kind === "key" ? " — Answer key" : ""))}</h1>
    ${quiz.titleAr ? `<h2 class="ar">${escapeHtml(quiz.titleAr + (kind === "key" ? " — الإجابات" : ""))}</h2>` : ""}
    ${topic ? `<span class="ws-topic">${escapeHtml(topic)}</span>` : ""}
    <p class="ws-sub">${escapeHtml(`${time} · ${quiz.questions.length} questions · Total: ${quizMaxScore(quiz)} marks`)}</p>
    ${kind === "paper"
      ? `<div class="ws-meta"><span>Name: ____________________</span><span>Class: ________</span><span>Date: ____________</span></div>
         <p class="ws-note">Answer every question. Write neatly — this page can go in your book.</p>`
      : `<p class="ws-note">Teacher’s copy — not for students.</p>`}
  </div>`;
}

function cardHtml(q: QuizQuestion, i: number, kind: PaperKind): string {
  const c = CARDS[i % CARDS.length];
  return `<div class="ws-card" style="background:#${c.fill};border-color:#${c.edge}">${questionLines(q, i + 1, kind).map(lineHtml).join("")}</div>`;
}

export function worksheetCss(): string {
  return `
@page { size: A4; margin: 12mm; }
body { margin: 0; color: #111; font: 13px/1.45 Arial, "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, sans-serif; }
.ws-hdr { background: #0f766e; color: #fff; border-radius: 18px; padding: 18px 20px; margin: 0 0 12px; }
.ws-hdr h1 { color: #fff; font-size: 22px; margin: 0 0 6px; line-height: 1.25; }
.ws-hdr h2 { color: #ccfbf1; font-size: 16px; margin: 0 0 8px; font-weight: 700; }
.ws-brand { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; opacity: .9; margin-bottom: 8px; font-weight: 800; }
.ws-topic { display: inline-block; background: #99f6e4; color: #115e59; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 800; }
.ws-sub { margin: 10px 0 0; color: #ccfbf1; }
.ws-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; background: #f0fdfa; color: #134e4a; border-radius: 12px; padding: 10px 12px; font-weight: 700; }
.ws-note { margin: 10px 0 0; font-style: italic; color: #ccfbf1; }
.ws-card { border: 2.5px solid; border-radius: 16px; padding: 12px 14px; }
.ws-card .opt { background: rgba(255,255,255,.72); border-radius: 10px; padding: 5px 10px; margin: 5px 0 5px 4px; }
.ws-card .muted { color: #444; }
.ar { direction: rtl; text-align: right; font-family: "Noto Naskh Arabic", "Geeza Pro", Tahoma, Arial, sans-serif; }
img { max-width: 100%; max-height: 240px; }
`.trim();
}

function worksheetBlocks(quiz: Quiz, kind: PaperKind): string[] {
  return [headerHtml(quiz, kind), ...quiz.questions.map((q, i) => cardHtml(q, i, kind))];
}

/** Open the colourful worksheet in a print dialog (A4, for lessons and student books). */
export function printWorksheet(quiz: Quiz, kind: PaperKind = "paper"): void {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(quiz.title)}</title><style>${worksheetCss()}</style></head><body>${worksheetBlocks(quiz, kind).join("")}</body></html>`;
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
  return { top: edge, bottom: edge, left: { ...edge, size: 24 }, right: edge };
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

async function cardTable(d: typeof import("docx"), lines: Line[], fill: string, edge: string) {
  const children = [];
  for (const line of lines) children.push(await paraOf(d, line));
  if (!children.length) children.push(new d.Paragraph({ children: [] }));
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [new d.TableRow({
      children: [new d.TableCell({
        shading: { type: d.ShadingType.CLEAR, fill },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        borders: borders(d, edge),
        children,
      })],
    })],
  });
}

async function toDocx(quiz: Quiz, kind: PaperKind): Promise<Blob> {
  const d = await import("docx");
  const children: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [];
  children.push(await cardTable(d, headerLines(quiz, kind, true), "0F766E", "0F766E"));
  children.push(new d.Paragraph({ spacing: { after: 120 }, children: [] }));
  for (let i = 0; i < quiz.questions.length; i++) {
    const c = CARDS[i % CARDS.length];
    children.push(await cardTable(d, questionLines(quiz.questions[i], i + 1, kind), c.fill, c.edge));
    children.push(new d.Paragraph({ spacing: { after: 80 }, children: [] }));
  }
  const doc = new d.Document({
    creator: "Shaiq Muhammad",
    title: quiz.title,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children,
    }],
  });
  return d.Packer.toBlob(doc);
}

async function toXlsx(quiz: Quiz, kind: PaperKind): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shaiq Muhammad";
  const ws = wb.addWorksheet(kind === "paper" ? "Worksheet" : "Answer key");
  const title = ws.addRow([quiz.title + (kind === "key" ? " — Answer key" : "")]);
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; });
  if (quiz.titleAr) {
    const arRow = ws.addRow([quiz.titleAr]);
    arRow.alignment = { horizontal: "right", readingOrder: "rtl" };
    arRow.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; c.font = { color: { argb: "FFCCFBF1" }, bold: true }; });
  }
  const topic = topicLine(quiz);
  if (topic) ws.addRow([topic]).font = { bold: true, color: { argb: "FF0F766E" } };
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
    const fill = `FF${CARDS[i % CARDS.length].fill}`;
    row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }; });
    [3, 6, 7].forEach((col) => {
      const c = row.getCell(col);
      if (isArabic(String(c.value ?? ""))) c.alignment = { wrapText: true, vertical: "top", horizontal: "right", readingOrder: "rtl" };
    });
  });
  ws.columns = [{ width: 6 }, { width: 48 }, { width: 40 }, { width: 8 }, { width: 50 }, { width: 40 }, { width: 24 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function downloadPaper(quiz: Quiz, kind: PaperKind, format: PaperFormat): Promise<void> {
  if (!(await dlGrant("export"))) return;
  const name = `${safeFileName(quiz.title)} - ${kind === "paper" ? "Worksheet" : "Answer key"}.${format}`;
  if (format === "docx") return downloadBlob(await toDocx(quiz, kind), name);
  if (format === "xlsx") return downloadBlob(await toXlsx(quiz, kind), name);
  return htmlBlocksToPdf(worksheetBlocks(quiz, kind), name, { css: worksheetCss() });
}
