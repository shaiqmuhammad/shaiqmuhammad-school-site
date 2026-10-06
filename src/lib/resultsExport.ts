"use client";

import { downloadBlob, escapeHtml, htmlBlocksToPdf, isArabic, safeFileName } from "@/lib/exportUtils";
import type { ResultRow, SessionResults } from "@/lib/groupSession";
import { barChartSvg, classAverage, donutGridSvg, questionStats, svgToPngDataUrl } from "@/lib/resultsCharts";

/** Class results downloads (teacher): Excel with charts, PowerPoint with native charts + table, PDF. Real names are always used. */
export type ResultsFormat = "xlsx" | "pptx" | "pdf";

const MEDAL = ["🥇", "🥈", "🥉"];

function base(data: SessionResults) {
  const rows = data.rows;
  const stats = questionStats(rows, data.quiz);
  const average = classAverage(rows);
  const bar = barChartSvg(rows.map((r) => ({ label: r.name, value: r.percentage })), average, { title: "Score per student (%)" });
  const donuts = stats.length ? donutGridSvg(stats, { cols: 5 }) : "";
  const title = `${data.title} — class results (${data.code})`;
  const date = new Date().toLocaleDateString("en-GB");
  return { rows, stats, average, bar, donuts, title, date };
}

const head = ["Rank", "Name", "Score", "Max", "Correct", "Wrong", "Unanswered", "%", "Submitted"];
const rowCells = (r: ResultRow) => [r.rank, r.name, r.score, r.maxScore, r.correct, r.wrong, r.unanswered, r.percentage, r.submitted ? "Yes" : "No"];

async function toXlsx(data: SessionResults): Promise<Blob> {
  const { rows, stats, average, bar, donuts, title, date } = base(data);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shaiq Muhammad";
  const ws = wb.addWorksheet("Results");
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([`Date: ${date} · Students: ${rows.length} · Class average: ${average}%`]);
  ws.addRow([]);
  const hr = ws.addRow(head);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; });
  rows.forEach((r) => {
    const row = ws.addRow(rowCells(r));
    if (isArabic(r.name)) row.getCell(2).alignment = { horizontal: "right", readingOrder: "rtl" };
    if (r.rank <= 3) row.getCell(1).value = `${MEDAL[r.rank - 1]} ${r.rank}`;
  });
  ws.addRow([]);
  ws.addRow(["", "Class average", "", "", "", "", "", average]).font = { bold: true };
  ws.columns = [{ width: 9 }, { width: 28 }, { width: 8 }, { width: 7 }, { width: 9 }, { width: 8 }, { width: 12 }, { width: 8 }, { width: 11 }];

  if (stats.length) {
    const qs = wb.addWorksheet("Questions");
    const h2 = qs.addRow(["No.", "Question", "Correct", "Wrong", "% correct"]);
    h2.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h2.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; });
    stats.forEach((s) => {
      const t = s.correct + s.wrong;
      qs.addRow([s.index + 1, s.prompt, s.correct, s.wrong, t ? Math.round((s.correct / t) * 100) : 0]).alignment = { wrapText: true, vertical: "top" };
    });
    qs.columns = [{ width: 6 }, { width: 70 }, { width: 10 }, { width: 10 }, { width: 11 }];
  }

  const cs = wb.addWorksheet("Charts");
  let rowAt = 0;
  for (const svg of [bar, donuts].filter(Boolean)) {
    const png = await svgToPngDataUrl(svg);
    const id = wb.addImage({ base64: png.dataUrl, extension: "png" });
    const w = Math.min(820, png.width);
    const h = Math.round((png.height / png.width) * w);
    cs.addImage(id, { tl: { col: 0, row: rowAt }, ext: { width: w, height: h } });
    rowAt += Math.ceil(h / 20) + 2;
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function toPptx(data: SessionResults): Promise<Blob> {
  const { rows, stats, average, title, date } = base(data);
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  const teal = "0F766E";

  const s1 = pptx.addSlide();
  s1.background = { color: "F0FDFA" };
  s1.addText(data.title, { x: 0.6, y: 0.5, w: 12, h: 0.9, fontSize: 34, bold: true, color: teal });
  s1.addText(`Class results · code ${data.code} · ${date}`, { x: 0.6, y: 1.35, w: 12, h: 0.5, fontSize: 16, color: "334155" });
  s1.addText(`Class average: ${average}%   ·   Students: ${rows.length}`, { x: 0.6, y: 2.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: "B45309" });
  const podium = [1, 2, 3]
    .map((rank) => ({ rank, names: rows.filter((r) => r.rank === rank) }))
    .filter((p) => p.names.length);
  podium.forEach((p, i) => {
    s1.addText(`${MEDAL[p.rank - 1]}  ${p.names.map((r) => `${r.name} (${r.percentage}%)`).join(", ")}`, {
      x: 0.8, y: 3.0 + i * 0.85, w: 11.5, h: 0.7, fontSize: 24, bold: p.rank === 1, color: "0F172A", rtlMode: p.names.some((r) => isArabic(r.name)),
    });
  });

  const s2 = pptx.addSlide();
  s2.addText("Score per student (%)", { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 24, bold: true, color: teal });
  s2.addChart(
    pptx.ChartType.bar,
    [
      // Horizontal bars are drawn bottom-up, so reverse to put 1st place at the top.
      { name: "Score %", labels: [...rows].reverse().map((r) => r.name), values: [...rows].reverse().map((r) => r.percentage) },
      { name: "Class average", labels: [...rows].reverse().map((r) => r.name), values: rows.map(() => average) },
    ],
    { x: 0.5, y: 1.0, w: 12.3, h: 6.2, barDir: "bar", barGrouping: "clustered", valAxisMaxVal: 100, valAxisMinVal: 0, chartColors: [teal, "F59E0B"], showLegend: true, legendPos: "b", showValue: true, dataLabelFontSize: 10, catAxisLabelFontSize: 11 },
  );

  for (let i = 0; i < stats.length; i += 8) {
    const s = pptx.addSlide();
    s.addText(`Correct vs wrong per question${stats.length > 8 ? ` (${i + 1}–${Math.min(stats.length, i + 8)})` : ""}`, { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 24, bold: true, color: teal });
    stats.slice(i, i + 8).forEach((q, k) => {
      const x = 0.4 + (k % 4) * 3.15;
      const y = 1.1 + Math.floor(k / 4) * 3.1;
      s.addChart(pptx.ChartType.doughnut, [{ name: `Q${q.index + 1}`, labels: ["Correct", "Wrong"], values: [q.correct, q.wrong] }], {
        x, y, w: 3.0, h: 2.6, holeSize: 55, chartColors: ["10B981", "F43F5E"], showLegend: k === 0, legendPos: "b", showPercent: true, showTitle: true, title: `Q${q.index + 1}`, titleFontSize: 14, dataLabelColor: "FFFFFF",
      });
      s.addText(q.prompt.slice(0, 90), { x, y: y + 2.6, w: 3.0, h: 0.45, fontSize: 9, color: "475569", align: "center" });
    });
  }

  for (let i = 0; i < rows.length; i += 14) {
    const s = pptx.addSlide();
    s.addText(`Results table${rows.length > 14 ? ` (${i + 1}–${Math.min(rows.length, i + 14)})` : ""}`, { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 24, bold: true, color: teal });
    const headRow = head.map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: teal } } }));
    const body = rows.slice(i, i + 14).map((r) => rowCells(r).map((c) => ({ text: String(c) })));
    s.addTable([headRow, ...body], { x: 0.5, y: 1.0, w: 12.3, fontSize: 12, border: { type: "solid", pt: 0.5, color: "CBD5E1" }, colW: [0.9, 3.4, 1, 0.9, 1.1, 1, 1.4, 1, 1.6] });
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

