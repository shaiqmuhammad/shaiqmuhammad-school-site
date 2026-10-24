"use client";

import { mediaUpload, uid, type El, type Slide } from "@/lib/packs";

/** t315: PowerPoint (.pptx) import — every slide becomes an editable slide: text boxes (with size/colour/bold) and pictures at their original positions. */
export async function importPptx(file: File, asAdmin: boolean, onStep?: (i: number, n: number) => void): Promise<Slide[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const xml = async (p: string) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("text"), "application/xml") : null; };
  const pres = await xml("ppt/presentation.xml");
  const sz = pres?.getElementsByTagName("p:sldSz")[0];
  const W = Number(sz?.getAttribute("cx")) || 12192000, H = Number(sz?.getAttribute("cy")) || 6858000;
  // Slide order from presentation.xml.rels
  const prels = await xml("ppt/_rels/presentation.xml.rels");
  const relMap = new Map([...(prels?.getElementsByTagName("Relationship") || [])].map((r) => [r.getAttribute("Id") || "", r.getAttribute("Target") || ""]));
  const order = [...(pres?.getElementsByTagName("p:sldId") || [])].map((s) => relMap.get(s.getAttribute("r:id") || "") || "").filter(Boolean).map((t) => "ppt/" + t.replace(/^\/?ppt\//, ""));
  const files = order.length ? order : Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
  const out: Slide[] = [];
  for (const [i, path] of files.slice(0, 60).entries()) {
    onStep?.(i + 1, files.length);
    const doc = await xml(path); if (!doc) continue;
    const rels = await xml(path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"));
    const rmap = new Map([...(rels?.getElementsByTagName("Relationship") || [])].map((r) => [r.getAttribute("Id") || "", r.getAttribute("Target") || ""]));
    const els: El[] = [];
    const pos = (n: Element) => { const off = n.getElementsByTagName("a:off")[0], ext = n.getElementsByTagName("a:ext")[0]; return { x: off ? (Number(off.getAttribute("x")) / W) * 100 : 5, y: off ? (Number(off.getAttribute("y")) / H) * 100 : 5, w: ext ? (Number(ext.getAttribute("cx")) / W) * 100 : 40, h: ext ? (Number(ext.getAttribute("cy")) / H) * 100 : 15 }; };
    const r1 = (v: number) => Math.round(v * 10) / 10;
    for (const sp of [...doc.getElementsByTagName("p:sp")]) {
      const paras = [...sp.getElementsByTagName("a:p")].map((p) => [...p.getElementsByTagName("a:t")].map((t) => t.textContent || "").join("")).filter((x, j, arr) => x || j < arr.length - 1);
      const text = paras.join("\n").trim(); if (!text) continue;
      const rpr = sp.getElementsByTagName("a:rPr")[0];
      const pt = Number(rpr?.getAttribute("sz")) / 100 || 18; // points on a 13.33in slide
      const clr = sp.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val");
      const p = pos(sp);
      els.push({ id: uid(), t: "text", text: text.slice(0, 4000), font: "Nunito", size: Math.max(12, Math.min(120, Math.round(pt * (1600 / ((W / 914400) * 72))))), color: clr ? `#${clr}` : "#1b2f44", bold: rpr?.getAttribute("b") === "1", x: r1(p.x), y: r1(p.y), w: r1(Math.max(5, p.w)), h: r1(Math.max(4, p.h)) } as El);
    }
    for (const pic of [...doc.getElementsByTagName("p:pic")]) {
      const emb = pic.getElementsByTagName("a:blip")[0]?.getAttribute("r:embed"); const tgt = emb && rmap.get(emb); if (!tgt) continue;
      const mp = "ppt/" + tgt.replace(/^(\.\.\/)+/, "");
      const f = zip.file(mp); if (!f || !/\.(png|jpe?g|gif|webp)$/i.test(mp)) continue;
      const ext = mp.split(".").pop()!.toLowerCase();
      const blob = new Blob([await f.async("arraybuffer")], { type: ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg" });
      try { const id = await mediaUpload(blob, asAdmin); const p = pos(pic); els.push({ id: uid(), t: "img", src: id, x: r1(p.x), y: r1(p.y), w: r1(p.w), h: r1(p.h) } as El); } catch { /* skip a picture that can't upload */ }
    }
    const bg = doc.getElementsByTagName("p:bg")[0]?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val");
    out.push({ id: uid("s"), bg: bg ? `#${bg}` : "#ffffff", els });
  }
  return out;
}
