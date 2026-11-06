"use client";

import { mediaUpload, uid, type El, type Slide } from "@/lib/packs";

/** t429: PDF → one slide per page. Each page is drawn to a picture (full-slide, sent to back) so teachers and students
 *  can type, draw, record and add on top of it — no single iframe slide any more. */
export async function importPdf(file: File, asAdmin: boolean, onStep?: (i: number, n: number) => void): Promise<Slide[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = Math.min(doc.numPages, 80);
  const out: Slide[] = [];
  for (let i = 1; i <= n; i++) {
    onStep?.(i, n);
    const page = await doc.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 1600 / v0.width);
    const v = page.getViewport({ scale });
    const c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height);
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: v }).promise;
    const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("render"))), "image/jpeg", 0.86));
    const src = await mediaUpload(blob, asAdmin);
    // Fit the page inside the 16:9 slide, centred (portrait pages keep their shape).
    const ar = v.width / v.height, slideAr = 16 / 9;
    const w = ar >= slideAr ? 100 : Math.round((ar / slideAr) * 1000) / 10, h = ar >= slideAr ? Math.round((slideAr / ar) * 1000) / 10 : 100;
    out.push({ id: uid("s"), bg: "#ffffff", els: [{ id: uid(), t: "img", src, x: Math.round(((100 - w) / 2) * 10) / 10, y: Math.round(((100 - h) / 2) * 10) / 10, w, h } as El] });
  }
  return out;
}
