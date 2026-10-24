"use client";
/** t321: the full Quran homework setup, inline in the slide (no separate page). */
import { useEffect, useState } from "react";
import { RosterPicker } from "@/components/lms/ClassLaunch";
import { useTr } from "@/components/lms/useLms";
import { quranChapters, RECITERS, type Chapter } from "@/lib/lms";
import type { El } from "@/lib/packs";

type Q = Extract<El, { t: "quran" }>;
const dtl = (ms: number) => (ms ? new Date(ms + 4 * 3600e3).toISOString().slice(0, 16) : "");
const fromDtl = (s: string) => (s ? Date.parse(`${s}:00+04:00`) : 0);
const f = "mt-1 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm text-[#12352a] focus:outline-none focus:ring-2 focus:ring-emerald-400";
const tog = (on: boolean) => `flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition ${on ? "bg-emerald-700 text-white ring-emerald-800" : "bg-white text-[#12352a] ring-emerald-300 hover:bg-emerald-50"}`;
type RP = Parameters<typeof RosterPicker>[0];

export function QuranSetup({ subject, q, set, title, setTitle, keys, setKeys, roster, groups, assignAt, due, setDates, nStudents }: {
  q: Q; set: (p: Partial<Q>) => void; title: string; setTitle: (t: string) => void;
  keys: string[]; setKeys: (k: string[]) => void; roster: RP["roster"]; groups: RP["groups"];
  assignAt: number; due: number; setDates: (a: number, d: number) => void; nStudents: number; subject?: string;
}) {
  const { tr } = useTr();
  const [ch, setCh] = useState<Chapter[]>([]);
  useEffect(() => { quranChapters().then(setCh).catch(() => undefined); }, []);
  const all = ch.length ? ch : Array.from({ length: 114 }, (_, i) => ({ id: i + 1, name_simple: `Surah ${i + 1}`, name_arabic: "", verses_count: 286 }));
  const c = all.find((x) => x.id === q.surah);
  const max = c?.verses_count || 286;
  const auto = `${c?.name_simple || `Surah ${q.surah}`} ${q.from}–${q.to}`;
  return (
    <section className="space-y-3 rounded-3xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 text-[#12352a] shadow-sm" data-testid="lp-quran-setup">
      <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold"><span className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-700 text-white">📖</span>{tr("Quran homework setup", "إعداد واجب القرآن")}<span className="text-xs font-semibold opacity-70">{tr("— on this slide", "— في هذه الشريحة")}</span></h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-bold sm:col-span-2">{tr("Surah", "السورة")}
          <select className={f} value={q.surah} onChange={(e) => { const s = Number(e.target.value); const v = all.find((x) => x.id === s)?.verses_count || 7; set({ surah: s, from: 1, to: Math.min(v, 10) }); }} data-testid="lpq-surah">
            {all.map((x) => <option key={x.id} value={x.id}>{x.id}. {x.name_simple} {x.name_arabic}</option>)}</select></label>
        <label className="text-sm font-bold">{tr("From verse", "من الآية")}<input type="number" min={1} max={max} className={f} value={q.from} onChange={(e) => { const v = Math.max(1, Math.min(max, Number(e.target.value) || 1)); set({ from: v, to: Math.max(v, q.to) }); }} data-testid="lpq-from" /></label>
        <label className="text-sm font-bold">{tr("To verse", "إلى الآية")}<input type="number" min={q.from} max={max} className={f} value={q.to} onChange={(e) => set({ to: Math.max(q.from, Math.min(max, Number(e.target.value) || q.from)) })} data-testid="lpq-to" /></label>
        <label className="text-sm font-bold sm:col-span-3">{tr("Homework title (students see this)", "عنوان الواجب (يراه الطلاب)")}<input className={f} dir="auto" value={title} placeholder={auto} onChange={(e) => setTitle(e.target.value)} data-testid="lpq-title" /></label>
        <div className="flex items-end"><button type="button" className="w-full rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-200" onClick={() => setTitle(auto)} data-testid="lpq-title-auto">↺ {tr("Use surah name", "اسم السورة")}</button></div>
        <label className="text-sm font-bold sm:col-span-2">{tr("Reciter (listen along)", "القارئ (للاستماع)")}<select className={f} value={q.reciter || "Alafasy_128kbps"} onChange={(e) => set({ reciter: e.target.value })} data-testid="lpq-reciter">{RECITERS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="text-sm font-bold sm:col-span-2">{tr("Notes for students", "ملاحظات للطلاب")}<input className={f} dir="auto" value={q.notes || ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} data-testid="lpq-notes" /></label>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="lpq-toggles">
        <label className={tog(!!q.memorise)}><input type="checkbox" className="sr-only" checked={!!q.memorise} onChange={(e) => set({ memorise: e.target.checked })} data-testid="lpq-memorise" />🧠 {tr("Memorise & record", "احفظ وسجّل")}</label>
        <label className={tog(q.memoAudio !== false)}><input type="checkbox" className="sr-only" checked={q.memoAudio !== false} onChange={(e) => set({ memoAudio: e.target.checked })} data-testid="lpq-listen" />🔊 {tr("Let students listen", "السماح بالاستماع")}</label>
        <label className={tog(!!q.translit)}><input type="checkbox" className="sr-only" checked={!!q.translit} onChange={(e) => set({ translit: e.target.checked })} data-testid="lpq-translit" />🔤 {tr("Transliteration", "النطق اللاتيني")}</label>
        <label className={tog(!!q.translation)}><input type="checkbox" className="sr-only" checked={!!q.translation} onChange={(e) => set({ translation: e.target.checked })} data-testid="lpq-translation" />🌐 {tr("Translation", "الترجمة")}</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-sm font-bold sm:col-span-2">👥 {tr("Who is it for (groups, classes, students)", "لمن (المجموعات والصفوف والطلاب)")} <span className="font-normal opacity-70">· {nStudents} {tr("students", "طالب")}</span><div className="mt-1 rounded-2xl bg-white p-2 ring-1 ring-emerald-200"><RosterPicker subject={subject} value={keys} onChange={setKeys} roster={roster} groups={groups} /></div></div>
        <label className="text-sm font-bold">🗓️ {tr("Assign at (Dubai)", "وقت الإسناد (دبي)")}<input type="datetime-local" className={f} value={dtl(assignAt)} onChange={(e) => setDates(fromDtl(e.target.value), due)} data-testid="lpq-assign" /></label>
        <label className="text-sm font-bold">⏰ {tr("Submission date (Dubai)", "موعد التسليم (دبي)")}<input type="datetime-local" className={f} value={dtl(due)} onChange={(e) => setDates(assignAt, fromDtl(e.target.value))} data-testid="lpq-due" /></label>
      </div>
    </section>
  );
}
