"use client";

import { useEffect, useMemo, useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsSession, type RosterStudent, type StudentGroup } from "@/lib/lms";

/** t312: pick the year group(s) / class(es) / section(s) / groups a live activity or assessment starts with. Keys: "Year 3" | "Year 3|3A" | "g:<id>". */
export const LOCK_TYPES = ["assess", "wordcloud", "poll", "survey", "tps", "vote"];
export function useRosterData(given?: { roster: RosterStudent[] | null; groups: StudentGroup[] }) {
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const has = !!given;
  useEffect(() => {
    if (has) return;
    lmsApi.classRoster().then((r) => setRoster(r.students)).catch(() => setRoster([]));
    lmsApi.grpList().then((r) => setGroups(lmsSession()?.user.role === "teacher" ? r.items.filter((g) => g.assigned) : r.items)).catch(() => undefined);
  }, [has]);
  if (given) return { roster: given.roster || [], groups: given.groups, loading: given.roster === null };
  return { roster: roster || [], groups, loading: roster === null };
}
export function rosterIds(keys: string[], roster: RosterStudent[], groups: StudentGroup[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    if (k.startsWith("g:")) { groups.find((g) => g.id === k.slice(2))?.students.forEach((id) => { if (roster.some((s) => s.id === id)) out.add(id); }); continue; }
    const [c, sec] = k.split("|");
    roster.filter((s) => s.cls === c && (!sec || s.section === sec)).forEach((s) => out.add(s.id));
  }
  return [...out];
}
export const keyLabel = (k: string, groups: StudentGroup[]) => (k.startsWith("g:") ? groups.find((g) => g.id === k.slice(2))?.name || "group" : k.replace("|", " · "));

export function RosterPicker({ value, onChange, roster, groups: allGroups, subject }: { value: string[]; onChange: (v: string[]) => void; roster: RosterStudent[]; groups: StudentGroup[]; subject?: string }) {
  const { tr } = useTr();
  // t322: only the groups of the chosen subject (groups without a subject always show).
  const groups = subject ? allGroups.filter((g) => !g.subject || g.subject === subject) : allGroups;
  const years = useMemo(() => [...new Set(roster.map((s) => s.cls).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [roster]);
  const secs = (y: string) => [...new Set(roster.filter((s) => s.cls === y && s.section).map((s) => s.section))].sort();
  const tog = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value.filter((x) => !(k.includes("|") ? x === k.split("|")[0] : x.startsWith(k + "|"))), k]);
  const chip = (k: string, label: string, n: number) => <button key={k} type="button" aria-pressed={value.includes(k)} onClick={() => tog(k)} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ring-black/15 ${value.includes(k) ? "bg-header text-sun" : "bg-white/70 dark:bg-white/10"}`} data-testid="roster-chip" data-key={k}>{value.includes(k) ? "✓ " : ""}{label} <span className="opacity-60">({n})</span></button>;
  return (
    <div className="space-y-2" data-testid="roster-picker">
      {years.map((y) => (
        <div key={y} className="flex flex-wrap items-center gap-1.5">
          {chip(y, `${y} · ${tr("whole year", "السنة كلها")}`, roster.filter((s) => s.cls === y).length)}
          {secs(y).map((sec) => chip(`${y}|${sec}`, sec, roster.filter((s) => s.cls === y && s.section === sec).length))}
        </div>
      ))}
      {groups.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-bold uppercase opacity-60">👥 {tr("Groups", "المجموعات")}</span>{groups.map((g) => chip(`g:${g.id}`, g.name, g.students.filter((id) => roster.some((s) => s.id === id)).length))}</div>}
      {!years.length && !groups.length && <p className="text-sm opacity-70">{tr("No students in your classes yet.", "لا يوجد طلاب في صفوفك بعد.")}</p>}
    </div>
  );
}

/** Hand-off to the activity / assessment page: who it is for (locked to them) — read once by the next page. */
export function startWithClass(type: string, ids: string[], label: string, title: string, quiz?: string) {
  if (type === "assess") {
    try { sessionStorage.setItem("sm-host-roster", JSON.stringify({ ids, label, at: Date.now() })); } catch { /* */ }
    window.location.assign(quiz ? `/assessments/host?quiz=${encodeURIComponent(quiz)}` : "/lms/assessments#pick");
    return;
  }
  try { sessionStorage.setItem("sm-act-prefill", JSON.stringify({ audience: ids, title, label, locked: true })); } catch { /* */ }
  window.location.assign(`/lms/activities#t=${type}`);
}
export function startRandom(type: string, quiz?: string) {
  try { sessionStorage.removeItem("sm-act-prefill"); sessionStorage.removeItem("sm-host-roster"); } catch { /* */ }
  window.location.assign(type === "assess" ? (quiz ? `/assessments/host?quiz=${encodeURIComponent(quiz)}` : "/lms/assessments") : `/lms/activities#t=${type}`);
}

