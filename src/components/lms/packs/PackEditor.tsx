"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RosterPicker, rosterIds, useRosterData } from "@/components/lms/ClassLaunch";
import { inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { modCall, modErr, type CurUnit } from "@/lib/lmsMods";
import { blankSlide, lp, mediaUpload, TYPE_LABEL, uid, ytId, type Acc, type El, type Pack, type PackType, type Progress, type Slide } from "@/lib/packs";
import { SlideView } from "./SlideView";
import { AddTools, ElProps, withId, type Pen } from "./Tools";
import { importPptx } from "./pptx";
import { importPdf } from "./pdf";
import { PackPlayer } from "./PackPlayer";
import { LB_AR, LB_EN, LB_ICON, PART_LABEL, TIMERS, fmtT, mediaUrl, type Part } from "@/lib/packs";
import { unitToSow } from "@/components/lms/mods/SowTools";
import { AudioRecorder } from "@/components/lms/Audio";
import { InstrAudio } from "./SlideView";
import { QuranSetup } from "./QuranSetup";
import { SubjectPick } from "@/components/lms/SubjectPick";
import { requestElFullscreen } from "@/components/FocusMode";
import { registerSlideFocus, setPageFocus } from "@/components/FullscreenToggle";

/** t321: accent colours per pack type. */
const ACCENT: Record<PackType, { wrap: string; on: string; off: string; ring: string }> = {
  lesson: { wrap: "border-[#1b3a57]/30 from-slate-50 via-white to-amber-50", on: "bg-[#1b3a57] text-[#f5c542] ring-[#1b3a57]", off: "bg-slate-50 text-[#1b3a57] ring-slate-200", ring: "ring-[#1b3a57]" },
  activity: { wrap: "border-violet-200 from-violet-50 via-white to-sky-50", on: "bg-violet-700 text-white ring-violet-800", off: "bg-violet-50 text-violet-900 ring-violet-200", ring: "ring-violet-500" },
  material: { wrap: "border-sky-200 from-sky-50 via-white to-violet-50", on: "bg-sky-700 text-white ring-sky-800", off: "bg-sky-50 text-sky-900 ring-sky-200 hover:bg-sky-100", ring: "ring-sky-500" },
  homework: { wrap: "border-amber-200 from-amber-50 via-white to-rose-50", on: "bg-amber-600 text-white ring-amber-700", off: "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100", ring: "ring-amber-500" },
  quran: { wrap: "border-emerald-200 from-emerald-50 via-white to-teal-50", on: "bg-emerald-700 text-white ring-emerald-800", off: "bg-emerald-50 text-emerald-900 ring-emerald-200 hover:bg-emerald-100", ring: "ring-emerald-500" },
};
const THUMB = ["from-sky-100 to-sky-200", "from-violet-100 to-violet-200", "from-amber-100 to-amber-200", "from-emerald-100 to-emerald-200", "from-rose-100 to-rose-200", "from-teal-100 to-teal-200"];
/** t429: in-app clipboard (also written to the system clipboard as LBCLIP:… so it survives between tabs). */
type Clip = { kind: "slides"; slides: Slide[] } | { kind: "els"; els: El[] };
let CLIP: Clip | null = null;
const CLIP_TAG = "LBCLIP:";
const fresh = (sl: Slide): Slide => ({ ...sl, id: uid("s"), els: sl.els.map((e) => ({ ...e, id: uid() })) });
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable=true],[contenteditable='']");
const dtl = (ms: number) => (ms ? new Date(ms + 4 * 3600e3).toISOString().slice(0, 16) : "");
const fromDtl = (s: string) => (s ? Date.parse(`${s}:00+04:00`) : 0);

