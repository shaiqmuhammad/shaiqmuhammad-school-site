import { siteConfig } from "@/content/site";
import { siteOrigin } from "@/lib/siteOrigin";
/** t437: printable period × day timetable grid (PDF / Excel / Word) in the school sample style, system colours. */
import { dlGrant } from "@/lib/dl";
import { downloadBlob } from "@/lib/exportUtils";
import { qrImageUrl } from "@/lib/groupSession";

export type TtCol = { label: string; s: string; e: string };
export type TtGridCell = { text: string; color?: string };
export type TtGrid = { title: string; subtitle: string; cols: TtCol[]; days: { name: string; count: number; cells: (TtGridCell | null)[] }[]; totalLessons: number; totalStudents: number; rtl: boolean; L: { period: string; days: string; lessons: string; totalL: string; totalS: string } };

const NAVY = "#1b3a57", GOLD = "#f5c542", CREAM = "#fffaf0", INK = "#1b2f44";
const urlTT = () => `${siteOrigin()}/lms/timetable`;
const hex = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "");

async function qrData(): Promise<string> {
  try { const b = await (await fetch(qrImageUrl(urlTT(), 200))).blob(); return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(""); r.readAsDataURL(b); }); } catch { return ""; }
}
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

export async function ttGridPdf(g: TtGrid, filename: string) {
  if (!(await dlGrant("export"))) return;
  const { jsPDF } = await import("jspdf");
  const W = 1191, H = 842, M = 30, S = 2; // A3 landscape
  const font = `"Nunito", "Segoe UI", Arial, "Noto Naskh Arabic", sans-serif`;
  const cv = document.createElement("canvas"); cv.width = W * S; cv.height = H * S;
  const c = cv.getContext("2d")!; c.scale(S, S); c.fillStyle = CREAM; c.fillRect(0, 0, W, H);
  const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  // header band
  c.fillStyle = NAVY; rr(M, M, W - 2 * M, 78, 16); c.fill(); c.fillStyle = GOLD; c.fillRect(M + 16, M + 74, W - 2 * M - 32, 4);
  c.textBaseline = "middle"; c.textAlign = "center"; c.fillStyle = "#fff"; c.font = `800 28px ${font}`; c.fillText(g.title, W / 2, M + 28);
  c.fillStyle = GOLD; c.font = `600 15px ${font}`; c.fillText(g.subtitle, W / 2, M + 56);
  const qr = await loadImg(await qrData()); if (qr) { c.fillStyle = "#fff"; rr(W - M - 78, M + 6, 66, 66, 8); c.fill(); c.drawImage(qr, W - M - 74, M + 10, 58, 58); }
  // grid
  const top = M + 98, n = g.cols.length, fw = 110, cw = (W - 2 * M - fw) / Math.max(1, n), hh = 62;
  const rowH = Math.min(110, (H - top - hh - 90) / Math.max(1, g.days.length));
  const X = (i: number) => (g.rtl ? W - M - fw - (i + 1) * cw : M + fw + i * cw), FX = g.rtl ? W - M - fw : M;
  const wrap = (t: string, w: number) => { const out: string[] = []; t.split("\n").forEach((ln) => { let cur = ""; ln.split(" ").forEach((wd) => { const tst = cur ? cur + " " + wd : wd; if (c.measureText(tst).width > w && cur) { out.push(cur); cur = wd; } else cur = tst; }); out.push(cur); }); return out; };
  c.fillStyle = NAVY; rr(FX, top, fw, hh, 10); c.fill(); c.fillStyle = "#fff"; c.font = `800 13px ${font}`; c.fillText(g.L.period, FX + fw / 2, top + 20); c.fillStyle = GOLD; c.fillText(g.L.days, FX + fw / 2, top + 42);
  g.cols.forEach((col, i) => { const x = X(i); c.fillStyle = i % 2 ? "#24496b" : NAVY; rr(x + 2, top, cw - 4, hh, 10); c.fill(); c.fillStyle = "#fff"; c.font = `800 ${col.label.length > 8 ? 11 : 14}px ${font}`; wrap(col.label, cw - 10).slice(0, 2).forEach((l, k, a) => c.fillText(l, x + cw / 2, top + 22 + (k - (a.length - 1) / 2) * 14)); c.fillStyle = GOLD; c.font = `700 10px ${font}`; c.fillText(col.s && col.e ? `${col.s} – ${col.e}` : "", x + cw / 2, top + 48); });
  g.days.forEach((d, j) => {
    const y = top + hh + 6 + j * rowH;
    c.fillStyle = GOLD; rr(FX, y + 2, fw, rowH - 4, 10); c.fill(); c.fillStyle = NAVY; c.font = `900 17px ${font}`; c.fillText(d.name, FX + fw / 2, y + rowH / 2 - 10); c.font = `700 11px ${font}`; c.fillText(`${d.count} ${g.L.lessons}`, FX + fw / 2, y + rowH / 2 + 12);
    d.cells.forEach((cell, i) => { const x = X(i); c.fillStyle = cell ? (hex(cell.color) || "#e8eef5") : "#ffffff"; rr(x + 2, y + 2, cw - 4, rowH - 4, 10); c.fill(); c.strokeStyle = "rgba(27,58,87,.15)"; c.stroke();
      if (cell) { c.fillStyle = INK; c.font = `800 12px ${font}`; c.direction = /[\u0600-\u06FF]/.test(cell.text) ? "rtl" : "ltr"; const ls = wrap(cell.text, cw - 12).slice(0, 6); ls.forEach((l, k) => c.fillText(l, x + cw / 2, y + rowH / 2 + (k - (ls.length - 1) / 2) * 15)); c.direction = "ltr"; } });
  });
  const fy = top + hh + 6 + g.days.length * rowH + 10;
  [[g.L.totalL, g.totalLessons], [g.L.totalS, g.totalStudents]].forEach(([l, v], k) => { const bx = M + k * 230; c.fillStyle = NAVY; rr(bx, fy, 220, 40, 20); c.fill(); c.fillStyle = "#fff"; c.font = `700 14px ${font}`; c.textAlign = "left"; c.fillText(String(l), bx + 18, fy + 20); c.fillStyle = GOLD; c.font = `900 18px ${font}`; c.textAlign = "right"; c.fillText(String(v), bx + 202, fy + 20); c.textAlign = "center"; });
  c.fillStyle = "#8a97a3"; c.font = `11px ${font}`; c.textAlign = "right"; c.fillText(`${siteConfig.domain} · ${new Date().toLocaleDateString("en-GB")}`, W - M, H - 18);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  pdf.addImage(cv.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, W, H); pdf.save(filename);
}

