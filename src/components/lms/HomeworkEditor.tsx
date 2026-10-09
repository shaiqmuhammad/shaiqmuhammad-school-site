"use client";

import { useEffect, useState } from "react";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, quranChapters, RECITERS, type Chapter, type GeneralData, type Homework, type QuranData, type Slide } from "@/lib/lms";

/** Create / edit a homework (Quran verses or general slides) for a class or chosen students. */
export function HomeworkEditor({ initial, classes, students, asAdmin, onSaved, onCancel }: { initial?: Homework; classes: { cls: string; students: number }[]; students: { id: string; name: string; cls: string }[]; asAdmin: boolean; onSaved: (id: string) => void; onCancel: () => void }) {
  const { tr } = useTr();
  const [kind, setKind] = useState<"quran" | "general">(initial?.kind || "quran");
  const [title, setTitle] = useState(initial?.title || "");
  const [cls, setCls] = useState(initial?.cls ?? (classes[0]?.cls || ""));
  const [pick, setPick] = useState<string[]>(initial?.students || []);
  const [due, setDue] = useState(initial?.due ? new Date(initial.due).toISOString().slice(0, 10) : "");
  const q0 = (initial?.kind === "quran" ? initial.data : {}) as Partial<QuranData>;
  const g0 = (initial?.kind === "general" ? initial.data : {}) as Partial<GeneralData>;
  const [surah, setSurah] = useState(q0.surah || 1);
  const [from, setFrom] = useState(q0.from || 1);
  const [to, setTo] = useState(q0.to || 7);
  const [reciter, setReciter] = useState(q0.reciter || "Alafasy_128kbps");
  const [notes, setNotes] = useState(q0.notes || "");
  const [slides, setSlides] = useState<Slide[]>(g0.slides?.length ? g0.slides : [{ title: "", text: "", image: "" }]);
  const [question, setQuestion] = useState(g0.question || "");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    quranChapters().then(setChapters);
  }, []);
  const ch = chapters.find((c) => c.id === surah);
  const max = ch?.verses_count || 286;

  return (
    <form
      className={card + " space-y-4"}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          const data = kind === "quran" ? { surah, from, to: Math.max(from, to), reciter, notes } : { slides: slides.filter((s) => s.title || s.text || s.image), question };
          const r = await lmsApi.saveHomework({ id: initial?.id, kind, title: title.trim() || (kind === "quran" && ch ? `${ch.name_simple} ${from}–${to}` : ""), cls: pick.length ? "" : cls, students: pick, due: due ? new Date(due + "T23:59:00").getTime() : null, data: data as QuranData | GeneralData }, asAdmin);
          onSaved(r.id);
        } catch (x) {
          setErr(lmsErrorText(x, tr));
          setBusy(false);
        }
      }}
      data-testid="hw-editor"
    >
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {(["quran", "general"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`rounded-full px-4 py-2 font-bold ${kind === k ? "bg-header text-sun" : "glass"}`} data-testid={`hw-kind-${k}`}>
            {k === "quran" ? "📖 " + tr("Quran", "قرآن") : "📝 " + tr("General", "عام")}
          </button>
        ))}
      </div>
      <label className="block text-sm font-semibold">
        {tr("Title", "العنوان")} {kind === "quran" && <span className="font-normal opacity-60">({tr("optional", "اختياري")})</span>}
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} dir="auto" data-testid="hw-title" />
      </label>

      {kind === "quran" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block text-sm font-semibold sm:col-span-2">
            {tr("Surah", "السورة")}
            <select className={inputCls} value={surah} onChange={(e) => { const s = Number(e.target.value); setSurah(s); setFrom(1); setTo(Math.min(chapters.find((c) => c.id === s)?.verses_count || 7, 10)); }} data-testid="hw-surah">
              {(chapters.length ? chapters : Array.from({ length: 114 }, (_, i) => ({ id: i + 1, name_simple: `Surah ${i + 1}`, name_arabic: "", verses_count: 286 }))).map((c) => (
                <option key={c.id} value={c.id}>{c.id}. {c.name_simple} {c.name_arabic}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            {tr("From verse", "من الآية")}
            <input type="number" min={1} max={max} className={inputCls} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} data-testid="hw-from" />
          </label>
          <label className="block text-sm font-semibold">
            {tr("To verse", "إلى الآية")}
            <input type="number" min={from} max={max} className={inputCls} value={to} onChange={(e) => setTo(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} data-testid="hw-to" />
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            {tr("Reciter (listen along)", "القارئ (للاستماع)")}
            <select className={inputCls} value={reciter} onChange={(e) => setReciter(e.target.value)}>
              {RECITERS.map(([id, n]) => (
                <option key={id} value={id}>{n}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            {tr("Notes for students", "ملاحظات للطلاب")}
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} dir="auto" />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((s, i) => (
            <div key={i} className="space-y-2 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5" data-testid="hw-slide">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold opacity-60">{tr(`Slide ${i + 1}`, `الشريحة ${i + 1}`)}</span>
                <span className="flex-1" />
                {slides.length > 1 && <button type="button" className="text-sm text-rose-600" onClick={() => setSlides(slides.filter((_, j) => j !== i))}>✕</button>}
              </div>
              <input className={inputCls} placeholder={tr("Slide title", "عنوان الشريحة")} value={s.title} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} dir="auto" data-testid="hw-slide-title" />
              <textarea className={inputCls + " min-h-20"} placeholder={tr("Text", "النص")} value={s.text} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} dir="auto" data-testid="hw-slide-text" />
              <input className={inputCls} placeholder={tr("Picture link (https://…, optional)", "رابط صورة (اختياري)")} value={s.image} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, image: e.target.value } : x)))} dir="ltr" />
            </div>
          ))}
          {slides.length < 30 && <button type="button" className={smallBtn} onClick={() => setSlides([...slides, { title: "", text: "", image: "" }])} data-testid="hw-slide-add">+ {tr("Add slide", "إضافة شريحة")}</button>}
          <label className="block text-sm font-semibold">
            {tr("Question for the written answer", "سؤال الإجابة المكتوبة")}
            <textarea className={inputCls + " min-h-16"} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} dir="auto" data-testid="hw-question" />
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold">
          {tr("Class", "الصف")}
          <select className={inputCls} value={cls} onChange={(e) => setCls(e.target.value)} disabled={pick.length > 0} data-testid="hw-class">
            <option value="">{tr("All students", "كل الطلاب")}</option>
            {classes.map((c) => (
              <option key={c.cls} value={c.cls}>{c.cls || tr("(no class)", "(بدون صف)")} · {c.students}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          {tr("Due date (optional)", "تاريخ التسليم (اختياري)")}
          <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <details className="text-sm sm:pt-6">
          <summary className="cursor-pointer font-semibold">{tr("…or choose students", "…أو اختر طلابًا")} {pick.length > 0 && `(${pick.length})`}</summary>
          <div className="mt-2 max-h-48 space-y-1 overflow-auto rounded-xl border border-black/10 p-2 dark:border-white/15">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={pick.includes(s.id)} onChange={(e) => setPick(e.target.checked ? [...pick, s.id] : pick.filter((x) => x !== s.id))} />
                <span dir="auto">{s.name}</span> <span className="opacity-60">{s.cls}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryBtn} disabled={busy} data-testid="hw-save">{busy ? "…" : initial ? tr("Save changes", "حفظ التغييرات") : tr("Assign homework", "إسناد الواجب")}</button>
        <button type="button" className={smallBtn} onClick={onCancel}>{tr("Cancel", "إلغاء")}</button>
      </div>
    </form>
  );
}