/** t315: Lesson Pack editor (admin + teachers). Slides, type, topic from the curriculum (with its standards), audience, dates, mode, live control and progress. */
export function PackEditor({ initial, acc, asAdmin, subjects, onClose }: { initial: Pack; acc: Acc; asAdmin: boolean; subjects: string[]; onClose: () => void }) {
  const { tr, lang } = useTr();
  const [p, setP] = useState<Pack>(initial);
  const [recIns, setRecIns] = useState(false);
  const [slides, setSlides] = useState<Slide[]>(initial.slides?.length ? initial.slides : [blankSlide()]);
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState("");
  const [pen, setPen] = useState<Pen>(null);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragI, setDragI] = useState<number | null>(null);
  const [overI, setOverI] = useState<number | null>(null);
  const [dropOn, setDropOn] = useState(false);
  const [keys, setKeys] = useState<string[]>(initial.aud || []);
  const [units, setUnits] = useState<CurUnit[] | null>(null);
  const [prog, setProg] = useState<Progress[] | null>(null);
  const [imp, setImp] = useState("");
  const [picked, setPicked] = useState<number[]>([]); // t429: multi-selected slides (Ctrl/⌘ or Shift click)
  const [menu, setMenu] = useState<{ x: number; y: number; i: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [work, setWork] = useState(false);
  const [hideRail, setHideRail] = useState(false);
  const [metaOpen, setMetaOpen] = useState(!initial.id);
  const area = useRef<"rail" | "canvas">("canvas");
  const canvasBox = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const fsOk = useRef(false);
  const { roster, groups } = useRosterData();
  const canSave = p.id ? acc.edit : acc.add;
  const onSubject = useCallback((subject: string) => { setP((x) => (x.subject === subject ? x : { ...x, subject })); setDirty(true); }, []);
  const arabic = /^islamic a$/i.test(p.subject);
  // t321: full-screen editor (only the side menu stays).
  useEffect(() => { document.body.classList.add("lp-full"); return () => document.body.classList.remove("lp-full"); }, []);
  useEffect(() => {
    const el = canvasBox.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (preview || typing(e.target)) return;
      if (Math.abs(e.deltaY) < 30) return;
      e.preventDefault();
      setCur((c) => (e.deltaY > 0 ? Math.min(slides.length - 1, c + 1) : Math.max(0, c - 1)));
      setSel(""); setPicked([]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [preview, slides.length]);
  useEffect(() => { modCall<{ items: CurUnit[] }>("cur-list", {}, asAdmin).then((r) => setUnits(r.items)).catch(() => setUnits([])); }, [asAdmin]);
  const ids = useMemo(() => (keys.length ? rosterIds(keys, roster, groups) : p.students), [keys, roster, groups, p.students]);
  const s = slides[Math.min(cur, slides.length - 1)];
  const setSlide = (fn: (x: Slide) => Slide) => { setSlides((all) => all.map((x, i) => (i === cur ? fn(x) : x))); setDirty(true); };
  const add = (e0: Omit<El, "id">) => { const n = s.els.filter((x) => x.t !== "draw").length; const e = (e0.t === "text" ? { ...e0, y: Math.min(80, e0.y + n * 6) } : e0) as Omit<El, "id">; const el = withId(e.t === "text" && arabic ? ({ ...e, font: "Amiri", text: "اكتب هنا" } as Omit<El, "id">) : e); setSlide((x) => ({ ...x, els: [...x.els, el] })); setSel(el.id); };
  const patch = (id: string, q: Partial<El>) => setSlide((x) => ({ ...x, els: x.els.map((e) => (e.id === id ? ({ ...e, ...q } as El) : e)) }));
  const draw = () => s.els.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined;
  const onStroke = (d: number[]) => setSlide((x) => { const dr = x.els.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined; const path = { c: pen!.c, w: pen!.w, d }; return dr ? { ...x, els: x.els.map((e) => (e === dr ? { ...dr, paths: [...dr.paths, path] } : e)) } : { ...x, els: [...x.els, { id: uid(), t: "draw", x: 0, y: 0, w: 100, h: 100, paths: [path] } as El] }; });
  const save = useCallback(async (quiet = false, over: Partial<Pack> = {}) => {
    if (!canSave) return null;
    setSaving(true);
    try {
      const r = await lp.save({ ...p, ...over, aud: keys, students: ids, slides }, asAdmin);
      setP(r.pack); setDirty(false); if (!quiet) setMsg(tr("Saved ✓", "تم الحفظ ✓"));
      return r.pack;
    } catch (e) { setMsg(modErr(e, tr) + ` (${(e as Error).message})`); return null; } finally { setSaving(false); }
  }, [p, keys, ids, slides, asAdmin, canSave, tr]);
  // Auto-save (existing packs) 2.5 s after the last change.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!dirty || !p.id) return; if (t.current) clearTimeout(t.current); t.current = setTimeout(() => { save(true).then((x) => x && setMsg(tr("Auto-saved ✓", "حُفظ تلقائيًا ✓"))); }, 2500); return () => { if (t.current) clearTimeout(t.current); }; }, [dirty, slides, p.id, save, tr]);
  const publish = async (off: boolean, now = false) => { const saved = await save(true, now ? { assignAt: 0 } : {}); if (!saved) return; try { const r = await lp.publish(saved.id, off, asAdmin); setP(r.pack); setMsg(off ? tr("Unpublished — students no longer see it.", "أُلغي النشر.") : r.pack.assignAt > Date.now() ? tr("Scheduled ✓", "تمت الجدولة ✓") : tr("Published ✓ — students can see it now.", "تم النشر ✓")); } catch (e) { const c = (e as Error).message; setMsg(c === "no_students" ? tr("Choose who it is for first.", "اختر الطلاب أولًا.") : c === "lp_needs_quran_slide" ? tr("Add a 📖 Quran block to a slide first.", "أضف مقطع قرآن أولًا.") : modErr(e, tr) + ` (${c})`); } };
  // ——— t429: slides & elements — select, copy / cut / paste / delete (keyboard, mouse, right-click) ———
  const pickedIdx = () => (picked.length ? [...picked].sort((a, b) => a - b) : [cur]);
  const insertSlides = (got: Slide[], at = cur) => { if (!got.length) return; const only = slides.length === 1 && !slides[0].els.length; setSlides((a) => (only ? got : [...a.slice(0, at + 1), ...got, ...a.slice(at + 1)])); setCur(only ? 0 : at + 1); setPicked([]); setSel(""); setDirty(true); };
  const delSlides = (idx: number[]) => { if (!canSave) return; const set = new Set(idx); if (set.size >= slides.length) { setSlides([blankSlide()]); setCur(0); } else { setSlides((a) => a.filter((_, i) => !set.has(i))); setCur((c) => Math.max(0, Math.min(c - [...set].filter((i) => i < c).length, slides.length - set.size - 1))); } setPicked([]); setSel(""); setDirty(true); setMsg(tr(`Deleted ${set.size} slide(s) — Ctrl/⌘+V pastes a copy back if you cut it.`, `حُذفت ${set.size} شريحة.`)); };
  const delEl = (id: string) => { const e = s.els.find((x) => x.id === id); if (!e || e.lock) return; setSlide((x) => ({ ...x, els: x.els.filter((q) => q.id !== id) })); setSel(""); };
  const makeClip = (): Clip => (sel && area.current === "canvas" && s.els.some((e) => e.id === sel) ? { kind: "els", els: s.els.filter((e) => e.id === sel) } : { kind: "slides", slides: pickedIdx().map((i) => slides[i]).filter(Boolean) });
  const putClip = (c: Clip, at = cur) => {
    if (c.kind === "els") { const els = c.els.map((e) => ({ ...e, id: uid(), lock: false, x: Math.min(90, e.x + 3), y: Math.min(90, e.y + 3) })); setSlide((x) => ({ ...x, els: [...x.els, ...els] })); setSel(els[els.length - 1]?.id || ""); setMsg(tr("Pasted ✓", "تم اللصق ✓")); }
    else { insertSlides(c.slides.map(fresh), at); setMsg(tr(`Pasted ${c.slides.length} slide(s) — every item stays editable.`, `تم لصق ${c.slides.length} شريحة — كل عنصر قابل للتعديل.`)); }
  };
  const doCopy = (cut: boolean, ev?: ClipboardEvent) => { const c = makeClip(); CLIP = c; try { ev?.clipboardData?.setData("text/plain", CLIP_TAG + JSON.stringify(c)); ev?.preventDefault(); } catch { /* */ } if (!ev) navigator.clipboard?.writeText(CLIP_TAG + JSON.stringify(c)).catch(() => undefined); if (cut && canSave) { if (c.kind === "els") delEl(c.els[0].id); else delSlides(pickedIdx()); } else setMsg(c.kind === "els" ? tr("Copied the item.", "نُسخ العنصر.") : tr(`Copied ${c.slides.length} slide(s).`, `نُسخت ${c.slides.length} شريحة.`)); };
  const importFile = async (f: File) => {
    const pdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    if (!pdf && !/\.pptx$/i.test(f.name)) { setMsg(tr("Choose a .pptx or .pdf file (old .ppt: open it and Save As .pptx).", "اختر ملف pptx أو pdf.")); return; }
    if (f.size > 60_000_000) { setMsg(tr("That file is over 60 MB.", "الملف أكبر من 60 ميغابايت.")); return; }
    setImp("…");
    try { const got = pdf ? await importPdf(f, asAdmin, (i, n) => setImp(`${i}/${n}`)) : await importPptx(f, asAdmin, (i, n) => setImp(`${i}/${n}`)); if (!got.length) throw new Error("empty"); insertSlides(got, cur); setMsg(pdf ? tr(`Added ${got.length} pages as separate slides — write, draw, record or add on top of each one.`, `أُضيفت ${got.length} صفحة كشرائح منفصلة — اكتب أو ارسم أو سجّل فوق كل واحدة.`) : tr(`Added ${got.length} slides — every text box and picture can be edited.`, `أُضيفت ${got.length} شريحة — كل نص وصورة قابل للتعديل.`)); }
    catch { setMsg(tr("That file couldn't be read. Save it as .pptx or .pdf and try again.", "تعذّرت قراءة الملف. احفظه بصيغة pptx أو pdf.")); }
    setImp("");
  };
  // Keyboard: Del/Backspace, Ctrl/⌘+D duplicate, arrows nudge, PageUp/Down slide; system copy/cut/paste events.
  const kb = useRef<{ key: (e: KeyboardEvent) => void; copy: (e: ClipboardEvent, cut: boolean) => void; paste: (e: ClipboardEvent) => void }>(null as never);
  kb.current = {
    key: (ev) => {
      if (!canSave || typing(ev.target) || preview) return;
      const mod = ev.ctrlKey || ev.metaKey; const k = ev.key;
      if (k === "Delete" || k === "Backspace") { if (sel && area.current === "canvas") { ev.preventDefault(); delEl(sel); } else if (area.current === "rail" && slides.length) { ev.preventDefault(); delSlides(pickedIdx()); } return; }
      if (mod && k.toLowerCase() === "d") { ev.preventDefault(); if (sel && area.current === "canvas") putClip({ kind: "els", els: s.els.filter((e) => e.id === sel) }); else putClip({ kind: "slides", slides: pickedIdx().map((i) => slides[i]) }, pickedIdx().slice(-1)[0]); return; }
      if (mod && k.toLowerCase() === "a" && area.current === "rail") { ev.preventDefault(); setPicked(slides.map((_, i) => i)); return; }
      if (k === "Escape") { if (work) { if (!document.fullscreenElement) { ev.preventDefault(); void leaveFocus(); } return; } setSel(""); setPicked([]); setMenu(null); return; }
      if (sel && area.current === "canvas" && /^Arrow/.test(k)) { const e = s.els.find((x) => x.id === sel); if (!e || e.lock) return; ev.preventDefault(); const d = ev.shiftKey ? 5 : 0.5; patch(sel, { x: Math.round((e.x + (k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0)) * 10) / 10, y: Math.round((e.y + (k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0)) * 10) / 10 }); return; }
      if (k === "PageDown" || (area.current === "rail" && k === "ArrowDown")) { ev.preventDefault(); setCur((c) => Math.min(slides.length - 1, c + 1)); setSel(""); setPicked([]); }
      if (k === "PageUp" || (area.current === "rail" && k === "ArrowUp")) { ev.preventDefault(); setCur((c) => Math.max(0, c - 1)); setSel(""); setPicked([]); }
    },
    copy: (ev, cut) => { if (typing(ev.target) || preview || (window.getSelection()?.toString() || "").length) return; doCopy(cut, ev); },
    paste: (ev) => { onPaste(ev as unknown as React.ClipboardEvent); },
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => kb.current.key(e), c = (e: ClipboardEvent) => kb.current.copy(e, false), x = (e: ClipboardEvent) => kb.current.copy(e, true), v = (e: ClipboardEvent) => kb.current.paste(e);
    window.addEventListener("keydown", k); document.addEventListener("copy", c); document.addEventListener("cut", x); document.addEventListener("paste", v);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("copy", c); document.removeEventListener("cut", x); document.removeEventListener("paste", v); };
  }, []);
  // t578: Focus opens the current slide in browser full screen (CSS fallback on iPad / some smartboards), keeping the tool tabs.
  useEffect(() => {
    document.body.classList.toggle("lb-work", work);
    if (!work) return;
    const f = () => { if (!document.fullscreenElement && fsOk.current) { fsOk.current = false; setWork(false); setPageFocus(false); } };
    document.addEventListener("fullscreenchange", f);
    return () => { document.removeEventListener("fullscreenchange", f); document.body.classList.remove("lb-work"); };
  }, [work]);
  const enterFocus = async () => {
    setWork(true);
    setPageFocus(true);
    fsOk.current = await requestElFullscreen(root.current);
  };
  const leaveFocus = async () => {
    fsOk.current = false;
    setWork(false);
    setPageFocus(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  };
  const toggleWork = async () => { if (work) await leaveFocus(); else await enterFocus(); };
  const slideApi = useRef({ enter: enterFocus, exit: leaveFocus });
  slideApi.current = { enter: enterFocus, exit: leaveFocus };
  useEffect(() => registerSlideFocus({ enter: () => slideApi.current.enter(), exit: () => slideApi.current.exit() }), []);
  const onPaste = async (ev: React.ClipboardEvent) => {
    if (typing(ev.target) || preview) return;
    if (!canSave) return;
    const plain = ev.clipboardData.getData("text/plain");
    if (plain.startsWith(CLIP_TAG)) { ev.preventDefault(); try { putClip(JSON.parse(plain.slice(CLIP_TAG.length)) as Clip); } catch { if (CLIP) putClip(CLIP); } return; }
    const doc = [...ev.clipboardData.files].find((x) => /\.(pptx|pdf)$/i.test(x.name) || x.type === "application/pdf");
    if (doc) { ev.preventDefault(); await importFile(doc); return; }
    const f = [...ev.clipboardData.files].find((x) => x.type.startsWith("image/")) || [...ev.clipboardData.items].find((x) => x.kind === "file" && x.type.startsWith("image/"))?.getAsFile() || undefined;
    const html = ev.clipboardData.getData("text/html");
    // t394: a slide copied from PowerPoint arrives as a picture (+ Office HTML) → becomes a new slide.
    if (/PowerPoint|urn:schemas-microsoft-com:office:powerpoint|ProgId content=PowerPoint/i.test(html) && canSave) {
      ev.preventDefault();
      const txt = new DOMParser().parseFromString(html, "text/html").body.innerText.replace(/\n{3,}/g, "\n\n").trim();
      // t429: text from the PowerPoint slide(s) becomes editable text boxes (title + body); a picture only when there is no text.
      const blocks = txt.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      const made: Slide[] = [];
      if (blocks.length) {
        const ar = /[\u0600-\u06FF]/.test(txt);
        const [head, ...rest] = blocks;
        made.push({ id: uid("s"), bg: "#ffffff", els: [{ id: uid(), t: "text", text: head.slice(0, 300), color: "#1b3a57", font: ar ? "Amiri" : "Nunito", size: 64, bold: true, x: 5, y: 5, w: 90, h: 18 } as El, ...(rest.length ? [{ id: uid(), t: "text", text: rest.join("\n\n").slice(0, 4000), color: "#1b2f44", font: ar ? "Amiri" : "Nunito", size: 34, x: 5, y: 26, w: 90, h: 68 } as El] : [])] });
      } else if (f) { try { made.push({ id: uid("s"), bg: "#ffffff", els: [{ id: uid(), t: "img", src: await mediaUpload(f, asAdmin), x: 0, y: 0, w: 100, h: 100 } as El] }); } catch (e) { setMsg(String((e as Error).message)); } }
      if (made.length) { insertSlides(made); setMsg(tr("Pasted from PowerPoint as an editable slide. For many slides with pictures and layout, use ⬆ Add PowerPoint / PDF.", "تم اللصق من PowerPoint كشريحة قابلة للتعديل. لشرائح كثيرة استخدم إضافة PowerPoint / PDF.")); }
      return;
    }
    if (f) { ev.preventDefault(); try { add({ t: "img", src: await mediaUpload(f, asAdmin), x: 20, y: 15, w: 60, h: 65 } as Omit<El, "id">); } catch (e) { setMsg(String((e as Error).message)); } return; }
    const txt = ev.clipboardData.getData("text/plain"); if (!txt) return;
    ev.preventDefault();
    const v = ytId(txt);
    add(v ? ({ t: "yt", vid: v, x: 15, y: 12, w: 70, h: 76 } as Omit<El, "id">) : ({ t: "text", text: txt.slice(0, 4000), color: "#1b2f44", font: arabic ? "Amiri" : "Nunito", size: 32, x: 8, y: 10, w: 84, h: 40 } as Omit<El, "id">));
  };
  const selEl = s?.els.find((e) => e.id === sel);
  const qAt = slides.findIndex((x) => x.els.some((e) => e.t === "quran"));
  const qEl = s?.els.find((e) => e.t === "quran") as Extract<El, { t: "quran" }> | undefined;
  /** t321: choosing Quran Homework opens the Quran setup inside the current slide. */
  function openQuran() {
    if (qAt >= 0) { setCur(qAt); setSel(""); return; }
    add({ t: "quran", surah: 1, from: 1, to: 7, memoAudio: true, x: 20, y: 30, w: 60, h: 30 } as Omit<El, "id">);
  }
  const unit = units?.find((u) => u.id === p.topic.cur);
  /** t429: SOW fields (Topic, LO, SC, Standard, Key words) from a curriculum unit — in Arabic for Arabic subjects / Arabic UI. */
  function sowOf(u: CurUnit): Pack["topic"] { const w = unitToSow(u, arabic || lang === "ar" ? "ar" : "en"); return { cur: u.id, title: w.title, yr: u.yr, term: u.term, std: w.codes || [], lo: [w.intent, w.know].filter(Boolean).join("\n"), sc: w.sc, kw: w.vocab, stdText: [w.skill, (w.codes || []).join(", ")].filter(Boolean).join(" · ") }; }
  const setTopic = (q: Partial<Pack["topic"]>) => { setP((x) => ({ ...x, topic: { ...x.topic, ...q } })); setDirty(true); };
  const setParts = (part: Part | undefined) => { const set = new Set(pickedIdx()); setSlides((a) => a.map((x, i) => (set.has(i) ? { ...x, part } : x))); setDirty(true); };
  const setSlideMeta = (q: Partial<Slide>) => setSlide((x) => ({ ...x, ...q }));
  const lbl = "block text-sm font-bold";
  return (
    <div ref={root} className={`lp-editor-full space-y-4 rounded-3xl border-2 bg-gradient-to-br p-3 text-[#1b2f44] shadow-xl backdrop-blur-md sm:p-4 ${ACCENT[p.type].wrap}`} data-testid="lp-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallBtn} onClick={async () => { if (dirty && canSave) await save(true); onClose(); }} data-testid="lp-back">← {LB_ICON} {tr(LB_EN, LB_AR)}</button>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${p.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`} data-testid="lp-status">{p.status === "published" ? (p.assignAt > Date.now() ? tr("Scheduled", "مجدول") : tr("Published", "منشور")) : tr("Draft", "مسودة")}</span>
        <span className="flex-1" />
        <button type="button" className={smallBtn} onClick={async () => { if (canSave && (dirty || !p.id)) { const sv = await save(true); if (!sv) return; } setPreview(true); }} disabled={!p.id && !canSave} title={tr("See it exactly as students will — nothing is assigned", "شاهده كما يراه الطلاب — بدون إسناد")} data-testid="lp-preview">👁 {tr("Preview", "معاينة")}</button>
        <button type="button" className={smallBtn + (hideRail ? " !bg-header !text-sun" : "")} onClick={() => setHideRail((v) => !v)} title={tr("Hide or show the slides sidebar", "إخفاء شريط الشرائح أو إظهاره")} data-testid="lp-hide-rail">{hideRail ? "📑" : "🗂️"} {hideRail ? tr("Show slides", "إظهار الشرائح") : tr("Hide slides", "إخفاء الشرائح")}</button>
        <button type="button" className={smallBtn + (work ? " !bg-header !text-sun" : "")} onClick={() => void toggleWork()} title={work ? tr("Exit Focus (Esc)", "إنهاء التركيز (Esc)") : tr("Focus — open this slide full screen, with the text, picture and camera tools", "تركيز — افتح هذه الشريحة بملء الشاشة مع أدوات النص والصورة والكاميرا")} data-testid="lp-work">{work ? "✕" : "🎯"} {work ? tr("Exit Focus", "إنهاء التركيز") : tr("Focus", "تركيز")}</button>
        {canSave && <button type="button" className={smallBtn} disabled={saving} onClick={() => save()} data-testid="lp-save">💾 {saving ? "…" : tr("Save", "حفظ")}</button>}
        {canSave && p.status !== "published" && p.type !== "lesson" && <>
          <button type="button" className="rounded-full bg-header px-4 py-1.5 text-sm font-extrabold text-sun shadow" onClick={() => publish(false, true)} title={tr("Students get it straight away", "يصل للطلاب فورًا")} data-testid="lp-assign-now">⚡ {tr("Assign now", "إسناد الآن")}</button>
          <button type="button" className={smallBtn} onClick={() => { if (p.assignAt > Date.now()) { publish(false); return; } setMetaOpen(true); setMsg(tr("Pick the ‘Assign on’ date and time below, then press ⏰ Schedule again.", "اختر تاريخ ووقت الإسناد بالأسفل ثم اضغط ⏰ جدولة مرة أخرى.")); setTimeout(() => (document.querySelector("[data-testid=lp-assign-at]") as HTMLInputElement | null)?.focus(), 80); }} data-testid="lp-publish">⏰ {p.assignAt > Date.now() ? tr("Schedule for ", "جدولة في ") + new Date(p.assignAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "short", timeStyle: "short" }) : tr("Schedule", "جدولة")}</button></>}
        {canSave && p.status === "published" && <button type="button" className={smallBtn} onClick={() => publish(true)} data-testid="lp-unpublish">⏸ {tr("Unpublish", "إلغاء النشر")}</button>}
      </div>
      {msg && <p className="text-sm font-semibold" role="status" data-testid="lp-msg">{msg}</p>}
      <details open={metaOpen} onToggle={(e) => setMetaOpen((e.currentTarget as HTMLDetailsElement).open)} className="lb-hide-work rounded-2xl border border-white/60 bg-white/70 text-[#1b2f44] shadow-md backdrop-blur-md" data-testid="lp-meta-box"><summary className="cursor-pointer rounded-2xl px-4 py-2.5 font-extrabold text-[#1b2f44] hover:bg-sky-50">⚙️ {tr("Lesson details — title, type, topic, who, dates", "تفاصيل الدرس — العنوان والنوع والموضوع والطلاب والمواعيد")}</summary><div className="grid gap-3 p-4 pt-1 md:grid-cols-2" data-testid="lp-meta">
        <label className={lbl}>{tr("Title", "العنوان")}<input className={inputCls} value={p.title} dir="auto" onChange={(e) => { setP({ ...p, title: e.target.value }); setDirty(true); }} data-testid="lp-title" /></label>
        <div className={lbl}>{tr("Type", "النوع")}<select className={inputCls} value={p.type} onChange={(e) => { const k = e.target.value as PackType; setP({ ...p, type: k }); setDirty(true); if (k === "quran") openQuran(); }} data-testid="lp-type">{(Object.keys(TYPE_LABEL) as PackType[]).filter((k) => k !== "material" || p.type === "material").map((k) => <option key={k} value={k}>{TYPE_LABEL[k][0]} {tr(TYPE_LABEL[k][1], TYPE_LABEL[k][2])}</option>)}</select>
          <p className="mt-1 text-xs font-normal opacity-70">{p.type === "lesson" ? tr("Stays in your account for presenting live — students don't get it.", "يبقى في حسابك للعرض المباشر — لا يصل للطلاب.") : p.type === "activity" ? tr("Assigned to students to complete and hand in during the lesson (not on their Homework page). You correct it like homework.", "يُسند للطلاب لإنجازه وتسليمه أثناء الدرس (ليس في صفحة الواجبات). تصححه كالواجب.") : p.type === "material" ? tr("Shown in the students' Learning Libraries.", "تظهر في مكتبات التعلم للطلاب.") : p.type === "homework" ? tr("Goes to the students' Homework; they work on their own copy of the slides and hand in.", "تذهب إلى واجبات الطلاب ويعملون على نسختهم ويسلّمون.") : tr("Quran Homework with these slides — reading, recording, marking and tracker as usual.", "واجب قرآن مع الشرائح — القراءة والتسجيل والتصحيح والمتابعة كالمعتاد.")}</p></div>
        <label className={lbl}>{tr("Subject", "المادة")}<SubjectPick className={inputCls} value={p.subject} onChange={onSubject} mine={asAdmin ? [] : subjects} all={subjects} admin={asAdmin} testId="lp-subject" /></label>
        <label className={lbl}>{tr("Topic from the curriculum", "الموضوع من المنهج")}<select className={inputCls} value={p.topic.cur || ""} onChange={(e) => { const u = units?.find((x) => x.id === e.target.value); setP({ ...p, title: u && !p.title.trim() ? (arabic && u.titleAr ? u.titleAr : u.title) : p.title, topic: u ? { ...sowOf(u), timer: p.topic.timer } : { timer: p.topic.timer } }); setDirty(true); }} data-testid="lp-topic">
          <option value="">{units === null ? "…" : tr("— none —", "— بدون —")}</option>
          {(units || []).filter((u) => !p.subject || u.subject === p.subject).map((u) => <option key={u.id} value={u.id}>{u.yr} · {u.term} · {u.title}</option>)}</select></label>
        <label className={lbl}>{tr("Topic title (editable)", "عنوان الموضوع (قابل للتعديل)")}<input className={inputCls} dir="auto" value={p.topic.title || ""} onChange={(e) => { setP({ ...p, topic: { ...p.topic, title: e.target.value } }); setDirty(true); }} data-testid="lp-topic-title" /></label>
        <div className={lbl}>{tr("Standards for this topic", "معايير هذا الموضوع")}<div className="mt-1 flex flex-wrap gap-1" data-testid="lp-std">{(p.topic.std || []).length ? p.topic.std!.map((c) => <span key={c} className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">{c}</span>) : <span className="text-xs font-normal opacity-60">{unit ? tr("No standards linked to this unit yet.", "لا معايير مرتبطة بعد.") : tr("Pick a topic to see its standards.", "اختر موضوعًا لرؤية معاييره.")}</span>}</div></div>
        <div className="space-y-2 rounded-2xl border border-[#1b3a57]/15 bg-gradient-to-br from-[#1b3a57]/5 via-white to-[#f5c542]/10 p-3 md:col-span-2" data-testid="lp-sow">
          <div className="flex flex-wrap items-center gap-2"><b className="text-sm text-[#1b3a57]">📘 {tr("Scheme of Work — editable", "خطة العمل — قابلة للتعديل")}</b><span className="text-xs font-normal opacity-60">{tr("Filled from the curriculum topic; change anything for this lesson.", "تُملأ من موضوع المنهج؛ عدّل ما تريد لهذا الدرس.")}</span><span className="flex-1" />{unit && <button type="button" className={smallBtn + " !text-xs"} onClick={() => setTopic(sowOf(unit))} data-testid="lp-sow-refill">↻ {tr("Refill from curriculum", "إعادة التعبئة من المنهج")}</button>}</div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className={lbl}>🎯 {tr("Learning objectives (LO)", "أهداف التعلم")}<textarea className={inputCls + " min-h-20"} dir="auto" value={p.topic.lo || ""} onChange={(e) => setTopic({ lo: e.target.value })} data-testid="lp-lo" /></label>
            <label className={lbl}>✅ {tr("Success criteria (SC) — one per line", "معايير النجاح — كل معيار في سطر")}<textarea className={inputCls + " min-h-20"} dir="auto" value={(p.topic.sc || []).join("\n")} onChange={(e) => setTopic({ sc: e.target.value.split("\n").slice(0, 20) })} data-testid="lp-sc" /></label>
            <label className={lbl}>🏛️ {tr("Standard", "المعيار")}<textarea className={inputCls + " min-h-14"} dir="auto" value={p.topic.stdText ?? (p.topic.std || []).join(", ")} onChange={(e) => setTopic({ stdText: e.target.value })} data-testid="lp-std-text" /></label>
            <label className={lbl}>🔑 {tr("Key words", "الكلمات المفتاحية")}<textarea className={inputCls + " min-h-14"} dir="auto" value={p.topic.kw || ""} onChange={(e) => setTopic({ kw: e.target.value })} data-testid="lp-kw" /></label>
          </div>
          {canSave && <button type="button" className={smallBtn + " !text-xs"} onClick={() => { const ar = arabic || lang === "ar"; const f = ar ? "Amiri" : "Nunito"; const body = [p.topic.lo && `${ar ? "🎯 الأهداف" : "🎯 Learning objectives"}\n${p.topic.lo}`, p.topic.sc?.filter(Boolean).length && `${ar ? "✅ معايير النجاح" : "✅ Success criteria"}\n${p.topic.sc!.filter(Boolean).map((x) => "• " + x).join("\n")}`, p.topic.kw && `${ar ? "🔑 الكلمات المفتاحية" : "🔑 Key words"}: ${p.topic.kw}`].filter(Boolean).join("\n\n"); insertSlides([{ id: uid("s"), bg: "#ffffff", part: "lesson", els: [{ id: uid(), t: "text", text: p.topic.title || p.title || "", color: "#1b3a57", font: f, size: 64, bold: true, x: 5, y: 4, w: 90, h: 16 } as El, { id: uid(), t: "text", text: body, color: "#1b2f44", font: f, size: 30, x: 5, y: 22, w: 90, h: 74 } as El] }], -1); }} data-testid="lp-sow-slide">➕ {tr("Make a title slide from these (editable)", "أنشئ شريحة عنوان منها (قابلة للتعديل)")}</button>}
        </div>
        <label className={lbl}>⏱ {tr("Timer for the whole activity", "مؤقت النشاط كاملًا")}<select className={inputCls} value={p.topic.timer || 0} onChange={(e) => setTopic({ timer: Number(e.target.value) })} data-testid="lp-timer">{TIMERS.map((t) => <option key={t} value={t}>{t ? `${fmtT(t)} ${tr("min", "د")}` : tr("No timer", "بدون مؤقت")}</option>)}</select><span className="text-xs font-normal opacity-60">{tr("Students see a countdown. Single slides can have their own timer too.", "يرى الطلاب عدًّا تنازليًا. ويمكن لكل شريحة مؤقت خاص.")}</span></label>
        <div className={lbl + " md:col-span-2"}>{tr("Who is it for? (year group, class, section or group)", "لمن؟ (السنة أو الصف أو الشعبة أو المجموعة)")} <span className="font-normal opacity-70" data-testid="lp-count">· {ids.length} {tr("students", "طالب")}</span><div className="mt-1"><RosterPicker subject={p.subject} value={keys} onChange={(v) => { setKeys(v); setDirty(true); }} roster={roster} groups={groups} /></div></div>
        <label className={lbl}>{tr("Assign on (schedule)", "تاريخ الإسناد (جدولة)")}<input type="datetime-local" className={inputCls} value={dtl(p.assignAt)} onChange={(e) => { setP({ ...p, assignAt: fromDtl(e.target.value) }); setDirty(true); }} data-testid="lp-assign-at" /><span className="text-xs font-normal opacity-60">{tr("Empty = as soon as you publish.", "فارغ = فور النشر.")}</span></label>
        {p.type !== "material" && p.type !== "lesson" && <label className={lbl}>{tr("Submission date", "تاريخ التسليم")}<input type="datetime-local" className={inputCls} value={dtl(p.due)} onChange={(e) => { setP({ ...p, due: fromDtl(e.target.value) }); setDirty(true); }} data-testid="lp-due" /></label>}
        <div className={lbl}>{tr("Mode", "الطريقة")}<div className="mt-1 flex gap-1.5">{(["self", "live"] as const).map((m) => <button key={m} type="button" aria-pressed={p.mode === m} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ring-black/10 ${p.mode === m ? "bg-header text-sun" : "bg-white"}`} onClick={() => { setP({ ...p, mode: m }); setDirty(true); }} data-testid={`lp-mode-${m}`}>{m === "self" ? tr("🧭 Student pace", "🧭 بسرعة الطالب") : tr("📡 Live (I drive the slides)", "📡 مباشر (أنا أقود الشرائح)")}</button>)}</div></div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={p.tpl} onChange={(e) => { setP({ ...p, tpl: e.target.checked }); setDirty(true); }} data-testid="lp-tpl" /> {tr("Share as a template with other teachers", "مشاركة كقالب مع المعلمين")}</label>
      </div></details>
      {p.mode === "live" && p.status === "published" && p.id && <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900" data-testid="lp-live-bar">📡 {p.live >= 0 ? tr(`Live — students follow slide ${p.live + 1}`, `مباشر — الطلاب يتابعون الشريحة ${p.live + 1}`) : tr("Live mode is ready.", "الوضع المباشر جاهز.")}
        <button type="button" className={smallBtn} onClick={async () => { await lp.live(p.id, cur, false, asAdmin); setP({ ...p, live: cur }); }} data-testid="lp-live-go">▶ {tr("Show this slide to students", "اعرض هذه الشريحة للطلاب")}</button>
        {p.live >= 0 && <button type="button" className={smallBtn} onClick={async () => { await lp.live(p.id, 0, true, asAdmin); setP({ ...p, live: -1 }); }} data-testid="lp-live-stop">⏹ {tr("End live", "إنهاء")}</button>}</div>}
      <div className={hideRail ? "" : "grid gap-3 lg:grid-cols-[11rem_1fr]"}>
        {!hideRail && <ol className="flex gap-2 overflow-x-auto rounded-2xl bg-white/70 p-2 ring-1 ring-black/5 lg:max-h-[78vh] lg:flex-col lg:overflow-y-auto" onPointerDown={() => { area.current = "rail"; }} data-testid="lp-thumbs">
          {canSave && <li className="flex shrink-0 flex-col gap-1 lg:w-full">
            <label className="cursor-pointer rounded-2xl bg-gradient-to-r from-[#1b3a57] to-[#24507a] px-3 py-2 text-center text-xs font-extrabold text-[#f5c542] shadow ring-1 ring-[#f5c542]/50 transition hover:brightness-110" data-testid="lp-doc-add" title={tr("Each slide / page becomes its own editable slide", "كل شريحة / صفحة تصبح شريحة مستقلة قابلة للتعديل")}>⬆ {imp ? `${tr("Adding", "جارٍ الإضافة")} ${imp}…` : tr("Add PowerPoint / PDF", "إضافة PowerPoint / PDF")}<input type="file" accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" data-testid="lp-doc-input" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await importFile(f); }} /><input type="file" accept=".pptx" className="hidden" data-testid="lp-pptx-input" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await importFile(f); }} /></label>
            <div className="flex gap-1"><button type="button" className={smallBtn + " flex-1 !px-2 !text-xs"} onClick={() => insertSlides([blankSlide()])} title={tr("New blank slide", "شريحة فارغة جديدة")} data-testid="lp-slide-add">➕ {tr("Slide", "شريحة")}</button><button type="button" className={smallBtn + " flex-1 !px-2 !text-xs"} onClick={() => putClip({ kind: "slides", slides: pickedIdx().map((i) => slides[i]) }, pickedIdx().slice(-1)[0])} title={tr("Duplicate (Ctrl/⌘+D)", "تكرار (Ctrl/⌘+D)")} data-testid="lp-slide-dup">⧉ {tr("Duplicate", "تكرار")}</button></div>
            {picked.length > 1 && <p className="rounded-xl bg-sky-100 px-2 py-1 text-center text-[11px] font-bold text-sky-900" data-testid="lp-picked">{tr(`${picked.length} slides selected · Ctrl/⌘+C / X / Del`, `${picked.length} شرائح محددة`)}</p>}
          </li>}
          {slides.map((x, i) => { const on = i === cur || picked.includes(i); return <li key={x.id} className={`group relative w-32 shrink-0 lg:w-full ${dragI === i ? "opacity-40" : ""} ${overI === i && dragI !== null && dragI !== i ? "rounded-2xl ring-4 ring-[#f5c542]" : ""}`} draggable={canSave} onDragStart={(ev) => { setDragI(i); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/x-slide", String(i)); }} onDragOver={(ev) => { if (dragI !== null) { ev.preventDefault(); setOverI(i); } }} onDragEnd={() => { setDragI(null); setOverI(null); }} onDrop={(ev) => { ev.preventDefault(); if (dragI === null || dragI === i) return; const from = dragI; setSlides((a) => { const b = [...a]; const [m] = b.splice(from, 1); b.splice(i, 0, m); return b; }); setCur(i); setPicked([]); setDirty(true); setDragI(null); setOverI(null); }}
            onContextMenu={(ev) => { if (!canSave) return; ev.preventDefault(); area.current = "rail"; if (!picked.includes(i)) { setCur(i); setPicked([]); } setMenu({ x: ev.clientX, y: ev.clientY, i }); }} title={tr("Click · Ctrl/⌘ or Shift-click to pick several · drag to reorder · right-click for more", "انقر · Ctrl أو Shift لاختيار عدة شرائح · اسحب لإعادة الترتيب · زر الفأرة الأيمن للمزيد")}>
            <button type="button" className={`block w-full rounded-2xl bg-gradient-to-br p-1.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${THUMB[i % THUMB.length]} ${i === cur ? `ring-4 ${ACCENT[p.type].ring}` : picked.includes(i) ? "ring-4 ring-sky-400" : "ring-1 ring-black/5"}`}
              onClick={(ev) => { area.current = "rail"; setSel(""); if (ev.shiftKey) { const a = Math.min(cur, i), b = Math.max(cur, i); setPicked(Array.from({ length: b - a + 1 }, (_, k) => a + k)); return; } if (ev.ctrlKey || ev.metaKey) { setPicked((pk) => { const base = pk.length ? pk : [cur]; return base.includes(i) ? base.filter((k) => k !== i) : [...base, i]; }); return; } setPicked([]); setCur(i); }} aria-label={tr(`Slide ${i + 1}`, `الشريحة ${i + 1}`)} aria-pressed={on} data-testid="lp-thumb"><SlideView slide={x} asAdmin={asAdmin} live={false} testId="lp-thumb-slide" />{(x.part || x.timer || x.instr) && <span className="pointer-events-none absolute start-2.5 top-2.5 flex gap-0.5">{x.part && <span className={`rounded-full px-1.5 py-px text-[10px] font-extrabold shadow ${PART_LABEL[x.part][3]}`} data-testid="lp-thumb-part">{PART_LABEL[x.part][0]} {tr(PART_LABEL[x.part][1], PART_LABEL[x.part][2])}</span>}{!!x.timer && <span className="rounded-full bg-white/90 px-1.5 py-px text-[10px] font-extrabold text-[#1b3a57] shadow">⏱{fmtT(x.timer)}</span>}{x.instr && <span className="rounded-full bg-white/90 px-1 py-px text-[10px] shadow">💬</span>}</span>}<span className="mt-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-extrabold text-[#1b2f44] shadow-sm">{i + 1}</span></button>
            {canSave && <button type="button" className="absolute -end-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-black text-rose-600 shadow-md ring-1 ring-rose-200 transition hover:bg-rose-600 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" onClick={(ev) => { ev.stopPropagation(); delSlides(picked.includes(i) ? pickedIdx() : [i]); }} aria-label={tr(`Delete slide ${i + 1}`, `حذف الشريحة ${i + 1}`)} title={tr("Delete slide (Del)", "حذف الشريحة (Del)")} data-testid="lp-thumb-x">✕</button>}
          </li>; })}
        </ol>}
        <div ref={canvasBox} className="min-w-0 space-y-2" onPointerDown={() => { area.current = "canvas"; }}>
          {canSave && <div className="sticky top-0 z-20"><AddTools compact={work} add={add} pen={pen} setPen={setPen} asAdmin={asAdmin} teacher onErr={setMsg} onUndoStroke={() => { const d = draw(); if (d) patch(d.id, { paths: d.paths.slice(0, -1) } as Partial<El>); }} onClearDraw={() => { const d = draw(); if (d) setSlide((x) => ({ ...x, els: x.els.filter((e) => e !== d) })); }} /></div>}
          {canSave && <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/80 px-2 py-1.5 text-xs font-bold shadow-sm ring-1 ring-black/5" data-testid="lp-slide-meta">
            <span className="opacity-70">{picked.length > 1 ? tr(`${picked.length} slides are:`, `${picked.length} شرائح:`) : tr("This slide is:", "هذه الشريحة:")}</span>
            {(["lesson", "activity", "homework"] as Part[]).map((k) => <button key={k} type="button" aria-pressed={s.part === k} className={`rounded-full px-2.5 py-1 ring-1 ring-black/10 transition ${s.part === k ? PART_LABEL[k][3] : "bg-white hover:bg-slate-50"}`} onClick={() => setParts(s.part === k && picked.length < 2 ? undefined : k)} data-testid={`lp-part-${k}`}>{PART_LABEL[k][0]} {tr(PART_LABEL[k][1], PART_LABEL[k][2])}</button>)}
            <span className="mx-1 h-5 w-px bg-black/10" />
            <label className="flex items-center gap-1">⏱<select className="rounded-lg border border-black/10 bg-white px-1.5 py-0.5" value={s.timer || 0} onChange={(e) => setSlideMeta({ timer: Number(e.target.value) || undefined })} data-testid="lp-slide-timer">{TIMERS.map((t) => <option key={t} value={t}>{t ? fmtT(t) : tr("No timer", "بدون مؤقت")}</option>)}</select></label>
            <button type="button" className={`rounded-full px-2.5 py-1 ring-1 ring-black/10 ${s.instr !== undefined || s.instrAudio ? "bg-sky-600 text-white" : "bg-white"}`} onClick={() => setSlideMeta(s.instr !== undefined || s.instrAudio ? { instr: undefined, instrAudio: undefined } : { instr: "" })} data-testid="lp-instr-toggle">💬 {tr("Instructions", "التعليمات")}</button>
          </div>}
          {canSave && (s.instr !== undefined || s.instrAudio) && <div className="space-y-1.5 rounded-2xl border border-sky-200 bg-sky-50/80 p-2" data-testid="lp-instr">
            <textarea className={inputCls + " !mt-0 min-h-14"} dir="auto" placeholder={tr("Instructions for students on this slide…", "تعليمات للطلاب في هذه الشريحة…")} value={s.instr || ""} onChange={(e) => setSlideMeta({ instr: e.target.value })} data-testid="lp-instr-text" />
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">{s.instrAudio ? <><InstrAudio id={s.instrAudio} asAdmin={asAdmin} /><button type="button" className={smallBtn + " !text-xs !text-rose-700"} onClick={() => setSlideMeta({ instrAudio: undefined })} data-testid="lp-instr-audio-del">🗑 {tr("Remove recording", "حذف التسجيل")}</button></> : recIns ? <AudioRecorder compact label={tr("Record the instructions", "سجّل التعليمات")} testId="lp-instr-rec" onSave={async (b) => { const id = await mediaUpload(b, asAdmin); setSlideMeta({ instrAudio: id }); setRecIns(false); }} /> : <button type="button" className={smallBtn + " !text-xs"} onClick={() => setRecIns(true)} data-testid="lp-instr-rec-go">🎙️ {tr("Record instructions", "سجّل التعليمات")}</button>}</div>
          </div>}
          {canSave && <label className="lb-hide-work flex items-center gap-2 text-xs font-bold">{tr("Slide colour", "لون الشريحة")}<input type="color" value={s.bg} onChange={(e) => setSlide((x) => ({ ...x, bg: e.target.value }))} data-testid="lp-slide-bg" /><span className="font-normal opacity-60">{tr("Tips: Ctrl/⌘+C · X · V copy, cut and paste slides or items · Del deletes · Ctrl/⌘+D duplicates · arrows nudge · right-click a slide for more.", "نصائح: Ctrl/⌘+C · X · V للنسخ والقص واللصق · Del للحذف · Ctrl/⌘+D للتكرار · الأسهم للتحريك.")}</span></label>}
          {canSave && !s.els.length && <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-gradient-to-r from-violet-50 via-sky-50 to-amber-50 p-3 text-center text-sm font-bold text-[#2a2457]" data-testid="lp-empty">✨ {tr("Empty slide — add text, a picture, a voice note, a drawing, a video or a Quran passage from the colourful toolbar above.", "شريحة فارغة — أضف نصًا أو صورة أو تسجيلًا أو رسمًا أو فيديو أو مقطعًا قرآنيًا من الشريط الملوّن أعلاه.")}</div>}
          <div className={`lb-fit relative rounded-xl ${dropOn ? "ring-4 ring-[#f5c542]" : ""}`} onDragOver={(ev) => { if (canSave && [...ev.dataTransfer.types].includes("Files")) { ev.preventDefault(); setDropOn(true); } }} onDragLeave={() => setDropOn(false)}
            onDrop={async (ev) => { if (!canSave) return; const fs = [...ev.dataTransfer.files]; if (!fs.length) return; ev.preventDefault(); setDropOn(false); const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * 100, py = ((ev.clientY - r.top) / r.height) * 100;
              for (const [k, f] of fs.entries()) { if (/\.(pptx|pdf)$/i.test(f.name) || f.type === "application/pdf") { await importFile(f); continue; } if (!f.type.startsWith("image/")) { setMsg(tr("Drop pictures, a .pptx or a .pdf here.", "أفلت صورًا أو ملف pptx أو pdf هنا.")); continue; } try { const src = await mediaUpload(f, asAdmin); add({ t: "img", src, x: Math.max(0, Math.min(70, px - 15 + k * 3)), y: Math.max(0, Math.min(60, py - 20 + k * 3)), w: 30, h: 40 } as Omit<El, "id">); } catch (e) { setMsg(String((e as Error).message)); } } }} data-testid="lp-drop">
            <SlideView slide={s} asAdmin={asAdmin} edit={canSave ? "t" : null} selected={sel} onSelect={setSel} onMove={patch} pen={pen} onStroke={onStroke} onDelete={canSave ? delEl : undefined} testId="lp-canvas" />
            {dropOn && <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-[#1b3a57]/40 text-lg font-extrabold text-[#f5c542]">⬇ {tr("Drop pictures, PowerPoint or PDF", "أفلت الصور أو PowerPoint أو PDF")}</div>}</div>
          {canSave && qEl && (p.type === "quran" || selEl?.t === "quran") && <QuranSetup q={qEl} set={(q) => patch(qEl.id, q as Partial<El>)} title={p.title} setTitle={(title) => { setP({ ...p, title }); setDirty(true); }} keys={keys} setKeys={(k) => { setKeys(k); setDirty(true); }} roster={roster || []} groups={groups} assignAt={p.assignAt} due={p.due} setDates={(assignAt, due) => { setP({ ...p, assignAt, due }); setDirty(true); }} nStudents={ids.length} subject={p.subject} />}
          {canSave && p.type === "quran" && !qEl && qAt >= 0 && <button type="button" className="w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900" onClick={() => setCur(qAt)} data-testid="lpq-goto">📖 {tr(`The Quran setup is on slide ${qAt + 1} — open it`, `إعداد القرآن في الشريحة ${qAt + 1} — افتحه`)}</button>}
          {selEl && canSave && selEl.t !== "quran" && <ElProps e={selEl} set={(q) => patch(selEl.id, q)} del={() => delEl(sel)} front={() => setSlide((x) => ({ ...x, els: [...x.els.filter((e) => e.id !== sel), selEl] }))} back={() => setSlide((x) => ({ ...x, els: [selEl, ...x.els.filter((e) => e.id !== sel)] }))} />}
        </div>
      </div>
      {menu && <div className="fixed inset-0 z-[3000]" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}><div className="absolute min-w-44 overflow-hidden rounded-2xl bg-white/95 py-1 text-sm font-bold text-[#1b2f44] shadow-2xl ring-1 ring-black/10 backdrop-blur" style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 190), top: Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 600) - 260) }} onPointerDown={(e) => e.stopPropagation()} data-testid="lp-menu">
        {([["📋", tr("Copy", "نسخ"), "Ctrl+C", () => doCopy(false)], ["✂️", tr("Cut", "قص"), "Ctrl+X", () => doCopy(true)], ["📥", tr("Paste after", "لصق بعدها"), "Ctrl+V", () => { if (CLIP) putClip(CLIP, menu.i); else setMsg(tr("Nothing copied yet.", "لم يُنسخ شيء بعد.")); }], ["⧉", tr("Duplicate", "تكرار"), "Ctrl+D", () => putClip({ kind: "slides", slides: pickedIdx().map((k) => slides[k]) }, pickedIdx().slice(-1)[0])], ["➕", tr("New slide after", "شريحة جديدة بعدها"), "", () => insertSlides([blankSlide()], menu.i)], ["↑", tr("Move up", "لأعلى"), "", () => { const i = menu.i; if (i > 0) { setSlides((a) => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; }); setCur(i - 1); setDirty(true); } }], ["↓", tr("Move down", "لأسفل"), "", () => { const i = menu.i; if (i < slides.length - 1) { setSlides((a) => { const b = [...a]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; return b; }); setCur(i + 1); setDirty(true); } }], ["🗑", tr("Delete", "حذف"), "Del", () => delSlides(picked.includes(menu.i) ? pickedIdx() : [menu.i])]] as [string, string, string, () => void][]).map(([ic, l, k, fn]) => <button key={l} type="button" className={`flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-sky-50 ${ic === "🗑" ? "text-rose-700" : ""}`} onClick={() => { setMenu(null); fn(); }}><span className="w-5 text-center">{ic}</span><span className="flex-1">{l}</span>{k && <kbd className="text-[10px] font-normal opacity-50">{k}</kbd>}</button>)}
      </div></div>}
      {preview && p.id && <div className="fixed inset-0 z-[2147483001] overflow-auto bg-slate-900/95 p-3" data-testid="lp-preview-box"><div className="mx-auto mb-2 flex max-w-6xl items-center gap-2 text-sm font-bold text-white"><span className="rounded-full bg-[#f5c542] px-3 py-1 text-xs font-extrabold text-[#1b3a57]">👁 {tr("Preview — nothing is assigned, nobody is notified", "معاينة — لا إسناد ولا إشعارات")}</span><span className="flex-1" /><button type="button" className={smallBtn} onClick={() => setPreview(false)} data-testid="lp-preview-close">✕ {tr("Close preview", "إغلاق المعاينة")}</button></div><div className="mx-auto max-w-6xl"><PackPlayer id={p.id} asAdmin={asAdmin} preview /></div></div>}
      {p.id && p.status === "published" && <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5" data-testid="lp-progress">
        <div className="flex items-center gap-2"><b>📈 {tr("Progress per student", "التقدم لكل طالب")}</b><button type="button" className={smallBtn} onClick={() => lp.work(p.id, undefined, asAdmin).then((r) => setProg(r.progress || [])).catch(() => setProg([]))} data-testid="lp-progress-load">{tr("Refresh", "تحديث")}</button></div>
        {prog && <table className="mt-2 w-full text-sm"><tbody>{prog.map((r) => <tr key={r.student} className="border-t border-black/5"><td className="py-1">{roster.find((x) => x.id === r.student)?.name || r.student}</td><td>{r.seen}/{r.total} {tr("slides", "شرائح")}</td><td>{r.status}</td></tr>)}</tbody></table>}
      </div>}
    </div>
  );
}