export async function ttGridXlsx(g: TtGrid, filename: string) {
  if (!(await dlGrant("export"))) return;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Timetable", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 }, views: [{ rightToLeft: g.rtl, showGridLines: false }] });
  const n = g.cols.length + 1, fill = (h: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + h.slice(1).toUpperCase() } });
  const border = { style: "thin" as const, color: { argb: "FFC9D3DD" } }, B = { top: border, left: border, bottom: border, right: border };
  ws.columns = Array.from({ length: n }, (_, i) => ({ width: i ? 15 : 14 }));
  const band = (r: number, v: string, sz: number, col: string) => { ws.mergeCells(r, 1, r, n); const c = ws.getCell(r, 1); c.value = v; c.font = { bold: true, size: sz, color: { argb: "FF" + col.slice(1) } }; c.fill = fill(NAVY); c.alignment = { horizontal: "center", vertical: "middle" }; ws.getRow(r).height = sz * 1.9; };
  band(1, g.title, 18, "#ffffff"); band(2, g.subtitle, 12, GOLD);
  const h1 = ws.getRow(4), h2 = ws.getRow(5);
  h1.getCell(1).value = g.L.period; h2.getCell(1).value = g.L.days;
  g.cols.forEach((c, i) => { h1.getCell(i + 2).value = c.label; h2.getCell(i + 2).value = c.s && c.e ? `${c.s} – ${c.e}` : ""; });
  [h1, h2].forEach((r, k) => { r.height = k ? 18 : 30; for (let i = 1; i <= n; i++) { const c = r.getCell(i); c.fill = fill(NAVY); c.font = { bold: true, color: { argb: k ? "FFF5C542" : "FFFFFFFF" }, size: k ? 9 : 11 }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = B; } });
  g.days.forEach((d, j) => { const r = ws.getRow(6 + j); r.height = 58; const f = r.getCell(1); f.value = `${d.name}\n${d.count} ${g.L.lessons}`; f.fill = fill(GOLD); f.font = { bold: true, color: { argb: "FF1B3A57" }, size: 12 };
    f.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; f.border = B;
    d.cells.forEach((cell, i) => { const c = r.getCell(i + 2); c.value = cell?.text || ""; c.fill = fill(cell ? hex(cell.color) || "#e8eef5" : "#ffffff"); c.font = { bold: true, size: 10, color: { argb: "FF1B2F44" } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = B; }); });
  const fr = 7 + g.days.length;
  [[g.L.totalL, g.totalLessons], [g.L.totalS, g.totalStudents]].forEach(([l, v], k) => { const a = ws.getCell(fr + k, 1), b = ws.getCell(fr + k, 2); a.value = String(l); b.value = Number(v); [a, b].forEach((c, z) => { c.fill = fill(NAVY); c.font = { bold: true, color: { argb: z ? "FFF5C542" : "FFFFFFFF" } }; c.alignment = { horizontal: "center", vertical: "middle" }; c.border = B; }); });
  ws.getCell(fr + 3, 1).value = { text: urlTT(), hyperlink: urlTT() };
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export async function ttGridDocx(g: TtGrid, filename: string) {
  if (!(await dlGrant("export"))) return;
  const D = await import("docx");
  const nav = NAVY.slice(1), gold = GOLD.slice(1);
  const bd = { style: D.BorderStyle.SINGLE, size: 4, color: "C9D3DD" }, borders = { top: bd, bottom: bd, left: bd, right: bd };
  const p = (t: string, o: { color?: string; bold?: boolean; size?: number } = {}) => new D.Paragraph({ alignment: D.AlignmentType.CENTER, bidirectional: g.rtl, children: t.split("\n").map((x, i) => new D.TextRun({ text: x, break: i ? 1 : 0, bold: o.bold ?? true, color: o.color || "1B2F44", size: o.size || 16, rightToLeft: /[\u0600-\u06FF]/.test(x) })) });
  const cell = (kids: InstanceType<typeof D.Paragraph>[], bg: string) => new D.TableCell({ children: kids, shading: { type: D.ShadingType.CLEAR, color: "auto", fill: bg }, verticalAlign: D.VerticalAlign.CENTER, borders, margins: { top: 60, bottom: 60, left: 40, right: 40 } });
  const head = new D.TableRow({ tableHeader: true, children: [cell([p(g.L.period, { color: "FFFFFF" }), p(g.L.days, { color: gold })], nav), ...g.cols.map((c) => cell([p(c.label, { color: "FFFFFF", size: 18 }), p(c.s && c.e ? `${c.s} – ${c.e}` : "", { color: gold, size: 13 })], nav))] });
  const body = g.days.map((d) => new D.TableRow({ height: { value: 900, rule: D.HeightRule.ATLEAST }, children: [cell([p(d.name, { color: nav, size: 22 }), p(`${d.count} ${g.L.lessons}`, { color: nav, size: 14 })], gold), ...d.cells.map((c) => cell([p(c?.text || "")], c ? (hex(c.color) || "#e8eef5").slice(1) : "FFFFFF"))] }));
  let qr: Uint8Array | null = null; try { qr = new Uint8Array(await (await fetch(qrImageUrl(urlTT(), 200))).arrayBuffer()); } catch { qr = null; }
  const doc = new D.Document({ sections: [{ properties: { page: { size: { orientation: D.PageOrientation.LANDSCAPE, width: 16838, height: 11906 }, margin: { top: 500, bottom: 500, left: 500, right: 500 } } }, children: [
    new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ children: [cell([p(g.title, { color: "FFFFFF", size: 36 }), p(g.subtitle, { color: gold, size: 22 })], nav)] })] }),
    new D.Paragraph({ text: "" }),
    new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, visuallyRightToLeft: g.rtl, rows: [head, ...body] }),
    new D.Paragraph({ text: "" }),
    p(`${g.L.totalL}: ${g.totalLessons}     |     ${g.L.totalS}: ${g.totalStudents}`, { color: nav, size: 22 }),
    ...(qr ? [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.ImageRun({ type: "png", data: qr, transformation: { width: 70, height: 70 } })] })] : []),
  ] }] });
  downloadBlob(await D.Packer.toBlob(doc), filename);
}
