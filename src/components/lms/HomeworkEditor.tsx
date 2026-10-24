"use client";

import { useEffect, useState } from "react";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { WhoPicker } from "@/components/lms/WhoPicker";
import { card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { grpLabel, lmsApi, lmsErrorText, quranChapters, RECITERS, type Chapter, type GeneralData, type Homework, type QuranData, type Slide, type Catalog, type DashStudent, type StudentGroup } from "@/lib/lms";

/** Create / edit a homework (Quran verses or general slides) for a class or chosen students. */
export function HomeworkEditor({ initial, classes, students, catalog, scope = [], asAdmin, onSaved, onCancel, kinds = ["quran", "general"] }: { kinds?: ("quran" | "general")[]; initial?: Homework; classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[]; asAdmin: boolean; onSaved: (id: string) => void; onCancel: () => void }) {
  const { tr } = useTr();
  // t315: new general homework is made as a Lesson Pack (slides); the old form stays only for editing existing general homework.
  kinds = initial?.kind === "general" ? ["general"] : kinds.filter((k) => k !== "general");
  const [kind, setKind] = useState<"quran" | "general">(initial?.kind || kinds[0] || "quran");
  const [title, setTitle] = useState(initial?.title || "");
  const [cls, setCls] = useState(initial?.cls ?? (scope[0]?.split("|")[0] || ""));
  const [pick, setPick] = useState<string[]>(initial?.students || []);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  useEffect(() => { lmsApi.grpList(asAdmin).then((r) => setGroups(r.items)).catch(() => undefined); }, [asAdmin]);
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
  const shownStudents = students.filter((s) => (!fCls || s.cls === fCls) && (!fSec || s.section === fSec));
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
  // t307: free text after "Surah from–to" (e.g. "revision"), and Memorise & record (students don't see the verse text).
  const [extra, setExtra] = useState(q0.extra || "");
  const [memorise, setMemorise] = useState(!!q0.memorise);
  const [memoAudio, setMemoAudio] = useState(q0.memoAudio !== false);
  const [slides, setSlides] = useState<Slide[]>(g0.slides?.length ? g0.slides : [{ title: "", text: "", image: "" }]);
  const [question, setQuestion] = useState(g0.question || "");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    quranChapters().then(setChapters);
  }, []);
  const ch = chapters.find((c) => c.id === surah);
  const allCh = chapters.length ? chapters : Array.from({ length: 114 }, (_, i) => ({ id: i + 1, name_simple: `Surah ${i + 1}`, name_arabic: "", verses_count: 286 }));
  // t302: the Quran homework title is made from the Surah picker + start/end verse; teachers keep an editable short list of Surahs.
  const [myList, setMyList] = useState<number[]>([]);
  useEffect(() => { try { setMyList((JSON.parse(localStorage.getItem("sm-surah-list") || "[]") as number[]).filter((n) => n >= 1 && n <= 114)); } catch { /* ignore */ } }, []);
  const saveList = (l: number[]) => { setMyList(l); try { localStorage.setItem("sm-surah-list", JSON.stringify(l)); } catch { /* ignore */ } };
  const baseTitle = `${ch?.name_simple || `Surah ${surah}`} ${from}–${Math.max(from, to)}`;
  const autoTitle = (extra.trim() ? `${baseTitle}, ${extra.trim()}` : baseTitle).slice(0, 160);
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
                {groups.length > 0 && <select className="rounded-full px-3 py-1 font-semibold glass" value="" onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); if (g) setPick([...new Set([...pick, ...g.students])]); }} data-testid="hw-group"><option value="">{tr("＋ Custom group…", "＋ مجموعة مخصصة…")}</option>{groups.map((g) => <option key={g.id} value={g.id}>{grpLabel(g)} ({g.students.length})</option>)}</select>}
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
        if (!asAdmin && !pick.length && !initial?.cls) { setErr(tr("Pick a group, a class/section or some students first.", "اختر مجموعة أو صفًا/شعبة أو طلابًا أولًا.")); return; }
        setBusy(true);
        setErr("");
        try {
          const data = kind === "quran" ? { surah, from, to: Math.max(from, to), reciter, notes, translit, translation, extra: extra.trim(), memorise, memoAudio } : { slides: slides.filter((s) => s.title || s.text || s.image), question };
          const r = await lmsApi.saveHomework({ id: initial?.id, kind, title: kind === "quran" ? autoTitle : title.trim(), cls: who === "students" || (!asAdmin && pick.length) ? "" : cls, section: who === "students" || (!asAdmin && pick.length) ? "" : section || (cls && !wholeClassOk(cls) ? sectionsOf(cls)[0] || "" : ""), students: pick, due: due ? new Date(due + "T23:59:00").getTime() : null, data: data as QuranData | GeneralData }, asAdmin);
          onSaved(r.id);
        } catch (x) {
          setErr(lmsErrorText(x, tr));
          setBusy(false);
        }
      }}
      data-testid="hw-editor"
    >
      <div className="flex flex-wrap items-center gap-2" role="radiogroup">
        {!initial && <a href="/lms/material?new=homework" className="rounded-full bg-sun px-4 py-2 font-extrabold text-[#1b2f44]" data-testid="hw-kind-pack">📚 {tr("Homework as slides (Lesson Pack)", "واجب بالشرائح (حزمة درس)")}</a>}
        {kinds.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`rounded-full px-4 py-2 font-bold ${kind === k ? "bg-header text-sun" : "glass"}`} data-testid={`hw-kind-${k}`}>
            {k === "quran" ? "📖 " + tr("Quran", "قرآن") : "📝 " + tr("General", "عام")}
          </button>
        ))}
      </div>
      {kind === "quran" ? (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" data-testid="hw-title-auto">
          <span>{tr("Title", "العنوان")}:</span>
          <span className="mt-1 flex flex-wrap items-center gap-2"><b dir="auto" className="rounded-full bg-white/70 px-3 py-1 dark:bg-white/10" data-testid="hw-title-base">{baseTitle}</b><span aria-hidden>,</span>
            <input className="min-w-[10rem] flex-1 rounded-full border border-emerald-700/20 bg-white px-3 py-1 font-normal text-[#1b2f44] dark:bg-white/10 dark:text-white" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={80} dir="auto" placeholder={tr("add text, e.g. revision", "أضف نصًا، مثل: مراجعة")} aria-label={tr("Text after the Surah name", "نص بعد اسم السورة")} data-testid="hw-title-extra" /></span>
          <span className="mt-1 block text-xs font-normal opacity-70">{tr("Saved as", "يُحفظ باسم")}: <span dir="auto" data-testid="hw-title-final">{autoTitle}</span></span>
        </div>
      ) : (
      <label className="block text-sm font-semibold">
        {tr("Title", "العنوان")}
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} dir="auto" data-testid="hw-title" />
      </label>
      )}

      {kind === "quran" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block text-sm font-semibold sm:col-span-2">
            {tr("Surah", "السورة")}
            <select className={inputCls} value={surah} onChange={(e) => { const s = Number(e.target.value); setSurah(s); setFrom(1); setTo(Math.min(chapters.find((c) => c.id === s)?.verses_count || 7, 10)); }} data-testid="hw-surah">
              {myList.length > 0 && <optgroup label={tr("★ My Surah list", "★ قائمتي")}>{allCh.filter((c) => myList.includes(c.id)).map((c) => <option key={"m" + c.id} value={c.id}>★ {c.id}. {c.name_simple} {c.name_arabic}</option>)}</optgroup>}
              <optgroup label={tr("All Surahs", "كل السور")}>{allCh.map((c) => (
                <option key={c.id} value={c.id}>{c.id}. {c.name_simple} {c.name_arabic}</option>
              ))}</optgroup>
            </select>
            <button type="button" className={smallBtn + " mt-1"} onClick={() => saveList(myList.includes(surah) ? myList.filter((x) => x !== surah) : [...myList, surah])} data-testid="hw-surah-star">{myList.includes(surah) ? tr("☆ Remove from my list", "☆ إزالة من قائمتي") : tr("★ Add to my list", "★ أضف إلى قائمتي")}</button>
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
            <label className="flex items-center gap-2" data-testid="hw-memorise-label"><input type="checkbox" className="h-5 w-5" checked={memorise} onChange={(e) => setMemorise(e.target.checked)} data-testid="hw-memorise" /> 🧠 {tr("Memorise & record (hide the verses from students)", "احفظ وسجّل (إخفاء الآيات عن الطلاب)")}</label>
            {memorise && <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={memoAudio} onChange={(e) => setMemoAudio(e.target.checked)} data-testid="hw-memo-audio" /> 🔊 {tr("Let students listen to the reciter", "السماح للطلاب بالاستماع للقارئ")}</label>}
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
          {!asAdmin ? <WhoPicker students={students} groups={groups.filter((g) => g.assigned).map((g) => ({ ...g, students: g.students.filter((id) => students.some((x) => x.id === id)) }))} value={pick} onChange={setPick} /> : (<>
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
          </>)}
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
