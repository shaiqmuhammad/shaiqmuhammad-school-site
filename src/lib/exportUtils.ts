"use client";

import { dlAllowed } from "@/lib/dl";

/** Shared helpers for client-side downloads (Word / Excel / PowerPoint / PDF). */

export function downloadBlob(blob: Blob, filename: string): void {
  if (!dlAllowed("export")) { alert("Downloads are switched off for your account. / التنزيل غير مفعّل لحسابك."); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFileName(s: string): string {
  return (s || "assessment").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "assessment";
}

export function isArabic(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s || "");
}

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Loads any image (incl. SVG) and returns PNG bytes + size, or null when it can't be read (CORS etc.). */
export async function imageToPng(src: string, maxWidth = 900): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const w0 = img.naturalWidth || 400;
    const h0 = img.naturalHeight || 300;
    const scale = Math.min(1, maxWidth / w0);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/**
 * PDF from HTML blocks: the browser lays out the text (so Arabic is shaped and right-to-left
 * correctly with the device's fonts), html2canvas turns each A4 page into an image, jsPDF saves it.
 * Blocks are never split across pages.
 */
export async function htmlBlocksToPdf(blocksHtml: string[], filename: string, opts: { landscape?: boolean; css?: string } = {}): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const landscape = Boolean(opts.landscape);
  const pageW = landscape ? 1123 : 794;
  const pageH = landscape ? 794 : 1123;
  const pad = 48;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${pageW}px;background:#fff;color:#111;`;
  const style = `<style>.pg{box-sizing:border-box;width:${pageW}px;min-height:${pageH}px;height:auto;padding:${pad}px;background:#fff;color:#111;font:15px/1.55 Arial,"Noto Naskh Arabic","Noto Sans Arabic",Tahoma,sans-serif;overflow:visible}
.pg *{box-sizing:border-box}.blk{padding:8px 0 12px;break-inside:avoid}.ar{direction:rtl;text-align:right;font-family:"Noto Naskh Arabic","Geeza Pro",Tahoma,Arial,sans-serif}
.qno{display:inline-block;min-width:2em;font-weight:800;direction:ltr;unicode-bidi:isolate}
.pg h1{font-size:24px;margin:0 0 4px}.pg h2{font-size:17px;margin:0 0 6px}.muted{color:#555}.opt{margin:2px 0 2px 18px}.pg img{max-width:100%;max-height:220px;object-fit:contain}
.pg table{border-collapse:collapse;width:100%}.pg td,.pg th{border:1px solid #ccc;padding:4px 6px;text-align:start;font-size:13px}${opts.css || ""}</style>`;
  host.innerHTML = style;
  document.body.appendChild(host);
  try {
    const measure = document.createElement("div");
    measure.className = "pg";
    measure.style.height = "auto";
    host.appendChild(measure);
    const pages: string[][] = [[]];
    let used = 0;
    const room = pageH - pad * 2;
    for (const html of blocksHtml) {
      if (html === "<!--pagebreak-->") {
        if (pages[pages.length - 1].length) {
          pages.push([]);
          used = 0;
        }
        continue;
      }
      measure.innerHTML = `<div class="blk">${html}</div>`;
      await Promise.all(Array.from(measure.querySelectorAll("img")).map((im) => (im.complete ? null : im.decode().catch(() => null))));
      const h = (measure.firstElementChild as HTMLElement).offsetHeight;
      if (used + h > room && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(html);
      used += h;
    }
    measure.remove();
    const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const scale = 2;
    let sheet = 0;
    const paint = async (html: string, pageNo: number, pageCount: number) => {
      const pg = document.createElement("div");
      pg.className = "pg";
      pg.style.position = "relative";
      pg.style.height = "auto";
      pg.style.overflow = "visible";
      pg.innerHTML = html + `<div class="muted" style="margin-top:12px;text-align:end;font-size:11px">${pageNo} / ${pageCount}</div>`;
      host.appendChild(pg);
      await Promise.all(Array.from(pg.querySelectorAll("img")).map((im) => (im.complete ? null : im.decode().catch(() => null))));
      const canvas = await html2canvas(pg, { scale, backgroundColor: "#ffffff", useCORS: true, logging: false });
      pg.remove();
      const slices = Math.max(1, Math.ceil((canvas.height - 1) / (pageH * scale)));
      for (let s = 0; s < slices; s++) {
        if (sheet > 0) pdf.addPage();
        sheet++;
        const sy = Math.round(s * pageH * scale);
        const sh = Math.min(canvas.height - sy, Math.round(pageH * scale));
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.max(1, sh);
        const ctx = slice.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
        const drawH = Math.min(ph, (sh / scale) * (pw / pageW));
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, drawH);
      }
    };
    let shown = 0;
    const total = pages.reduce((n, blocks) => n + Math.max(1, blocks.length ? 1 : 0), 0) || 1;
    for (let i = 0; i < pages.length; i++) {
      if (!pages[i].length) continue;
      shown++;
      await paint(pages[i].map((h) => `<div class="blk">${h}</div>`).join(""), shown, Math.max(shown, total));
    }
    downloadBlob(pdf.output("blob"), filename);
  } finally {
    host.remove();
  }
}
