"use client";

import { docUrl, mediaUrl, PART_LABEL, fmtT, slideKind, type El, type Pack, type Slide } from "@/lib/packs";
import { cleanHtml } from "./SlideView";

/** t645: download a Lesson Builder pack as an editable PowerPoint (.pptx), made in the browser.
 *  Every slide (lesson, activity / Task and homework) keeps its background colour, text (bold / italic / underline, colour, font, size, alignment),
 *  pictures (crop and rotation) and pen drawings (as a picture). Videos, recordings, YouTube, activities and Quran blocks become labelled boxes;
 *  YouTube and uploaded documents keep a clickable link. Slide type, timer and instructions go into the speaker notes. */
const W = 13.333, H = 7.5; // LAYOUT_WIDE, inches
const PT = (960 / 1600); // text size is px on a 1600-wide slide; the slide is 960pt wide

type Col = { color: string; transparency: number } | null;
let ctx: CanvasRenderingContext2D | null = null;
function parseColor(c: string | undefined): Col {
  if (!c) return null;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = c;
  const v = String(ctx.fillStyle);
  if (v === "#010203" && c.trim().toLowerCase() !== "#010203") return null;
  if (v.startsWith("#")) return { color: v.slice(1).toUpperCase(), transparency: 0 };
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a <= 0.01) return null;
  const hex = [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { color: hex, transparency: Math.round((1 - a) * 100) };
}

const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("img")); i.src = src; });

/** Picture → data URL, cropped like the slide shows it. Returns its pixel size too (to fit it like object-contain). */
async function picture(id: string, asAdmin: boolean, crop?: El["crop"], aspect = 0): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const url = await mediaUrl(id, asAdmin);
    const type = (await fetch(url).then((r) => r.blob()).catch(() => null))?.type || "";
    const img = await loadImg(url);
    const c = { l: Math.max(0, Math.min(45, crop?.l || 0)), t: Math.max(0, Math.min(45, crop?.t || 0)), r: Math.max(0, Math.min(45, crop?.r || 0)), b: Math.max(0, Math.min(45, crop?.b || 0)) };
    let sx = img.naturalWidth * c.l / 100, sy = img.naturalHeight * c.t / 100;
    let sw = img.naturalWidth * (100 - c.l - c.r) / 100, sh = img.naturalHeight * (100 - c.t - c.b) / 100;
    // A cropped picture fills its box (object-cover): trim the longer side to the box shape.
    if (aspect > 0 && c.l + c.t + c.r + c.b > 0) { if (sw / sh > aspect) { const nw = sh * aspect; sx += (sw - nw) / 2; sw = nw; } else { const nh = sw / aspect; sy += (sh - nh) / 2; sh = nh; } }
    const k = Math.min(1, 2000 / Math.max(sw, sh, 1));
    const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
    cv.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    const jpg = /jpe?g/.test(type);
    return { data: cv.toDataURL(jpg ? "image/jpeg" : "image/png", 0.9), w: cv.width, h: cv.height };
  } catch { return null; }
}


