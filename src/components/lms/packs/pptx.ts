"use client";

import { mediaUpload, uid, type El, type Slide } from "@/lib/packs";

/** t315 → t394: PowerPoint (.pptx) import as editable slides.
 *  Walks each slide's shape tree in drawing order (so pictures no longer cover the text), including grouped shapes and tables.
 *  Placeholder text takes its position, size and colour from the slide layout / master when the slide doesn't set them;
 *  theme colours (schemeClr) are resolved; slide / layout / master background colours and pictures are kept. */
type X = Element;
const A = (n: X | Document | null | undefined, tag: string) => (n ? [...n.getElementsByTagName(tag)] : []);
const kids = (n: X, tag?: string) => [...n.children].filter((c) => !tag || c.tagName === tag);
const first = (n: X | Document | null | undefined, tag: string) => (n ? n.getElementsByTagName(tag)[0] : undefined);

export async function importPptx(file: File, asAdmin: boolean, onStep?: (i: number, n: number) => void): Promise<Slide[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const xml = async (p: string) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("text"), "application/xml") : null; };
  const relsOf = async (path: string) => { const r = await xml(path.replace(/([^/]+)$/, "_rels/$1.rels")); const dir = path.replace(/[^/]+$/, ""); return new Map(A(r, "Relationship").map((x) => [x.getAttribute("Id") || "", { t: norm(dir + (x.getAttribute("Target") || "")), type: x.getAttribute("Type") || "" }])); };
  const pres = await xml("ppt/presentation.xml");
  const sz = first(pres, "p:sldSz");
  const W = Number(sz?.getAttribute("cx")) || 12192000, H = Number(sz?.getAttribute("cy")) || 6858000;
  const prels = await relsOf("ppt/presentation.xml");
  const order = A(pres, "p:sldId").map((s) => prels.get(s.getAttribute("r:id") || "")?.t || "").filter(Boolean);
  const files = order.length ? order : Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
  // Theme colours
  const theme = await xml("ppt/theme/theme1.xml");
  const scheme: Record<string, string> = {};
  const cs = first(theme, "a:clrScheme");
  if (cs) for (const c of kids(cs)) { const k = c.tagName.replace("a:", ""); const v = first(c, "a:srgbClr")?.getAttribute("val") || first(c, "a:sysClr")?.getAttribute("lastClr"); if (v) scheme[k] = v; }
  const map: Record<string, string> = { tx1: "dk1", tx2: "dk2", bg1: "lt1", bg2: "lt2" };
  const colorOf = (n: X | undefined): string => {
    if (!n) return "";
    const s = kids(n).find((c) => c.tagName === "a:srgbClr" || c.tagName === "a:schemeClr" || c.tagName === "a:sysClr") || first(n, "a:srgbClr") || first(n, "a:schemeClr");
    if (!s) return "";
    if (s.tagName === "a:srgbClr") return "#" + s.getAttribute("val");
    if (s.tagName === "a:sysClr") return "#" + (s.getAttribute("lastClr") || "000000");
    const k = s.getAttribute("val") || ""; const v = scheme[map[k] || k]; return v ? "#" + v : "";
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const pxOf = (pt: number) => Math.max(10, Math.min(140, Math.round(pt * (1600 / ((W / 914400) * 72)))));
  type Xf = { x: number; y: number; w: number; h: number };
  const xfOf = (n: X | undefined): Xf | null => { const x = n && (first(n, "a:xfrm") || first(n, "p:xfrm")); const off = x && first(x, "a:off"), ext = x && first(x, "a:ext"); return off && ext ? { x: Number(off.getAttribute("x")), y: Number(off.getAttribute("y")), w: Number(ext.getAttribute("cx")), h: Number(ext.getAttribute("cy")) } : null; };
  const phKey = (sp: X) => { const ph = first(sp, "p:ph"); if (!ph) return null; return { type: ph.getAttribute("type") || "body", idx: ph.getAttribute("idx") || "" }; };
  type PhInfo = { xf: Xf | null; sz: number; color: string; bold: boolean };
  const phMap = (doc: Document | null) => {
    const out: { type: string; idx: string; info: PhInfo }[] = [];
    for (const sp of A(doc, "p:sp")) { const k = phKey(sp); if (!k) continue; const d = first(sp, "a:lvl1pPr") ? first(first(sp, "a:lvl1pPr"), "a:defRPr") : first(sp, "a:defRPr"); out.push({ ...k, info: { xf: xfOf(first(sp, "p:spPr")), sz: Number(d?.getAttribute("sz")) / 100 || 0, color: colorOf(d ? first(d, "a:solidFill") : undefined), bold: d?.getAttribute("b") === "1" } }); }
    return out;
  };
  const masterStyle = (doc: Document | null, which: "p:titleStyle" | "p:bodyStyle" | "p:otherStyle") => { const st = first(first(doc, "p:txStyles"), which); const d = st && first(first(st, "a:lvl1pPr"), "a:defRPr"); return { sz: Number(d?.getAttribute("sz")) / 100 || 0, color: colorOf(d ? first(d, "a:solidFill") : undefined) }; };
  const find = (list: { type: string; idx: string; info: PhInfo }[], k: { type: string; idx: string }) => list.find((p) => k.idx && p.idx === k.idx) || list.find((p) => p.type === k.type) || (k.type === "ctrTitle" ? list.find((p) => p.type === "title") : k.type === "subTitle" ? list.find((p) => p.type === "body") : undefined);
  const bgOf = async (doc: Document | null, rels: Map<string, { t: string }>): Promise<{ color?: string; img?: string } | null> => {
    const bg = first(doc, "p:bg"); if (!bg) return null;
    const blip = first(bg, "a:blip"); const emb = blip?.getAttribute("r:embed");
    if (emb && rels.get(emb)) { const id = await upload(rels.get(emb)!.t); if (id) return { img: id }; }
    const c = colorOf(first(bg, "a:solidFill")) || colorOf(first(bg, "p:bgRef")); return c ? { color: c } : null;
  };
  const upCache = new Map<string, Promise<string>>();
  const upload = (path: string) => {
    if (!upCache.has(path)) upCache.set(path, (async () => {
      const f = zip.file(path); if (!f || !/\.(png|jpe?g|gif|webp)$/i.test(path)) return "";
      const ext = path.split(".").pop()!.toLowerCase();
      const blob = new Blob([await f.async("arraybuffer")], { type: ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg" });
      try { return await mediaUpload(blob, asAdmin); } catch { return ""; }
    })());
    return upCache.get(path)!;
  };
  const out: Slide[] = [];
  for (const [i, path] of files.slice(0, 60).entries()) {
    onStep?.(i + 1, files.length);
    const doc = await xml(path); if (!doc) continue;
    const rels = await relsOf(path);
    const layoutPath = [...rels.values()].find((r) => /slideLayout/.test(r.type))?.t || "";
    const layout = layoutPath ? await xml(layoutPath) : null; const lrels = layoutPath ? await relsOf(layoutPath) : new Map();
    const masterPath = layoutPath ? [...lrels.values()].find((r) => /slideMaster/.test(r.type))?.t || "" : "";
    const master = masterPath ? await xml(masterPath) : null; const mrels = masterPath ? await relsOf(masterPath) : new Map();
    const lph = phMap(layout), mph = phMap(master);
    const titleSt = masterStyle(master, "p:titleStyle"), bodySt = masterStyle(master, "p:bodyStyle");
    const els: El[] = [];
    const bg = (await bgOf(doc, rels)) || (await bgOf(layout, lrels)) || (await bgOf(master, mrels));
    if (bg?.img) els.push({ id: uid(), t: "img", src: bg.img, x: 0, y: 0, w: 100, h: 100 } as El);
    // Pictures drawn on the layout / master (logos, banners) go underneath the slide's own content.
    for (const [d, rr] of [[master, mrels], [layout, lrels]] as const) for (const pic of A(first(d, "p:spTree"), "p:pic")) { const emb = first(pic, "a:blip")?.getAttribute("r:embed"); const t = emb && rr.get(emb)?.t; const xf = xfOf(first(pic, "p:spPr")); if (!t || !xf) continue; const id = await upload(t); if (id) els.push({ id: uid(), t: "img", src: id, x: r1((xf.x / W) * 100), y: r1((xf.y / H) * 100), w: r1((xf.w / W) * 100), h: r1((xf.h / H) * 100) } as El); }
    type G = { ox: number; oy: number; sx: number; sy: number; cx: number; cy: number };
    const put = (xf: Xf, g: G) => { const x = g.ox + (xf.x - g.cx) * g.sx, y = g.oy + (xf.y - g.cy) * g.sy; return { x: r1((x / W) * 100), y: r1((y / H) * 100), w: r1(Math.max(2, ((xf.w * g.sx) / W) * 100)), h: r1(Math.max(2, ((xf.h * g.sy) / H) * 100)) }; };
    const textOf = (body: X, bullets: boolean) => A(body, "a:p").map((p) => { const t = A(p, "a:t").map((x) => x.textContent || "").join(""); const noBu = first(p, "a:buNone"); const lvl = Number(first(p, "a:pPr")?.getAttribute("lvl") || 0); return t && bullets && !noBu ? `${"  ".repeat(lvl)}• ${t}` : t; }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const walk = async (tree: X, g: G) => {
      for (const n of kids(tree)) {
        if (n.tagName === "p:grpSp") {
          const x = first(first(n, "p:grpSpPr"), "a:xfrm"); const off = x && first(x, "a:off"), ext = x && first(x, "a:ext"), co = x && first(x, "a:chOff"), ce = x && first(x, "a:chExt");
          if (off && ext && co && ce) { const cw = Number(ce.getAttribute("cx")) || 1, ch = Number(ce.getAttribute("cy")) || 1; const outer = put({ x: Number(off.getAttribute("x")), y: Number(off.getAttribute("y")), w: Number(ext.getAttribute("cx")), h: Number(ext.getAttribute("cy")) }, g);
            await walk(n, { ox: (outer.x / 100) * W, oy: (outer.y / 100) * H, sx: ((outer.w / 100) * W) / cw, sy: ((outer.h / 100) * H) / ch, cx: Number(co.getAttribute("x")), cy: Number(co.getAttribute("y")) }); }
          else await walk(n, g);
        } else if (n.tagName === "p:sp") {
          const body = first(n, "p:txBody"); const k = phKey(n);
          const inh = k ? find(lph, k)?.info || find(mph, k)?.info : undefined;
          const xf = xfOf(first(n, "p:spPr")) || inh?.xf || (k ? find(mph, k)?.info.xf : null);
          const fill = colorOf(kids(first(n, "p:spPr") || n).find((c) => c.tagName === "a:solidFill"));
          const text = body ? textOf(body, !!k && !/title|ctrTitle|subTitle/.test(k.type) && k.type !== "sldNum") : "";
          if (!xf || (!text && !fill)) continue;
          if (k && /sldNum|dt|ftr/.test(k.type)) continue;
          const rpr = body && (first(body, "a:rPr") || first(body, "a:endParaRPr"));
          const isTitle = !!k && /title|ctrTitle/i.test(k.type);
          const st = isTitle ? titleSt : bodySt;
          const pt = Number(rpr?.getAttribute("sz")) / 100 || Number(body && first(body, "a:defRPr")?.getAttribute("sz")) / 100 || inh?.sz || st.sz || (isTitle ? 40 : k ? 24 : 18);
          const clr = colorOf(rpr ? first(rpr, "a:solidFill") : undefined) || inh?.color || st.color || colorOf(first(first(n, "p:style"), "a:fontRef")) || (scheme.dk1 ? "#" + scheme.dk1 : "#1b2f44");
          const algn = body && first(body, "a:pPr")?.getAttribute("algn");
          const p = put(xf, g);
          els.push({ id: uid(), t: "text", text: text.slice(0, 4000), font: "Nunito", size: pxOf(pt), color: clr, bg: fill || undefined, bold: rpr?.getAttribute("b") === "1" || isTitle || !!inh?.bold, align: algn === "ctr" ? "center" : algn === "r" ? "end" : undefined, ...p } as El);
        } else if (n.tagName === "p:pic") {
          const emb = first(n, "a:blip")?.getAttribute("r:embed"); const t = emb && rels.get(emb)?.t; const xf = xfOf(first(n, "p:spPr")); if (!t || !xf) continue;
          const id = await upload(t); if (id) els.push({ id: uid(), t: "img", src: id, ...put(xf, g) } as El);
        } else if (n.tagName === "p:graphicFrame") {
          const tbl = first(n, "a:tbl"); const xf = xfOf(n); if (!tbl || !xf) continue;
          const rows = A(tbl, "a:tr").map((tr) => A(tr, "a:tc").map((tc) => A(tc, "a:t").map((x) => x.textContent || "").join(" ").trim()).join("  |  "));
          const rp = first(tbl, "a:rPr"); const pt = Number(rp?.getAttribute("sz")) / 100 || 16;
          els.push({ id: uid(), t: "text", text: rows.join("\n").slice(0, 4000), font: "Nunito", size: pxOf(pt), color: colorOf(rp ? first(rp, "a:solidFill") : undefined) || "#1b2f44", bg: "#ffffffcc", ...put(xf, g) } as El);
        }
      }
    };
    const tree = first(doc, "p:spTree");
    if (tree) await walk(tree, { ox: 0, oy: 0, sx: 1, sy: 1, cx: 0, cy: 0 });
    out.push({ id: uid("s"), bg: bg?.color || "#ffffff", els: els.slice(0, 80) });
  }
  return out;
}
function norm(p: string) { const parts: string[] = []; for (const s of p.split("/")) { if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s); } return parts.join("/"); }
