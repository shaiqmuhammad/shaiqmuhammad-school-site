"use client";

/** Shared helpers for client-side downloads (Word / Excel / PowerPoint / PDF). */

export function downloadBlob(blob: Blob, filename: string): void {
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
  const style = `<style>.pg{box-sizing:border-box;width:${pageW}px;height:${pageH}px;padding:${pad}px;background:#fff;color:#111;font:15px/1.5 Arial,"Noto Naskh Arabic","Noto Sans Arabic",Tahoma,sans-serif;overflow:hidden}
.pg *{box-sizing:border-box}.blk{padding:6px 0 10px;break-inside:avoid}.ar{direction:rtl;text-align:right;font-family:"Noto Naskh Arabic","Geeza Pro",Tahoma,Arial,sans-serif}
.pg h1{font-size:24px;margin:0 0 4px}.pg h2{font-size:17px;margin:0 0 6px}.muted{color:#555}.opt{margin:2px 0 2px 18px}.pg img{max-width:100%;max-height:260px}
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
    for (let i = 0; i < pages.length; i++) {
      const pg = document.createElement("div");
      pg.className = "pg";
      pg.innerHTML = pages[i].map((h) => `<div class="blk">${h}</div>`).join("") + `<div class="muted" style="position:absolute;bottom:18px;right:${pad}px;font-size:11px">${i + 1} / ${pages.length}</div>`;
      pg.style.position = "relative";
      host.appendChild(pg);
      await Promise.all(Array.from(pg.querySelectorAll("img")).map((im) => (im.complete ? null : im.decode().catch(() => null))));
      const canvas = await html2canvas(pg, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph);
      pg.remove();
    }
    downloadBlob(pdf.output("blob"), filename);
  } finally {
    host.remove();
  }
}
