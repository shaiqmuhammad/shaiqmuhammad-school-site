"use client";

import { useEffect, useState } from "react";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { ClassNames, loadNames, randInt, shuffled } from "@/components/activity/ClassNames";
import { useI18n } from "@/lib/i18n";

type Mode = "pick" | "groups" | "number";
const GROUP_COLORS = ["bg-sky-100 dark:bg-sky-900/40", "bg-amber-100 dark:bg-amber-900/40", "bg-emerald-100 dark:bg-emerald-900/40", "bg-rose-100 dark:bg-rose-900/40", "bg-violet-100 dark:bg-violet-900/40", "bg-teal-100 dark:bg-teal-900/40"];

/** Teacher-only randomiser: pick a student, make groups of N, or roll a random number. */
export function Randomiser() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [names, setNames] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("pick");
  // picker
  const [noRepeat, setNoRepeat] = useState(true);
  const [used, setUsed] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  // groups
  const [sizeText, setSizeText] = useState("4");
  const size = Math.max(1, Math.min(100, Math.trunc(Number(sizeText)) || 1));
  const [groupBy, setGroupBy] = useState<"size" | "count">("size");
  const [groups, setGroups] = useState<string[][]>([]);
  // number
  const [minText, setMinText] = useState("1");
  const [maxText, setMaxText] = useState("30");
  const min = Math.trunc(Number(minText)) || 0;
  const max = Math.trunc(Number(maxText)) || 0;
  const [num, setNum] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNames(loadNames());
  }, []);

  const pool = noRepeat ? names.filter((x) => !used.includes(x)) : names;

  function animate(final: () => void, flash: () => void) {
    setRolling(true);
    let i = 0;
    const iv = setInterval(() => {
      flash();
      if (++i >= 14) {
        clearInterval(iv);
        final();
        setRolling(false);
      }
    }, 70);
  }

  function pickOne() {
    if (rolling || pool.length === 0) return;
    const choice = pool[randInt(pool.length)];
    animate(
      () => {
        setPicked(choice);
        if (noRepeat) setUsed((u) => [...u, choice]);
      },
      () => setPicked(pool[randInt(pool.length)]),
    );
  }

  function makeGroups() {
    const s = shuffled(names);
    const k = groupBy === "size" ? Math.max(1, Math.ceil(s.length / Math.max(1, size))) : Math.max(1, Math.min(size, s.length));
    const out: string[][] = Array.from({ length: k }, () => []);
    s.forEach((name, i) => out[i % k].push(name));
    setGroups(out.filter((g) => g.length));
  }

  function rollNumber() {
    if (rolling) return;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const span = Math.min(hi - lo + 1, 1_000_000_000);
    animate(
      () => setNum(lo + randInt(span)),
      () => setNum(lo + randInt(span)),
    );
  }

  const tabs: { id: Mode; label: string; icon: string }[] = [
    { id: "pick", label: tr("Pick a student", "اختيار طالب"), icon: "🎯" },
    { id: "groups", label: tr("Make groups", "تكوين مجموعات"), icon: "👥" },
    { id: "number", label: tr("Random number", "رقم عشوائي"), icon: "🔢" },
  ];
  const input = "w-24 rounded-2xl border-2 border-navy/15 bg-white px-3 py-2 text-center text-lg font-bold tabular-nums outline-none focus:border-sun-border dark:border-white/15 dark:bg-black/20";

  return (
    <AssessmentShell title={tr("Randomiser", "الاختيار العشوائي")} exitHref="/admin" wide>
      <div className="mx-auto grid w-full max-w-[1500px] flex-1 gap-6 px-3 py-5 sm:px-6 lg:grid-cols-[1fr_360px]" data-testid="randomiser-page">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap gap-2" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                className={`rounded-full px-4 py-2 font-bold ${mode === t.id ? "bg-header text-sun" : "glass"}`}
                onClick={() => setMode(t.id)}
                data-testid={`rand-tab-${t.id}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {mode === "pick" && (
            <section className="glass flex flex-col items-center gap-5 rounded-[28px] p-6 text-center sm:p-10">
              <p className={`min-h-[1.2em] break-words text-5xl font-black sm:text-7xl ${rolling ? "opacity-60" : "text-navy dark:text-sun"}`} dir="auto" aria-live="polite" data-testid="rand-picked">
                {picked ?? "?"}
              </p>
              <button type="button" className={`${primaryBtn} px-10 text-xl`} onClick={pickOne} disabled={rolling || pool.length === 0} data-testid="rand-pick">
                🎯 {tr("Pick", "اختر")}
              </button>
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat(e.target.checked)} /> {tr("Don't repeat", "بدون تكرار")}
                </label>
                {noRepeat && (
                  <span className="opacity-75" data-testid="rand-left">
                    {tr(`${pool.length} of ${names.length} left`, `بقي ${pool.length} من ${names.length}`)}
                  </span>
                )}
                {used.length > 0 && (
                  <button type="button" className="rounded-full border border-black/10 px-3 py-1 dark:border-white/15" onClick={() => { setUsed([]); setPicked(null); }}>
                    ↺ {tr("Reset", "إعادة")}
                  </button>
                )}
              </div>
              {names.length === 0 && <p className="text-sm opacity-75">{tr("Add names on the right first.", "أضف الأسماء أولًا.")}</p>}
              {noRepeat && names.length > 0 && pool.length === 0 && <p className="text-sm font-semibold">{tr("Everyone has been picked.", "تم اختيار الجميع.")}</p>}
            </section>
          )}

          {mode === "groups" && (
            <section className="space-y-4">
              <div className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
                <select className="rounded-full border border-black/10 bg-white/80 px-3 py-2 font-semibold dark:border-white/15 dark:bg-black/30" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "size" | "count")} aria-label={tr("Group by", "التقسيم حسب")}>
                  <option value="size">{tr("Students per group", "طلاب في كل مجموعة")}</option>
                  <option value="count">{tr("Number of groups", "عدد المجموعات")}</option>
                </select>
                <input type="number" min={1} max={100} className={input} value={sizeText} onChange={(e) => setSizeText(e.target.value)} onBlur={() => setSizeText(String(size))} aria-label="N" data-testid="rand-group-size" />
                <button type="button" className={primaryBtn} onClick={makeGroups} disabled={names.length === 0} data-testid="rand-make-groups">
                  👥 {groups.length ? tr("Reshuffle", "إعادة الخلط") : tr("Make groups", "كوّن المجموعات")}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="rand-groups">
                {groups.map((g, i) => (
                  <div key={i} className={`rounded-3xl p-4 ${GROUP_COLORS[i % GROUP_COLORS.length]}`} data-testid="rand-group">
                    <p className="text-lg font-black">{tr(`Group ${i + 1}`, `المجموعة ${i + 1}`)} <span className="text-sm font-semibold opacity-70">· {g.length}</span></p>
                    <ul className="mt-2 space-y-1 text-lg">
                      {g.map((name) => (
                        <li key={name} dir="auto">{name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {names.length === 0 && <p className="text-sm opacity-75">{tr("Add names on the right first.", "أضف الأسماء أولًا.")}</p>}
            </section>
          )}

          {mode === "number" && (
            <section className="glass flex flex-col items-center gap-5 rounded-[28px] p-6 text-center sm:p-10">
              <div className="flex items-center gap-3 text-sm font-bold">
                <label className="flex items-center gap-2">{tr("From", "من")} <input type="number" className={input} value={minText} onChange={(e) => setMinText(e.target.value)} onBlur={() => setMinText(String(min))} data-testid="rand-min" /></label>
                <label className="flex items-center gap-2">{tr("to", "إلى")} <input type="number" className={input} value={maxText} onChange={(e) => setMaxText(e.target.value)} onBlur={() => setMaxText(String(max))} data-testid="rand-max" /></label>
              </div>
              <p className={`text-8xl font-black tabular-nums sm:text-9xl ${rolling ? "opacity-60" : "text-navy dark:text-sun"}`} aria-live="polite" data-testid="rand-number">
                {num ?? "?"}
              </p>
              <button type="button" className={`${primaryBtn} px-10 text-xl`} onClick={rollNumber} disabled={rolling} data-testid="rand-roll">
                🎲 {tr("Roll", "ارمِ")}
              </button>
            </section>
          )}
        </div>
        <aside>
          <ClassNames names={names} setNames={(l) => { setNames(l); setUsed((u) => u.filter((x) => l.includes(x))); }} />
        </aside>
      </div>
    </AssessmentShell>
  );
}
