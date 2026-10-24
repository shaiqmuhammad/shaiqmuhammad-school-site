"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RosterPicker, rosterIds, useRosterData } from "@/components/lms/ClassLaunch";
import { inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { modCall, modErr, type CurUnit } from "@/lib/lmsMods";
import { blankSlide, lp, mediaUpload, TYPE_LABEL, uid, ytId, type Acc, type El, type Pack, type PackType, type Progress, type Slide } from "@/lib/packs";
import { SlideView } from "./SlideView";
import { AddTools, ElProps, withId, type Pen } from "./Tools";
import { importPptx } from "./pptx";

const dtl = (ms: number) => (ms ? new Date(ms + 4 * 3600e3).toISOString().slice(0, 16) : "");
const fromDtl = (s: string) => (s ? Date.parse(`${s}:00+04:00`) : 0);

/** t315: Lesson Pack editor (admin + teachers). Slides, type, topic from the curriculum (with its standards), audience, dates, mode, live control and progress. */
export function PackEditor({ initial, acc, asAdmin, subjects, onClose }: { initial: Pack; acc: Acc; asAdmin: boolean; subjects: string[]; onClose: () => void }) {
  const { tr } = useTr();
  const [p, setP] = useState<Pack>(initial);
  const [slides, setSlides] = useState<Slide[]>(initial.slides?.length ? initial.slides : [blankSlide()]);
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState("");
  const [pen, setPen] = useState<Pen>(null);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<string[]>(initial.aud || []);
  const [units, setUnits] = useState<CurUnit[] | null>(null);
  const [prog, setProg] = useState<Progress[] | null>(null);
  const [imp, setImp] = useState("");
  const { roster, groups } = useRosterData();
  const canSave = p.id ? acc.edit : acc.add;
  const arabic = /^islamic a$/i.test(p.subject);
  useEffect(() => { modCall<{ items: CurUnit[] }>("cur-list", {}, asAdmin).then((r) => setUnits(r.items)).catch(() => setUnits([])); }, [asAdmin]);
  const ids = useMemo(() => (keys.length ? rosterIds(keys, roster, groups) : p.students), [keys, roster, groups, p.students]);
  const s = slides[Math.min(cur, slides.length - 1)];
  const setSlide = (fn: (x: Slide) => Slide) => { setSlides((all) => all.map((x, i) => (i === cur ? fn(x) : x))); setDirty(true); };
  const add = (e0: Omit<El, "id">) => { const n = s.els.filter((x) => x.t !== "draw").length; const e = (e0.t === "text" ? { ...e0, y: Math.min(80, e0.y + n * 6) } : e0) as Omit<El, "id">; const el = withId(e.t === "text" && arabic ? ({ ...e, font: "Amiri", text: "اكتب هنا" } as Omit<El, "id">) : e); setSlide((x) => ({ ...x, els: [...x.els, el] })); setSel(el.id); };
  const patch = (id: string, q: Partial<El>) => setSlide((x) => ({ ...x, els: x.els.map((e) => (e.id === id ? ({ ...e, ...q } as El) : e)) }));
  const draw = () => s.els.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined;
  const onStroke = (d: number[]) => setSlide((x) => { const dr = x.els.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined; const path = { c: pen!.c, w: pen!.w, d }; return dr ? { ...x, els: x.els.map((e) => (e === dr ? { ...dr, paths: [...dr.paths, path] } : e)) } : { ...x, els: [...x.els, { id: uid(), t: "draw", x: 0, y: 0, w: 100, h: 100, paths: [path] } as El] }; });
  const save = useCallback(async (quiet = false) => {
    if (!canSave) return null;
    setSaving(true);
    try {
      const r = await lp.save({ ...p, aud: keys, students: ids, slides }, asAdmin);
      setP(r.pack); setDirty(false); if (!quiet) setMsg(tr("Saved ✓", "تم الحفظ ✓"));
      return r.pack;
    } catch (e) { setMsg(modErr(e, tr) + ` (${(e as Error).message})`); return null; } finally { setSaving(false); }
  }, [p, keys, ids, slides, asAdmin, canSave, tr]);
  // Auto-save (existing packs) 2.5 s after the last change.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!dirty || !p.id) return; if (t.current) clearTimeout(t.current); t.current = setTimeout(() => { save(true).then((x) => x && setMsg(tr("Auto-saved ✓", "حُفظ تلقائيًا ✓"))); }, 2500); return () => { if (t.current) clearTimeout(t.current); }; }, [dirty, slides, p.id, save, tr]);
  const publish = async (off: boolean) => { const saved = await save(true); if (!saved) return; try { const r = await lp.publish(saved.id, off, asAdmin); setP(r.pack); setMsg(off ? tr("Unpublished — students no longer see it.", "أُلغي النشر.") : r.pack.assignAt > Date.now() ? tr("Scheduled ✓", "تمت الجدولة ✓") : tr("Published ✓ — students can see it now.", "تم النشر ✓")); } catch (e) { const c = (e as Error).message; setMsg(c === "no_students" ? tr("Choose who it is for first.", "اختر الطلاب أولًا.") : c === "lp_needs_quran_slide" ? tr("Add a 📖 Quran block to a slide first.", "أضف مقطع قرآن أولًا.") : modErr(e, tr) + ` (${c})`); } };
  const onPaste = async (ev: React.ClipboardEvent) => {
    if ((ev.target as HTMLElement).closest("input,textarea,select")) return;
    const f = [...ev.clipboardData.files].find((x) => x.type.startsWith("image/"));
    if (f) { ev.preventDefault(); try { add({ t: "img", src: await mediaUpload(f, asAdmin), x: 20, y: 15, w: 60, h: 65 } as Omit<El, "id">); } catch (e) { setMsg(String((e as Error).message)); } return; }
    const txt = ev.clipboardData.getData("text/plain"); if (!txt) return;
    ev.preventDefault();
    const v = ytId(txt);
    add(v ? ({ t: "yt", vid: v, x: 15, y: 12, w: 70, h: 76 } as Omit<El, "id">) : ({ t: "text", text: txt.slice(0, 4000), color: "#1b2f44", font: arabic ? "Amiri" : "Nunito", size: 32, x: 8, y: 10, w: 84, h: 40 } as Omit<El, "id">));
  };
  const selEl = s?.els.find((e) => e.id === sel);
  const unit = units?.find((u) => u.id === p.topic.cur);
  const lbl = "block text-sm font-bold";
  return (
    <div className="space-y-4" onPaste={onPaste} data-testid="lp-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallBtn} onClick={async () => { if (dirty && canSave) await save(true); onClose(); }} data-testid="lp-back">← {tr("All packs", "كل الحزم")}</button>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${p.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`} data-testid="lp-status">{p.status === "published" ? (p.assignAt > Date.now() ? tr("Scheduled", "مجدول") : tr("Published", "منشور")) : tr("Draft", "مسودة")}</span>
        <span className="flex-1" />
        {canSave && <button type="button" className={smallBtn} disabled={saving} onClick={() => save()} data-testid="lp-save">💾 {saving ? "…" : tr("Save", "حفظ")}</button>}
        {canSave && p.status !== "published" && <button type="button" className="rounded-full bg-header px-4 py-1.5 text-sm font-extrabold text-sun" onClick={() => publish(false)} data-testid="lp-publish">🚀 {tr("Assign / publish", "إسناد / نشر")}</button>}
        {canSave && p.status === "published" && <button type="button" className={smallBtn} onClick={() => publish(true)} data-testid="lp-unpublish">⏸ {tr("Unpublish", "إلغاء النشر")}</button>}
      </div>
      {msg && <p className="text-sm font-semibold" role="status" data-testid="lp-msg">{msg}</p>}
      <div className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 md:grid-cols-2" data-testid="lp-meta">
        <label className={lbl}>{tr("Title", "العنوان")}<input className={inputCls} value={p.title} dir="auto" onChange={(e) => { setP({ ...p, title: e.target.value }); setDirty(true); }} data-testid="lp-title" /></label>
        <div className={lbl}>{tr("Type", "النوع")}<div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup">{(Object.keys(TYPE_LABEL) as PackType[]).map((k) => <button key={k} type="button" role="radio" aria-checked={p.type === k} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ring-black/10 ${p.type === k ? "bg-header text-sun" : "bg-white"}`} onClick={() => { setP({ ...p, type: k }); setDirty(true); }} data-testid={`lp-type-${k}`}>{TYPE_LABEL[k][0]} {tr(TYPE_LABEL[k][1], TYPE_LABEL[k][2])}</button>)}</div>
          <p className="mt-1 text-xs font-normal opacity-70">{p.type === "material" ? tr("Shown in the students' Learning Libraries.", "تظهر في مكتبات التعلم للطلاب.") : p.type === "homework" ? tr("Goes to the students' Homework; they work on their own copy of the slides and hand in.", "تذهب إلى واجبات الطلاب ويعملون على نسختهم ويسلّمون.") : tr("Quran Homework with these slides — reading, recording, marking and tracker as usual.", "واجب قرآن مع الشرائح — القراءة والتسجيل والتصحيح والمتابعة كالمعتاد.")}</p></div>
        <label className={lbl}>{tr("Subject", "المادة")}<select className={inputCls} value={p.subject} onChange={(e) => { setP({ ...p, subject: e.target.value }); setDirty(true); }} data-testid="lp-subject"><option value="">—</option>{subjects.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className={lbl}>{tr("Topic from the curriculum", "الموضوع من المنهج")}<select className={inputCls} value={p.topic.cur || ""} onChange={(e) => { const u = units?.find((x) => x.id === e.target.value); setP({ ...p, topic: u ? { cur: u.id, title: arabic && u.titleAr ? u.titleAr : u.title, yr: u.yr, term: u.term, std: u.std?.codes || [] } : {} }); setDirty(true); }} data-testid="lp-topic">
          <option value="">{units === null ? "…" : tr("— none —", "— بدون —")}</option>
          {(units || []).filter((u) => !p.subject || u.subject === p.subject).map((u) => <option key={u.id} value={u.id}>{u.yr} · {u.term} · {u.title}</option>)}</select></label>
        <label className={lbl}>{tr("Topic title (editable)", "عنوان الموضوع (قابل للتعديل)")}<input className={inputCls} dir="auto" value={p.topic.title || ""} onChange={(e) => { setP({ ...p, topic: { ...p.topic, title: e.target.value } }); setDirty(true); }} data-testid="lp-topic-title" /></label>
        <div className={lbl}>{tr("Standards for this topic", "معايير هذا الموضوع")}<div className="mt-1 flex flex-wrap gap-1" data-testid="lp-std">{(p.topic.std || []).length ? p.topic.std!.map((c) => <span key={c} className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">{c}</span>) : <span className="text-xs font-normal opacity-60">{unit ? tr("No standards linked to this unit yet.", "لا معايير مرتبطة بعد.") : tr("Pick a topic to see its standards.", "اختر موضوعًا لرؤية معاييره.")}</span>}</div></div>
        <div className={lbl + " md:col-span-2"}>{tr("Who is it for? (year group, class, section or group)", "لمن؟ (السنة أو الصف أو الشعبة أو المجموعة)")} <span className="font-normal opacity-70" data-testid="lp-count">· {ids.length} {tr("students", "طالب")}</span><div className="mt-1"><RosterPicker value={keys} onChange={(v) => { setKeys(v); setDirty(true); }} roster={roster} groups={groups} /></div></div>
        <label className={lbl}>{tr("Assign on (schedule)", "تاريخ الإسناد (جدولة)")}<input type="datetime-local" className={inputCls} value={dtl(p.assignAt)} onChange={(e) => { setP({ ...p, assignAt: fromDtl(e.target.value) }); setDirty(true); }} data-testid="lp-assign-at" /><span className="text-xs font-normal opacity-60">{tr("Empty = as soon as you publish.", "فارغ = فور النشر.")}</span></label>
        {p.type !== "material" && <label className={lbl}>{tr("Submission date", "تاريخ التسليم")}<input type="datetime-local" className={inputCls} value={dtl(p.due)} onChange={(e) => { setP({ ...p, due: fromDtl(e.target.value) }); setDirty(true); }} data-testid="lp-due" /></label>}
        <div className={lbl}>{tr("Mode", "الطريقة")}<div className="mt-1 flex gap-1.5">{(["self", "live"] as const).map((m) => <button key={m} type="button" aria-pressed={p.mode === m} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ring-black/10 ${p.mode === m ? "bg-header text-sun" : "bg-white"}`} onClick={() => { setP({ ...p, mode: m }); setDirty(true); }} data-testid={`lp-mode-${m}`}>{m === "self" ? tr("🧭 Student pace", "🧭 بسرعة الطالب") : tr("📡 Live (I drive the slides)", "📡 مباشر (أنا أقود الشرائح)")}</button>)}</div></div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={p.tpl} onChange={(e) => { setP({ ...p, tpl: e.target.checked }); setDirty(true); }} data-testid="lp-tpl" /> {tr("Share as a template with other teachers", "مشاركة كقالب مع المعلمين")}</label>
      </div>
      {p.mode === "live" && p.status === "published" && p.id && <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900" data-testid="lp-live-bar">📡 {p.live >= 0 ? tr(`Live — students follow slide ${p.live + 1}`, `مباشر — الطلاب يتابعون الشريحة ${p.live + 1}`) : tr("Live mode is ready.", "الوضع المباشر جاهز.")}
        <button type="button" className={smallBtn} onClick={async () => { await lp.live(p.id, cur, false, asAdmin); setP({ ...p, live: cur }); }} data-testid="lp-live-go">▶ {tr("Show this slide to students", "اعرض هذه الشريحة للطلاب")}</button>
        {p.live >= 0 && <button type="button" className={smallBtn} onClick={async () => { await lp.live(p.id, 0, true, asAdmin); setP({ ...p, live: -1 }); }} data-testid="lp-live-stop">⏹ {tr("End live", "إنهاء")}</button>}</div>}
      <div className="grid gap-3 lg:grid-cols-[11rem_1fr]">
        <ol className="flex gap-2 overflow-x-auto lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto" data-testid="lp-thumbs">
          {slides.map((x, i) => <li key={x.id} className="w-32 shrink-0 lg:w-full"><button type="button" className={`block w-full rounded-xl p-1 ${i === cur ? "ring-2 ring-sun" : ""}`} onClick={() => { setCur(i); setSel(""); }} aria-label={tr(`Slide ${i + 1}`, `الشريحة ${i + 1}`)} data-testid="lp-thumb"><SlideView slide={x} asAdmin={asAdmin} live={false} testId="lp-thumb-slide" /><span className="text-xs font-bold">{i + 1}</span></button></li>)}
          {canSave && <li className="flex shrink-0 flex-col gap-1 lg:w-full">
            <button type="button" className={smallBtn} onClick={() => { setSlides((a) => [...a.slice(0, cur + 1), blankSlide(), ...a.slice(cur + 1)]); setCur(cur + 1); setDirty(true); }} data-testid="lp-slide-add">➕ {tr("Blank slide", "شريحة فارغة")}</button>
            <button type="button" className={smallBtn} onClick={() => { setSlides((a) => [...a.slice(0, cur + 1), { ...a[cur], id: uid("s"), els: a[cur].els.map((e) => ({ ...e, id: uid() })) }, ...a.slice(cur + 1)]); setCur(cur + 1); setDirty(true); }} data-testid="lp-slide-dup">⧉ {tr("Duplicate", "تكرار")}</button>
            <label className={smallBtn + " cursor-pointer"} data-testid="lp-import">📥 {imp || tr("Import PowerPoint", "استيراد PowerPoint")}<input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" data-testid="lp-pptx-input" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const got = await importPptx(f, asAdmin, (i, n) => setImp(`${i}/${n}…`)); setSlides((a) => [...a.filter((x) => x.els.length), ...got]); setDirty(true); setMsg(tr(`Imported ${got.length} slides — every text and picture can be edited.`, `تم استيراد ${got.length} شريحة — يمكن تعديل كل نص وصورة.`)); } catch { setMsg(tr("That file couldn't be read. Save it as .pptx and try again.", "تعذّر قراءة الملف. احفظه بصيغة pptx.")); } setImp(""); }} /></label>
            {slides.length > 1 && <button type="button" className={smallBtn + " !text-rose-700"} onClick={() => { if (!confirm(tr("Delete this slide?", "حذف هذه الشريحة؟"))) return; setSlides((a) => a.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)); setDirty(true); }} data-testid="lp-slide-del">🗑 {tr("Delete slide", "حذف الشريحة")}</button>}
            <div className="flex gap-1"><button type="button" className={smallBtn} disabled={cur === 0} onClick={() => { setSlides((a) => { const b = [...a]; [b[cur - 1], b[cur]] = [b[cur], b[cur - 1]]; return b; }); setCur(cur - 1); setDirty(true); }} aria-label={tr("Move up", "لأعلى")}>↑</button><button type="button" className={smallBtn} disabled={cur >= slides.length - 1} onClick={() => { setSlides((a) => { const b = [...a]; [b[cur + 1], b[cur]] = [b[cur], b[cur + 1]]; return b; }); setCur(cur + 1); setDirty(true); }} aria-label={tr("Move down", "لأسفل")}>↓</button></div>
          </li>}
        </ol>
        <div className="min-w-0 space-y-2">
          {canSave && <AddTools add={add} pen={pen} setPen={setPen} asAdmin={asAdmin} teacher onErr={setMsg} onUndoStroke={() => { const d = draw(); if (d) patch(d.id, { paths: d.paths.slice(0, -1) } as Partial<El>); }} onClearDraw={() => { const d = draw(); if (d) setSlide((x) => ({ ...x, els: x.els.filter((e) => e !== d) })); }} />}
          {canSave && <label className="flex items-center gap-2 text-xs font-bold">{tr("Slide colour", "لون الشريحة")}<input type="color" value={s.bg} onChange={(e) => setSlide((x) => ({ ...x, bg: e.target.value }))} data-testid="lp-slide-bg" /><span className="font-normal opacity-60">{tr("Tip: paste a picture, text or YouTube link straight onto the slide (Ctrl/⌘+V).", "نصيحة: الصق صورة أو نصًا أو رابط YouTube مباشرة.")}</span></label>}
          <SlideView slide={s} asAdmin={asAdmin} edit={canSave ? "t" : null} selected={sel} onSelect={setSel} onMove={patch} pen={pen} onStroke={onStroke} testId="lp-canvas" />
          {selEl && canSave && <ElProps e={selEl} set={(q) => patch(selEl.id, q)} del={() => { setSlide((x) => ({ ...x, els: x.els.filter((e) => e.id !== sel) })); setSel(""); }} front={() => setSlide((x) => ({ ...x, els: [...x.els.filter((e) => e.id !== sel), selEl] }))} back={() => setSlide((x) => ({ ...x, els: [selEl, ...x.els.filter((e) => e.id !== sel)] }))} />}
        </div>
      </div>
      {p.id && p.status === "published" && <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5" data-testid="lp-progress">
        <div className="flex items-center gap-2"><b>📈 {tr("Progress per student", "التقدم لكل طالب")}</b><button type="button" className={smallBtn} onClick={() => lp.work(p.id, undefined, asAdmin).then((r) => setProg(r.progress || [])).catch(() => setProg([]))} data-testid="lp-progress-load">{tr("Refresh", "تحديث")}</button></div>
        {prog && <table className="mt-2 w-full text-sm"><tbody>{prog.map((r) => <tr key={r.student} className="border-t border-black/5"><td className="py-1">{roster.find((x) => x.id === r.student)?.name || r.student}</td><td>{r.seen}/{r.total} {tr("slides", "شرائح")}</td><td>{r.status}</td></tr>)}</tbody></table>}
      </div>}
    </div>
  );
}