async function toPdf(data: SessionResults, filename: string): Promise<void> {
  const { rows, average, bar, donuts, title, date } = base(data);
  const barPng = await svgToPngDataUrl(bar);
  const donutPng = donuts ? await svgToPngDataUrl(donuts) : null;
  const blocks: string[] = [
    `<h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(date)} · Students: ${rows.length} · <b>Class average: ${average}%</b></p>` +
      [1, 2, 3]
        .map((rank) => ({ rank, names: rows.filter((r) => r.rank === rank) }))
        .filter((p) => p.names.length)
        .map((p) => `<p style="font-size:18px;margin:4px 0">${MEDAL[p.rank - 1]} <span dir="auto">${p.names.map((r) => `${escapeHtml(r.name)} (${r.percentage}%)`).join(", ")}</span></p>`)
        .join(""),
    `<img src="${barPng.dataUrl}" style="width:100%;max-height:none">`,
  ];
  if (donutPng) blocks.push(`<h2>Correct vs wrong per question</h2><img src="${donutPng.dataUrl}" style="width:100%;max-height:none">`);
  for (let i = 0; i < rows.length; i += 18) {
    blocks.push(
      `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
        .slice(i, i + 18)
        .map((r) => `<tr>${rowCells(r).map((c) => `<td dir="auto">${escapeHtml(String(c))}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`,
    );
  }
  await htmlBlocksToPdf(blocks, filename, { landscape: true, css: ".pg th{background:#0f766e;color:#fff}" });
}

export async function downloadResults(data: SessionResults, format: ResultsFormat): Promise<void> {
  const name = `${safeFileName(data.title)} - results ${data.code}.${format}`;
  if (format === "xlsx") return downloadBlob(await toXlsx(data), name);
  if (format === "pptx") return downloadBlob(await toPptx(data), name);
  return toPdf(data, name);
}
