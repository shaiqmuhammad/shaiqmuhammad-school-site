"use client";

import { useEffect, useState } from "react";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, quranChapters, RECITERS, type Chapter, type GeneralData, type Homework, type QuranData, type Slide, type Catalog, type DashStudent } from "@/lib/lms";

/** Create / edit a homework (Quran verses or general slides) for a class or chosen students. */
export function HomeworkEditor({ initial, classes, students, catalog, scope = [], asAdmin, onSaved, onCancel }: { initial?: Homework; classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[]; asAdmin: boolean; onSaved: (id: string) => void; onCancel: () => void }) {
  const { tr } = useTr();
  const [kind, setKind] = useState<"quran" | "general">(initial?.kind || "quran");
  const [title, setTitle] = useState(initial?.title || "");
  const [cls, setCls] = useState(initial?.cls ?? (scope[0]?.split("|")[0] || ""));
  const [pick, setPick] = useState<string[]>(initial?.students || []);
  const [section, setSection] = useState(initial?.section ?? "");
  const [who, setWho] = useState<"class" | "students">(initial?.students?.length && !initial.cls ? "students" : "class");
  const [fCls, setFCls] = useState("");
  const [fSec, setFSec] = useState("");
  // Classes from the catalog (plus any older free-text ones), narrowed to a teacher's scope when set.
  const counts = new Map(classes.map((c) => [c.cls, c.students]));
  const inScope = (c: string, sec = "") => !scope.length || scope.some((x) => { const [k, s2] = x.split("|"); return k === c && (!s2 || !sec || s2 === sec); });
  const classNames = [...new Set([...(catalog?.classes || []).map((c) => c.name), ...classes.map((c) => c.cls).filter(Boolean)])].filter((c) => inScope(c));
  const sectionsOf = (c: string) => (catalog?.sections || []).filter((x) => x.cls === c && inScope(c, x.name)).map((x) => x.name);
  const wholeClassOk = (c: string) => !scope.length || scope.includes(c);
  const shownStudents = students.filter((s) => inScope(s.cls, s.section) && (!fCls || s.cls === fCls) && (!fSec || s.section === fSec));
  const [due, setDue] = useState(initial?.due ? new Date(initial.due).toISOString().slice(0, 10) : "");
  const q0 = (initial?.kind === "quran" ? initial.data : {}) as Partial<QuranData>;
  const g0 = (initial?.kind === "general" ? initial.data : {}) as Partial<GeneralData>;
  const [surah, setSurah] = useState(q0.surah || 1);
  const [from, setFrom] = useState(q0.from || 1);
  const [to, setTo] = useState(q0.to || 7);
  const [reciter, setReciter] = useState(q0.reciter || "Alafasy_128kbps");
  const [translit, setTranslit] = useState(!!q0.translit);
  const [translation, setTranslation] = useState(!!q0.translation);
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

  const picker = (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <select className={inputCls + " mt-0 w-auto"} value={fCls} onChange={(e) => { setFCls(e.target.value); setFSec(""); }} aria-label={tr("Filter class", "تصفية الصف")}>
                  <option value="">{tr("All classes", "كل الصفوف")}</option>
                  {classNames.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className={inputCls + " mt-0 w-auto"} value={fSec} onChange={(e) => setFSec(e.target.value)} disabled={!fCls} aria-label={tr("Filter section", "تصفية الشعبة")}>
                  <option value="">{tr("All sections", "كل الشعب")}</option>
                  {fCls && sectionsOf(fCls).map((x) => <option key={x}>{x}</option>)}
                </select>
                <button type="button" className="rounded-full px-3 py-1 font-semibold glass" onClick={() => setPick([...new Set([...pick, ...shownStudents.map((s) => s.id)])])} data-testid="hw-pick-all">{tr("Select all shown", "تحديد الظاهرين")}</button>
                {pick.length > 0 && <button type="button" className="rounded-full px-3 py-1 font-semibold glass" onClick={() => setPick([])}>{tr("Clear", "مسح")} ({pick.length})</button>}
              </div>
              <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-black/10 p-2 dark:border-white/15">
                {shownStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={pick.includes(s.id)} onChange={(e) => setPick(e.target.checked ? [...pick, s.id] : pick.filter((x) => x !== s.id))} data-testid="hw-pick" />
                    <span dir="auto">{s.name}</span> <span className="opacity-60">{[s.cls, s.section].filter(Boolean).join(" · ")}</span>
                  </label>
                ))}
                {!shownStudents.length && <p className="opacity-60">{tr("No students here.", "لا يوجد طلاب.")}</p>}
              </div>
            </div>
  );

  return (
    <form
      className={card + " space-y-4"}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          const data = kind === "quran" ? { surah, from, to: Math.max(from, to), reciter, notes, translit, translation } : { slides: slides.filter((s) => s.title || s.text || s.image), question };
          const r = await lmsApi.saveHomework({ id: initial?.id, kind, title: title.trim() || (kind === "quran" && ch ? `${ch.name_simple} ${from}–${to}` : ""), cls: who === "students" ? "" : cls, section: who === "students" ? "" : section || (cls && !wholeClassOk(cls) ? sectionsOf(cls)[0] || "" : ""), students: pick, due: due ? new Date(due + "T23:59:00").getTime() : null, data: data as QuranData | GeneralData }, asAdmin);
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
          <div className="flex flex-wrap gap-4 text-sm font-semibold sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={translit} onChange={(e) => setTranslit(e.target.checked)} data-testid="hw-translit" /> {tr("Show transliteration", "إظهار النطق بالحروف اللاتينية")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={translation} onChange={(e) => setTranslation(e.target.checked)} data-testid="hw-translation" /> {tr("Show translation", "إظهار الترجمة / التفسير الميسر")}</label>
          </div>
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
        <fieldset className="space-y-2 text-sm sm:col-span-2">
          <legend className="font-semibold">{tr("Assign to", "إسناد إلى")}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(["class", "students"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)} className={`rounded-full px-3 py-1.5 font-bold ${who === k ? "bg-header text-sun" : "glass"}`} data-testid={`hw-who-${k}`}>
                {k === "class" ? tr("Class / section", "صف / شعبة") : tr("Group or individual students", "مجموعة أو طلاب محددون")}
              </button>
            ))}
          </div>
          {who === "class" ? (
            <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <select className={inputCls} value={cls} onChange={(e) => { setCls(e.target.value); setSection(""); }} data-testid="hw-class" aria-label={tr("Class", "الصف")}>
                {!scope.length && <option value="">{tr("All students", "كل الطلاب")}</option>}
                {classNames.map((c) => (
                  <option key={c} value={c}>{c}{counts.has(c) ? ` · ${counts.get(c)}` : ""}</option>
                ))}
              </select>
              <select className={inputCls} value={section} onChange={(e) => setSection(e.target.value)} disabled={!cls || !sectionsOf(cls).length} data-testid="hw-section" aria-label={tr("Section", "الشعبة")}>
                {(!cls || wholeClassOk(cls)) && <option value="">{tr("Whole class", "الصف كله")}</option>}
                {cls && sectionsOf(cls).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
              <details className="rounded-xl border border-black/10 p-2 dark:border-white/15" open={pick.length > 0} data-testid="hw-extra">
                <summary className="cursor-pointer font-semibold">{tr("Also add individual students", "أضف طلابًا آخرين أيضًا")}{pick.length ? ` (${pick.length})` : ""}</summary>
                <div className="mt-2">{picker}</div>
              </details>
            </div>
          ) : (
            picker
          )}
        </fieldset>
        <label className="block text-sm font-semibold">
          {tr("Due date (optional)", "تاريخ التسليم (اختياري)")}
          <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryBtn} disabled={busy} data-testid="hw-save">{busy ? "…" : initial ? tr("Save changes", "حفظ التغييرات") : tr("Assign homework", "إسناد الواجب")}</button>
        <button type="button" className={smallBtn} onClick={onCancel}>{tr("Cancel", "إلغاء")}</button>
      </div>
    </form>
  );
}