/** The two-option launcher: (a) start with a class / year group (picker, defaulting to the open class) or (b) random people with a code / QR. */
export function LaunchChooser({ type, icon, title, defaultKeys = [], quiz, onClose, onClass, given }: { type: string; icon: string; title: string; defaultKeys?: string[]; quiz?: string; onClose: () => void; onClass?: (ids: string[], label: string) => void; given?: { roster: RosterStudent[] | null; groups: StudentGroup[] } }) {
  const { tr } = useTr();
  const { roster, groups, loading } = useRosterData(given);
  const [keys, setKeys] = useState<string[]>(defaultKeys);
  const [step, setStep] = useState<"choose" | "class">("choose");
  const ids = rosterIds(keys, roster, groups);
  const label = keys.map((k) => keyLabel(k, groups)).join(", ");
  const go = () => { if (!ids.length) return; if (onClass) onClass(ids, label); else startWithClass(type, ids, label, `${title} · ${label}`, quiz); };
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/40 p-3" onClick={onClose} role="presentation">
        <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 text-[#1b2f44] shadow-2xl dark:bg-[#10202f] dark:text-white" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} data-testid="launch">
          <div className="mb-3 flex items-center gap-2"><p className="flex-1 text-lg font-extrabold"><span aria-hidden>{icon}</span> {title}</p><button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/5 dark:bg-white/10" onClick={onClose} aria-label={tr("Close", "إغلاق")}>✕</button></div>
          {step === "choose" ? (
            <div className="grid gap-2">
              <button type="button" className="rounded-2xl bg-sun px-4 py-4 text-start font-extrabold text-[#0b1b2b]" onClick={() => setStep("class")} data-testid="launch-class">👥 {tr("Start with a class / year group", "ابدأ مع صف / سنة دراسية")}<span className="block text-xs font-semibold opacity-75">{tr("Only those students can join — straight in under their own name, results go to their record", "فقط هؤلاء الطلاب يمكنهم الانضمام — مباشرة بأسمائهم، والنتائج تُحفظ في سجلهم")}</span></button>
              <button type="button" className="rounded-2xl bg-header px-4 py-4 text-start font-extrabold text-white" onClick={() => startRandom(type, quiz)} data-testid="launch-random">🙋 {tr("Start with random people", "ابدأ مع أشخاص عشوائيين")}<span className="block text-xs font-semibold opacity-75">{tr("Show a code / QR — people type a name and join with the Join button on the website", "اعرض رمزًا / QR — يكتب الأشخاص أسماءهم وينضمون بزر انضم في الموقع")}</span></button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-bold">{tr("Choose year group(s), class(es), section(s) or groups:", "اختر السنة أو الصف أو الشعبة أو المجموعات:")}</p>
              {loading ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : <RosterPicker value={keys} onChange={setKeys} roster={roster} groups={groups} />}
              <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-3 dark:border-white/10">
                <span className="me-auto text-sm font-bold" data-testid="launch-count">{tr(`${ids.length} students`, `${ids.length} طالبًا`)}</span>
                <button type="button" className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold dark:border-white/20" onClick={() => setStep("choose")}>{tr("Back", "رجوع")}</button>
                <button type="button" disabled={!ids.length} className="rounded-full bg-sun px-5 py-2 text-sm font-extrabold text-[#0b1b2b] disabled:opacity-50" onClick={go} data-testid="launch-go">▶ {tr("Start", "ابدأ")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