type Run = { text: string; options?: { bold?: boolean; italic?: boolean; underline?: { style: "sng" }; breakLine?: boolean } };
/** Rich text (b / i / u / br only, as the editor keeps it) → PowerPoint text runs. */
function runsOf(e: Extract<El, { t: "text" }>): Run[] {
  const out: Run[] = [];
  const push = (text: string, b: boolean, i: boolean, u: boolean) => { if (text) out.push({ text, options: { bold: b || undefined, italic: i || undefined, underline: u ? { style: "sng" } : undefined } }); };
  const brk = () => { if (out.length) out[out.length - 1].options = { ...out[out.length - 1].options, breakLine: true }; else out.push({ text: "", options: { breakLine: true } }); };
  if (e.html) {
    const doc = new DOMParser().parseFromString(`<div>${cleanHtml(e.html)}</div>`, "text/html");
    const walk = (n: Node, b: boolean, i: boolean, u: boolean) => {
      if (n.nodeType === 3) { const parts = (n.textContent || "").split("\n"); parts.forEach((t, k) => { if (k) brk(); push(t, b, i, u); }); return; }
      if (n.nodeType !== 1) return;
      const tag = (n as HTMLElement).tagName;
      if (tag === "BR") { brk(); return; }
      for (const c of n.childNodes) walk(c, b || tag === "B", i || tag === "I", u || tag === "U");
    };
    if (doc.body.firstChild) walk(doc.body.firstChild, !!e.bold, !!e.italic, false);
  } else {
    (e.text || "").split("\n").forEach((t, k) => { if (k) brk(); push(t, !!e.bold, !!e.italic, false); });
  }
  return out.length ? out : [{ text: " " }];
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type PptxPack = Pick<Pack, "title"> & Partial<Pick<Pack, "type" | "subject" | "ownerName">> & { slides?: Slide[] };

export async function exportPackPptx(pack: PptxPack, asAdmin: boolean, onStep?: (i: number, n: number) => void): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = pack.title || "Lesson";
  if (pack.subject) pptx.subject = pack.subject;
  if (pack.ownerName) pptx.author = pack.ownerName;
  const slides = pack.slides?.length ? pack.slides : [];
  const ix = (v: number) => (Math.max(-50, Math.min(150, Number(v) || 0)) / 100) * W;
  const iy = (v: number) => (Math.max(-50, Math.min(150, Number(v) || 0)) / 100) * H;
  for (let si = 0; si < slides.length; si++) {
    onStep?.(si + 1, slides.length);
    const sl = slides[si];
    const s = pptx.addSlide();
    const bg = parseColor(sl.bg || "#ffffff");
    s.background = { color: bg?.color || "FFFFFF" };
    for (const e of sl.els || []) {
      const x = ix(e.x), y = iy(e.y), w = Math.max(0.05, ix(e.w)), h = Math.max(0.05, iy(e.h));
      const rotate = e.rot ? Math.round(e.rot) : undefined;
      if (e.t === "text") {
        const ar = ARABIC.test(e.text || e.html || "");
        const align = e.align === "center" ? "center" : e.align === "end" ? (ar ? "left" : "right") : (ar ? "right" : "left");
        const col = parseColor(e.color) || { color: "1B2F44", transparency: 0 };
        const fill = parseColor(e.bg);
        s.addText(runsOf(e), {
          x, y, w, h, rotate, valign: "top", align, fontFace: e.font || "Arial", fontSize: Math.max(6, Math.round(e.size * PT * 10) / 10), color: col.color,
          fill: fill ? { color: fill.color, transparency: fill.transparency } : undefined, margin: 0.04 * 72, lineSpacingMultiple: 1.1, rtlMode: ar || undefined, lang: ar ? "ar-SA" : undefined, fit: "none",
          objectName: `${ar ? "rtl" : "txt"}-${e.id}`,
        });
      } else if (e.t === "img") {
        const pic = await picture(e.src, asAdmin, e.crop, w / h);
        if (!pic) { box(s, x, y, w, h, "🖼️ Picture", "E2E8F0", "475569"); continue; }
        const cropped = !!(e.crop && (e.crop.l || e.crop.t || e.crop.r || e.crop.b));
        const k = Math.min(w / pic.w, h / pic.h);
        const pw = cropped ? w : pic.w * k, ph = cropped ? h : pic.h * k;
        s.addImage({ data: pic.data, x: x + (w - pw) / 2, y: y + (h - ph) / 2, w: pw, h: ph, rotate });
      } else if (e.t === "draw") {
        // Each pen stroke becomes its own editable freeform line (custom geometry), not a flattened picture.
        (e.paths || []).forEach((p, k) => {
          const d = p.d || []; if (d.length < 2) return;
          const xs: number[] = [], ys: number[] = [];
          for (let j = 0; j + 1 < d.length; j += 2) { xs.push((Number(d[j]) || 0) / 100 * W); ys.push((Number(d[j + 1]) || 0) / 100 * H); }
          if (xs.length === 1) { xs.push(xs[0] + 0.01); ys.push(ys[0]); }
          const minX = Math.min(...xs), minY = Math.min(...ys);
          const bw = Math.max(0.01, Math.max(...xs) - minX), bh = Math.max(0.01, Math.max(...ys) - minY);
          const col = parseColor(p.c) || { color: "000000", transparency: 0 };
          s.addShape("custGeom" as unknown as Parameters<typeof s.addShape>[0], {
            x: minX, y: minY, w: bw, h: bh, objectName: `pen-${e.id}-${k}`,
            points: xs.map((x, j) => (j === 0 ? { x: x - minX, y: ys[j] - minY, moveTo: true } : { x: x - minX, y: ys[j] - minY })),
            line: { color: col.color, transparency: col.transparency || undefined, width: Math.max(0.5, Math.round((p.w || 1) * 0.005 * 960 * 10) / 10) },
          });
        });
      } else if (e.t === "yt") {
        box(s, x, y, w, h, `▶ ${e.title || "YouTube video"}`, "1E293B", "FFFFFF", e.vid ? `https://www.youtube.com/watch?v=${encodeURIComponent(e.vid)}` : undefined);
      } else if (e.t === "act") {
        box(s, x, y, w, h, `🎲 ${e.label || e.code || e.quiz || "Activity"}`, "EDE9FE", "4C1D95");
      } else if (e.t === "quran") {
        box(s, x, y, w, h, `📖 Surah ${e.surah} · ${e.from}–${e.to}${e.memorise ? " · memorise" : ""}`, "FFFBEB", "78350F");
      } else if (e.t === "doc") {
        box(s, x, y, w, h, `📄 ${e.name || (e.kind === "pdf" ? "PDF" : "PowerPoint")}`, "F1F5F9", "0F172A", docUrl(e.src));
      } else if (e.t === "audio") {
        box(s, x, y, w, h, "🎙️ Audio recording", "FFFBEB", "78350F");
      } else if (e.t === "video") {
        box(s, x, y, w, h, "🎥 Video recording", "111827", "FFFFFF");
      }
    }
    const kind = slideKind(sl, pack.type);
    const notes = [
      kind ? `${PART_LABEL[kind][1]} · ${PART_LABEL[kind][2]}` : "",
      sl.timer ? `Timer: ${fmtT(sl.timer)}` : "",
      sl.instr ? `Instructions: ${sl.instr}` : "",
    ].filter(Boolean).join("\n");
    if (notes) s.addNotes(notes);
  }
  const name = (pack.title || "lesson").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 80) || "lesson";
  const raw = (await pptx.write({ outputType: "arraybuffer", compression: true })) as ArrayBuffer;
  const blob = await polish(raw);
  const a = document.createElement("a"); const href = URL.createObjectURL(blob);
  a.href = href; a.download = `${name}.pptx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** Final touches PowerPoint needs for editing:
 *  - Arabic text boxes: paragraphs right-to-left (rtl="1") and runs tagged ar-SA (lang + complex-script font), so typing and cursor movement work.
 *  - Pen strokes: no fill, round caps and joins. */
async function polish(buf: ArrayBuffer): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  for (const path of Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))) {
    const xml = await zip.file(path)!.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    let touched = false;
    for (const sp of [...doc.getElementsByTagName("p:sp")]) {
      const name = sp.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") || "";
      if (name.startsWith("rtl-")) {
        for (const para of [...sp.getElementsByTagName("a:p")]) {
          let ppr = [...para.children].find((c) => c.tagName === "a:pPr");
          if (!ppr) { ppr = doc.createElementNS(A, "a:pPr"); para.insertBefore(ppr, para.firstChild); }
          ppr.setAttribute("rtl", "1");
          for (const rpr of [...para.getElementsByTagName("a:rPr"), ...para.getElementsByTagName("a:endParaRPr")]) {
            rpr.setAttribute("lang", "ar-SA"); rpr.setAttribute("altLang", "en-US");
            const latin = [...rpr.children].find((c) => c.tagName === "a:latin");
            if (latin && ![...rpr.children].some((c) => c.tagName === "a:cs")) {
              const cs = doc.createElementNS(A, "a:cs"); cs.setAttribute("typeface", latin.getAttribute("typeface") || "Arial");
              const after = [...rpr.children].find((c) => c.tagName === "a:ea" || c.tagName === "a:sym" || c.tagName === "a:hlinkClick");
              rpr.insertBefore(cs, after || null);
            }
          }
        }
        touched = true;
      } else if (name.startsWith("pen-")) {
        const sppr = sp.getElementsByTagName("p:spPr")[0];
        const ln = sp.getElementsByTagName("a:ln")[0];
        if (sppr && ln) {
          for (const f of [...sppr.children].filter((c) => c.tagName === "a:solidFill" || c.tagName === "a:noFill")) sppr.removeChild(f);
          sppr.insertBefore(doc.createElementNS(A, "a:noFill"), ln);
          ln.setAttribute("cap", "rnd");
          if (![...ln.children].some((c) => c.tagName === "a:round")) { const r = doc.createElementNS(A, "a:round"); const tail = [...ln.children].find((c) => c.tagName === "a:headEnd" || c.tagName === "a:tailEnd"); ln.insertBefore(r, tail || null); }
        }
        touched = true;
      }
    }
    if (touched) zip.file(path, new XMLSerializer().serializeToString(doc));
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

type PSlide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;
function box(s: PSlide, x: number, y: number, w: number, h: number, label: string, fill: string, color: string, url?: string) {
  s.addText(url ? [{ text: label, options: { hyperlink: { url }, color } }] : label, {
    x, y, w, h, shape: "roundRect", rectRadius: 0.12, fill: { color: fill }, color, bold: true, align: "center", valign: "middle",
    fontSize: Math.max(10, Math.min(28, Math.round(h * 10))), fontFace: "Arial",
  });
}
