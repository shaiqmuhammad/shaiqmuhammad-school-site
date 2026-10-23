"use client";

import { useTr } from "@/components/lms/useLms";
import { domainName, outcomeText, outcomesFor, STD_DOMAINS, STD_OUTCOMES, type UnitStd } from "@/lib/standards";

/** Read-only display: main skill + linked standard outcomes, in the site language. */
export function StdView({ std, compact = false }: { std?: UnitStd; compact?: boolean }) {
  const { lang, tr } = useTr();
  if (!std || (!std.codes.length && !std.skill)) return null;
  if (compact) return <span className="text-[11px] opacity-80" data-testid="std-compact">{std.skill ? domainName(std.skill, lang) : ""}{std.codes.length ? ` · ${std.codes.join(", ")}` : ""}</span>;
  return (
    <details className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sm dark:bg-sky-900/20" data-testid="cur-std">
      <summary className="cursor-pointer text-xs font-extrabold text-sky-900 dark:text-sky-200">🎯 {tr("Main skill", "المهارة الرئيسية")}: {std.skill ? domainName(std.skill, lang) : "—"} · {tr("Standards", "المعايير")} ({std.codes.length})</summary>
      <ul className="mt-1 space-y-0.5 ps-1" dir={lang === "ar" ? "rtl" : "ltr"}>{std.codes.map((c) => <li key={c} data-testid="cur-std-item"><b className="font-mono text-xs" dir="ltr">{c}</b> {outcomeText(c, lang)}</li>)}</ul>
    </details>
  );
}

/** Editor: main skill select + outcome checklist filtered to the unit's grade. */
export function StdEditor({ yr, value, onChange }: { yr: string; value?: UnitStd; onChange: (v: UnitStd) => void }) {
  const { lang, tr } = useTr();
  const v = value || { codes: [], skill: 0 };
  const list = outcomesFor(yr);
  return (
    <div className="space-y-1 sm:col-span-3" data-testid="cur-e-std">
      <label className="block text-xs font-bold">{tr("Main skill (UAE standards field)", "المهارة الرئيسية (مجال المعايير)")}
        <select className="mt-1 w-full rounded-xl border border-black/15 bg-white px-2 py-1.5 text-sm dark:border-white/20 dark:bg-slate-900" value={v.skill} onChange={(e) => onChange({ ...v, skill: Number(e.target.value) })} data-testid="cur-e-skill">
          <option value={0}>—</option>{STD_DOMAINS.map((d) => <option key={d.n} value={d.n}>{d.n}. {lang === "ar" ? d.ar : d.en}</option>)}
        </select></label>
      <details className="rounded-xl border border-black/10 px-2 py-1 text-xs dark:border-white/15" open={!v.codes.length}>
        <summary className="cursor-pointer font-bold">{tr("Standards / learning outcomes", "المعايير / نواتج التعلم")} ({v.codes.length}) — {yr || tr("all grades", "كل الصفوف")}</summary>
        <div className="mt-1 max-h-56 space-y-0.5 overflow-auto" dir={lang === "ar" ? "rtl" : "ltr"}>{list.map((c) => <label key={c} className="flex items-start gap-1.5"><input type="checkbox" checked={v.codes.includes(c)} onChange={(e) => onChange({ ...v, codes: e.target.checked ? [...v.codes, c] : v.codes.filter((x) => x !== c) })} data-testid="cur-e-std-code" /><span><b className="font-mono" dir="ltr">{c}</b> {outcomeText(c, lang)} <span className="opacity-60">({domainName(Number(c.split(".")[3]), lang)} · p.{lang === "ar" ? STD_OUTCOMES[c].pAr : STD_OUTCOMES[c].p})</span></span></label>)}</div>
      </details>
    </div>
  );
}
