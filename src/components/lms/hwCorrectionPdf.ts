"use client";

import { downloadBlob, safeFileName } from "@/lib/exportUtils";
import { qrSvg } from "@/lib/qrLocal";
import { pageOf, type HwAnnot, type HwPage, type HwPhoto } from "@/lib/hwMark";

export type HwPdfMeta = {
  title: string;
  student: string;
  cls?: string;
  section?: string;
  teacher?: string;
  date: number;
  next?: string[];
  token?: string;
  origin?: string;
};

/** Paint one photo plus its marks onto a canvas (same 0–100 coordinates as the on-screen overlay). */
export async function paintHwPage(img: HTMLImageElement | ImageBitmap, photo: HwPhoto, page: HwPage, lang: "en" | "ar"): Promise<HTMLCanvasElement> {
  const w = Math.max(1, img.width || photo.w || 1);
  const h = Math.max(1, img.height || photo.h || 1);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const X = (n: number) => (n / 100) * w;
  const Y = (n: number) => (n / 100) * h;
  const lw = (s: number) => Math.max(2, s * (w / 400));
  for (const s of page.strokes) {
    if (s.d.length < 4) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.c;
    ctx.globalAlpha = s.tool === "hi" ? 0.4 : 1;
    ctx.lineWidth = lw(s.w);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(X(s.d[0]), Y(s.d[1]));
    for (let i = 2; i + 1 < s.d.length; i += 2) ctx.lineTo(X(s.d[i]), Y(s.d[i + 1]));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of page.texts) {
    if (!t.text) continue;
    const size = Math.max(10, t.size * (w / 500));
    ctx.font = `800 ${size}px system-ui, "Noto Naskh Arabic", sans-serif`;
    const tw = ctx.measureText(t.text).width + size;
    const th = size * 1.4;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillRect(X(t.x) - tw / 2, Y(t.y) - th / 2, tw, th);
    ctx.fillStyle = t.c;
    ctx.fillText(t.text, X(t.x), Y(t.y));
  }
  for (const s of page.stamps) {
    const label = (lang === "ar" ? (s.ar || s.en) : (s.en || s.ar)).slice(0, 16);
    const size = Math.max(12, 14 * (w / 500));
    ctx.font = `800 ${size}px system-ui, "Noto Naskh Arabic", sans-serif`;
    const tw = ctx.measureText(label).width + size * 1.2;
    const th = size * 1.8;
    const x = X(s.x), y = Y(s.y);
    ctx.fillStyle = s.color || "#0284c7";
    const r = th / 2;
    ctx.beginPath();
    ctx.moveTo(x - tw / 2 + r, y - th / 2);
    ctx.arcTo(x + tw / 2, y - th / 2, x + tw / 2, y + th / 2, r);
    ctx.arcTo(x + tw / 2, y + th / 2, x - tw / 2, y + th / 2, r);
    ctx.arcTo(x - tw / 2, y + th / 2, x - tw / 2, y - th / 2, r);
    ctx.arcTo(x - tw / 2, y - th / 2, x + tw / 2, y - th / 2, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, y);
  }
  return c;
}

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onload = () => res(im);
  im.onerror = () => rej(new Error("img"));
  im.src = src;
});

const svgToUrl = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

/** Nice printable A4 PDF of the student's photographed work with the teacher's marks and a per-topic QR. */
export async function hwCorrectionPdf(
  photos: HwPhoto[],
  annot: HwAnnot | null,
  loadPhoto: (id: string) => Promise<string>,
  meta: HwPdfMeta,
  lang: "en" | "ar" = "en",
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const AR = lang === "ar";
  const navy = "#1b3a57", sun = "#f5c542";
  const when = meta.date ? new Date(meta.date).toLocaleDateString(AR ? "ar" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const cls = [meta.cls, meta.section].filter(Boolean).join(" · ");

  // Cover / header page
  pdf.setFillColor(27, 58, 87);
  pdf.rect(0, 0, W, 48, "F");
  pdf.setFillColor(245, 197, 66);
  pdf.rect(0, 48, W, 3, "F");
  pdf.setTextColor(245, 197, 66);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(AR ? "الواجب المصحَّح" : "Corrected homework", AR ? W - 14 : 14, 16, { align: AR ? "right" : "left" });
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(22);
  const title = (meta.title || "").slice(0, 80);
  pdf.text(title, AR ? W - 14 : 14, 30, { align: AR ? "right" : "left" });
  pdf.setFontSize(12);
  pdf.text([meta.student, cls].filter(Boolean).join("  ·  "), AR ? W - 14 : 14, 40, { align: AR ? "right" : "left" });

  pdf.setTextColor(27, 58, 87);
  pdf.setFontSize(11);
  let y = 64;
  if (when) { pdf.text(AR ? `التاريخ: ${when}` : `Date: ${when}`, AR ? W - 14 : 14, y, { align: AR ? "right" : "left" }); y += 8; }
  if (meta.teacher) { pdf.text(AR ? `المعلم: ${meta.teacher}` : `Teacher: ${meta.teacher}`, AR ? W - 14 : 14, y, { align: AR ? "right" : "left" }); y += 8; }

  if (meta.token) {
    const url = `${(meta.origin || (typeof location !== "undefined" ? location.origin : "")).replace(/\/$/, "")}/q?t=${meta.token}`;
    const qr = await loadImg(svgToUrl(qrSvg(url, 280)));
    const qs = 42;
    const qx = AR ? 14 : W - 14 - qs;
    pdf.addImage(qr, "PNG", qx, 58, qs, qs);
    pdf.setFontSize(8);
    pdf.setTextColor(59, 87, 112);
    const cap = AR ? "امسح لرؤية العمل والتصحيح" : "Scan to see the work and correction";
    pdf.text(cap, qx + qs / 2, 58 + qs + 5, { align: "center", maxWidth: 50 });
  }

  y = Math.max(y, 112);
  const next = (meta.next || annot?.next || []).filter(Boolean);
  if (next.length) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(27, 58, 87);
    pdf.text(AR ? "الخطوات التالية" : "Next Steps", AR ? W - 14 : 14, y, { align: AR ? "right" : "left" });
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    for (const n of next.slice(0, 12)) {
      const lines = pdf.splitTextToSize("• " + n, 180);
      if (y + lines.length * 6 > H - 20) break;
      pdf.text(lines, AR ? W - 14 : 14, y, { align: AR ? "right" : "left" });
      y += lines.length * 6;
    }
  }

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    let src = "";
    try { src = await loadPhoto(p.id); } catch { continue; }
    let im: HTMLImageElement;
    try { im = await loadImg(src); } catch { if (src.startsWith("blob:")) URL.revokeObjectURL(src); continue; }
    const page = pageOf(annot, p.id);
    const painted = await paintHwPage(im, p, page, AR ? "ar" : "en");
    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    const landscape = painted.width > painted.height;
    pdf.addPage("a4", landscape ? "landscape" : "portrait");
    const pw = landscape ? H : W, ph = landscape ? W : H;
    pdf.setFillColor(27, 58, 87);
    pdf.rect(0, 0, pw, 12, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${meta.student}  ·  ${(meta.title || "").slice(0, 50)}  ·  ${i + 1}/${photos.length}`, AR ? pw - 8 : 8, 8, { align: AR ? "right" : "left" });
    const maxW = pw - 16, maxH = ph - 24;
    const scale = Math.min(maxW / painted.width, maxH / painted.height);
    const dw = painted.width * scale, dh = painted.height * scale;
    const dx = (pw - dw) / 2, dy = 16 + (maxH - dh) / 2;
    pdf.addImage(painted.toDataURL("image/jpeg", 0.92), "JPEG", dx, dy, dw, dh);
  }

  const file = `${safeFileName(meta.title || "homework")}-correction.pdf`;
  const blob = pdf.output("blob");
  downloadBlob(blob, file);
}
