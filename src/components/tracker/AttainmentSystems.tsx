"use client";

import { ModulePermsGlobal } from "@/components/lms/ModulePerms";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { btn, btnCta, cardCls, field, Toast } from "@/components/lms/mods/ModUi";
import { modErr } from "@/lib/lmsMods";
import { fileToB64, setTrackerAdmin, TERMS, TRK_KEYS, trk, type ASys } from "@/lib/tracker";

const YEARS = ["FS1", "FS2", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"];
const KEYN: Record<string, [string, string]> = { view: ["Show / Hide", "إظهار / إخفاء"], edit: ["Add / Edit (scores, overrides)", "إضافة / تعديل"], effort: ["Edit Effort", "تعديل الجهد"], xlsx: ["Download Excel", "تنزيل Excel"], pdf: ["Download PDF", "تنزيل PDF"], isams: ["Download iSAMS", "تنزيل iSAMS"] };
const lab = "block text-xs font-bold";
const show = (s: string) => JSON.stringify(s); // keep the exact iSAMS spacing visible

/** Assessment → Attainment & Progress Systems (admin). Platform: Shaiq Muhammad System. */
export function AttainmentSystems() {
  const { tr } = useTr();
  setTrackerAdmin(true);
  const [list, setList] = useState<ASys[] | null>(null);
  const [cur, setCur] = useState<ASys | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const note = (m: string, b = false) => { setMsg(m); setBad(b); setTimeout(() => setMsg(""), 5000); };
  const load = () => trk<{ systems: ASys[] }>("asys-list", {}).then((r) => { setList(r.systems); setCur((c) => r.systems.find((s) => s.id === c?.id) || r.systems[0]); }).catch((e) => note(modErr(e, tr), true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);
  const save = async () => { if (!cur) return; try { await trk("asys-save", { system: cur }); note(tr("Saved.", "تم الحفظ.")); void load(); } catch (e) { note(modErr(e, tr), true); } };
  const add = async () => { const name = prompt(tr("Name of the new system (e.g. RIS Secondary Attainment and Progress System)", "اسم النظام الجديد")); if (!name) return; try { await trk("asys-save", { system: { name, active: false } }); void load(); } catch (e) { note(modErr(e, tr), true); } };
  const up = (p: Partial<ASys>) => cur && setCur({ ...cur, ...p });
  return (
    <div className="space-y-4" data-testid="asys">
      <Toast msg={msg} bad={bad} />
      <ModulePermsGlobal />
      <p className="text-xs opacity-70">Shaiq Muhammad System · {tr("Attainment & Progress Systems decide how the Assessment Tracker scores Success Criteria and grades students. Each system is named and versioned.", "تحدد الأنظمة كيفية احتساب الدرجات في متتبع التقييم.")}</p>
      <div className="flex flex-wrap gap-2" data-testid="asys-list">{(list || []).map((s) => <button key={s.id} type="button" onClick={() => setCur(s)} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${cur?.id === s.id ? "border-transparent bg-header text-sun" : "border-black/10 bg-white/80 dark:bg-white/10"}`} data-testid="asys-item">{s.name} <span className="text-xs opacity-70">v{s.version} · {s.active ? tr("active", "مفعّل") : tr("placeholder", "غير مفعّل")}{s.isDefault ? ` · ★ ${tr("default", "افتراضي")}` : ""}</span></button>)}<button type="button" className={btn} onClick={add} data-testid="asys-add">+ {tr("Add system", "إضافة نظام")}</button></div>
      {cur && <div className="grid gap-4 lg:grid-cols-2">
        <section className={cardCls + " space-y-2"}><h3 className="font-extrabold">{tr("System & scope", "النظام والنطاق")}</h3>
          <label className={lab}>{tr("Name", "الاسم")}<input className={field + " mt-1"} value={cur.name} onChange={(e) => up({ name: e.target.value })} data-testid="asys-name" /></label>
          <div className="grid grid-cols-3 gap-2"><label className={lab}>{tr("Version", "الإصدار")}<input className={field + " mt-1"} value={cur.version} onChange={(e) => up({ version: e.target.value })} /></label>
            <label className={lab}>{tr("Phase", "المرحلة")}<input className={field + " mt-1"} value={cur.scope.phase} onChange={(e) => up({ scope: { ...cur.scope, phase: e.target.value } })} /></label>
            <label className={lab}>{tr("Subject", "المادة")}<input className={field + " mt-1"} value={cur.scope.subject} onChange={(e) => up({ scope: { ...cur.scope, subject: e.target.value } })} /></label></div>
          <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={cur.active} onChange={(e) => up({ active: e.target.checked })} data-testid="asys-active" /> {tr("Active", "مفعّل")}</label>
            {cur.isDefault ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" data-testid="asys-is-default">★ {tr(`Default for ${cur.scope.phase || "its phase"}`, `الافتراضي لمرحلة ${cur.scope.phase}`)}</span>
              : <button type="button" className={btn} onClick={async () => { try { await trk("asys-save", { system: { id: cur.id, isDefault: true, active: true } }); note(tr("Set as default.", "تم التعيين كافتراضي.")); void load(); } catch (e) { note(modErr(e, tr), true); } }} data-testid="asys-set-default">★ {tr("Set as default", "تعيين كافتراضي")}</button>}</div>
          <p className="text-[11px] opacity-70">{tr("One default per phase. The Assessment Tracker, Department Report and all exports use the default unless another system is chosen.", "نظام افتراضي واحد لكل مرحلة؛ يُستخدم في المتتبع والتقرير والتصدير ما لم يُختر غيره.")}</p>
          <div><p className={lab}>{tr("Year groups", "السنوات")}</p><div className="mt-1 flex flex-wrap gap-2 text-sm">{YEARS.map((y) => <label key={y} className="flex items-center gap-1"><input type="checkbox" checked={cur.scope.years.includes(y)} onChange={(e) => up({ scope: { ...cur.scope, years: e.target.checked ? [...cur.scope.years, y] : cur.scope.years.filter((x) => x !== y) } })} />{y}</label>)}</div></div>
          <h3 className="pt-2 font-extrabold">{tr("Permissions (global — per-teacher in Teachers › Permissions)", "الصلاحيات العامة")}</h3>
          <div className="grid grid-cols-2 gap-1 text-sm" data-testid="asys-access">{TRK_KEYS.map((k) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={cur.access[k]} onChange={(e) => up({ access: { ...cur.access, [k]: e.target.checked } })} data-testid={`asys-acc-${k}`} /> {tr(...KEYN[k])}</label>)}</div>
        </section>
        <section className={cardCls + " space-y-2"}><h3 className="font-extrabold">{tr("Success Criteria scale 0–3 & key", "مقياس معايير النجاح والمفتاح")}</h3>
          <div className="grid grid-cols-2 gap-2">{cur.scale.map((x, i) => <label key={i} className={lab}>{i}<input className={field + " mt-1"} value={x.label} onChange={(e) => up({ scale: cur.scale.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} /></label>)}</div>
          <label className={lab}>{tr("Key text (shown under the tracker and in the Excel)", "نص المفتاح")}<textarea className={field + " mt-1 min-h-40 font-mono text-xs"} value={cur.key} onChange={(e) => up({ key: e.target.value })} data-testid="asys-key" /></label>
        </section>
        <section className={cardCls + " space-y-2"}><h3 className="font-extrabold">{tr("Auto-fill rules", "قواعد التعبئة التلقائية")}</h3>
          <p className="text-xs opacity-70">{tr("% on the questions tagged to a criterion → 0–3:", "النسبة ← 0–3:")} &lt;{cur.cut[0]} = 0 · {cur.cut[0]}–{cur.cut[1] - 1} = 1 · {cur.cut[1]}–{cur.cut[2] - 1} = 2 · {cur.cut[2]}+ = 3</p>
          <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((v, i) => <label key={v} className={lab}>{`${v} ${tr("from %", "من %")}`}<input type="number" className={field + " mt-1"} value={cur.cut[i]} onChange={(e) => { const c = [...cur.cut] as [number, number, number]; c[i] = Number(e.target.value); up({ cut: c }); }} data-testid={`asys-cut-${v}`} /></label>)}</div>
          <p className={lab}>{tr("Quran homework grade → score (blank = not submitted)", "درجة واجب القرآن ← الدرجة")}</p>
          <div className="grid grid-cols-3 gap-2">{(["red", "yellow", "green"] as const).map((k) => <label key={k} className={lab}>{k}<select className={field + " mt-1"} value={cur.quran[k]} onChange={(e) => up({ quran: { ...cur.quran, [k]: e.target.value } })}>{["", "0", "1", "2", "3"].map((v) => <option key={v} value={v}>{v || "—"}</option>)}</select></label>)}</div>
          <label className={lab}>{tr("Re-submitted weekly assessment: which attempt counts", "عند إعادة التسليم: أي محاولة تُحتسب")}<select className={field + " mt-1"} value={cur.resub} onChange={(e) => up({ resub: e.target.value as ASys["resub"] })} data-testid="asys-resub"><option value="latest">{tr("Latest attempt (default)", "آخر محاولة (افتراضي)")}</option><option value="best">{tr("Best attempt", "أفضل محاولة")}</option><option value="first">{tr("First attempt", "أول محاولة")}</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.untagged} onChange={(e) => up({ untagged: e.target.checked })} data-testid="asys-untagged" /> {tr("Untagged weekly assessment: give its overall % to every SC of the unit (flagged Q*)", "تقييم غير موسوم: تُعطى النسبة الكلية لكل معايير الوحدة (مع علامة Q*)")}</label>
          <p className="text-[11px] opacity-70">{tr("Scores are written from the server the moment a student submits. Teacher overrides are never overwritten.", "تُكتب الدرجات فور التسليم، ولا تُستبدل تعديلات المعلم أبدًا.")}</p>
          <label className={lab}>{tr("Quran criteria (pattern matched against the SC text)", "معايير القرآن (نمط)")}<input className={field + " mt-1"} value={cur.quranPattern} onChange={(e) => up({ quranPattern: e.target.value })} /></label>
        </section>
        <section className={cardCls + " space-y-2"}><h3 className="font-extrabold">{tr("Average → Attainment Grade", "المتوسط ← درجة التحصيل")}</h3>
          <div className="grid grid-cols-7 gap-1">{cur.bands.map((b, i) => <label key={i} className={lab}>{`≤ ${tr("for", "لـ")} ${i + 1}`}<input type="number" step="0.1" className={field + " mt-1 !px-1"} value={b} onChange={(e) => up({ bands: cur.bands.map((x, j) => (j === i ? Number(e.target.value) : x)) })} data-testid={`asys-band-${i + 1}`} /></label>)}</div>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={cur.capTarget} onChange={(e) => up({ capTarget: e.target.checked })} data-testid="asys-cap" /> {tr("Cap the grade at Target − 1 (as in the department tracker)", "حد أقصى = الهدف − 1")}</label>
          <label className={lab}>{tr("Classes without the cap (their department files use the plain formula)", "صفوف بدون الحد")}<input className={field + " mt-1"} value={(cur.capExempt || []).join(", ")} onChange={(e) => up({ capExempt: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} data-testid="asys-capexempt" /></label>
          <div data-testid="asys-target-rules"><p className={lab}>{tr("Target rules by year or phase (year rule wins over phase rule)", "قواعد الهدف حسب السنة أو المرحلة")}</p>
            {Object.entries(cur.targetRules || {}).map(([k, r]) => <div key={k} className="mt-1 flex flex-wrap items-center gap-1 text-sm" data-testid="asys-target-rule"><b className="w-20">{k}</b>
              <select className={field + " !w-56"} value={r.mode} onChange={(e) => up({ targetRules: { ...cur.targetRules, [k]: { ...r, mode: e.target.value as "profile" } } })} data-testid="asys-rule-mode"><option value="profile">{tr("Profile / import (scaled score if none)", "الملف / الاستيراد")}</option><option value="fixed">{tr("Same Target for every student", "هدف واحد لكل الطلاب")}</option><option value="teacher">{tr("Teacher judgment (picked in the tracker, 1–7)", "تقدير المعلم (1–7)")}</option></select>
              {r.mode === "fixed" && <input className={field + " !w-14"} value={r.value || ""} onChange={(e) => up({ targetRules: { ...cur.targetRules, [k]: { ...r, value: e.target.value.replace(/\D/g, "").slice(0, 1) } } })} data-testid="asys-rule-value" />}
              <button type="button" className="text-xs text-rose-700" onClick={() => { const n = { ...cur.targetRules }; delete n[k]; up({ targetRules: n }); }}>✕</button></div>)}
            <select className={field + " mt-1 !w-48"} value="" onChange={(e) => e.target.value && up({ targetRules: { ...(cur.targetRules || {}), [e.target.value]: { mode: "profile" } } })} data-testid="asys-rule-add"><option value="">+ {tr("Add rule for…", "إضافة قاعدة لـ…")}</option>{[cur.scope.phase, ...YEARS].filter((y) => y && !(cur.targetRules || {})[y]).map((y) => <option key={y}>{y}</option>)}</select></div>
          <label className={lab}>{tr("Threshold summary categories (e.g. 4, 5)", "فئات الملخص")}<input className={field + " mt-1"} value={cur.thresholds.join(", ")} onChange={(e) => up({ thresholds: e.target.value.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 9) })} data-testid="asys-thr" /></label>
          <p className={lab}>{tr("Target from scaled score (only students with no Target)", "الهدف من الدرجة المعيارية")}</p>
          {cur.scaled.map((r, i) => <div key={i} className="flex items-center gap-1 text-sm"><input type="number" className={field + " !w-20"} value={r[0]} onChange={(e) => up({ scaled: cur.scaled.map((x, j) => (j === i ? [Number(e.target.value), x[1], x[2]] : x)) })} />–<input type="number" className={field + " !w-20"} value={r[1]} onChange={(e) => up({ scaled: cur.scaled.map((x, j) => (j === i ? [x[0], Number(e.target.value), x[2]] : x)) })} />→<input type="number" className={field + " !w-16"} value={r[2]} onChange={(e) => up({ scaled: cur.scaled.map((x, j) => (j === i ? [x[0], x[1], Number(e.target.value)] : x)) })} /></div>)}
          <p className={lab}>{tr("iSAMS lists (exact spacing kept)", "قوائم iSAMS")}</p>
          <p className={lab}>{tr("Effort Grade from attainment (a teacher's choice overrides it)", "درجة الجهد من التحصيل (اختيار المعلم يتقدّم عليها)")}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2" data-testid="asys-effort-map">{["7", "6", "5", "4", "3", "2", "1"].map((k) => <label key={k} className="flex items-center gap-1 text-sm"><b className="w-5">{k}</b><select className={field + " !w-40"} value={(cur.effortMap || {})[k] ?? ""} onChange={(e) => up({ effortMap: { ...(cur.effortMap || {}), [k]: e.target.value } })} data-testid={`asys-effort-${k}`}><option value="">—</option>{cur.effort.map((v) => <option key={JSON.stringify(v)} value={v}>{v.trim() ? v : tr("(blank)", "(فارغ)")}</option>)}</select></label>)}</div>
          <p className="break-words text-xs" data-testid="asys-effort">{tr("Effort", "الجهد")}: {cur.effort.map(show).join(", ")}</p>
          <p className="break-words text-xs">{tr("Target", "الهدف")}: {cur.targetList.map(show).join(", ")} · {tr("Attainment", "التحصيل")}: {cur.attainList.map(show).join(", ")}</p>
        </section>
        <div className="flex gap-2 lg:col-span-2"><button type="button" className={btnCta} onClick={save} data-testid="asys-save">{tr("Save system", "حفظ النظام")}</button>{cur.updated && <span className="self-center text-xs opacity-60">{tr("Last saved", "آخر حفظ")}: {new Date(cur.updated).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} (Dubai) · {cur.by}</span>}</div>
      </div>}
      <RepView note={note} />
      <TargetImport note={note} />
      <IsamsTemplates note={note} />
    </div>
  );
}

type ImpRow = { row: number; name: string; student?: string; target?: string; how?: string; error?: string };
function TargetImport({ note }: { note: (m: string, b?: boolean) => void }) {
  const { tr } = useTr();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [res, setRes] = useState<{ applied: boolean; rows: ImpRow[] } | null>(null);
  const read = async (f: File) => {
    try {
      const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
      const out: Record<string, unknown>[] = [];
      for (const ws of wb.worksheets) {
        let hr = 0, head: string[] = [];
        for (let r = 1; r <= Math.min(30, ws.rowCount); r++) { const v = (ws.getRow(r).values as unknown[]).slice(1).map((x) => String((x as { text?: string })?.text ?? x ?? "").trim().toLowerCase()); if (v.some((x) => /target|scaled/.test(x)) && v.some((x) => /name|surname|forename|username|schoolid/.test(x))) { hr = r; head = v; break; } }
        if (!hr) continue;
        const ix = (re: RegExp) => head.findIndex((h) => re.test(h));
        const c = { sid: ix(/^schoolid$/), sur: ix(/^surname|last/), fore: ix(/^forename|first/), name: ix(/^(student )?name$|^pupil/), un: ix(/username/), cls: ix(/^(year|class|form)/), tgt: ix(/target/), sc: ix(/scaled/) };
        const yrFromSheet = /(\d+)/.exec(ws.name)?.[1];
        for (let r = hr + 1; r <= ws.rowCount; r++) {
          const v = (ws.getRow(r).values as unknown[]).slice(1).map((x) => (x && typeof x === "object" && "result" in (x as object) ? (x as { result: unknown }).result : x && typeof x === "object" && "text" in (x as object) ? (x as { text: unknown }).text : x));
          const g = (i: number) => (i >= 0 ? String(v[i] ?? "").trim() : "");
          if (!g(c.sur) && !g(c.name) && !g(c.un) && !g(c.sid)) continue;
          out.push({ schoolId: g(c.sid), first: g(c.fore), last: g(c.sur), name: g(c.name), username: g(c.un), cls: g(c.cls) || (yrFromSheet ? `Year ${yrFromSheet}` : ""), target: g(c.tgt).replace(/^NA$/i, ""), scaled: g(c.sc) });
        }
      }
      setRows(out); setRes(null);
      const r = await trk<{ applied: boolean; rows: ImpRow[] }>("trk-targets-import", { rows: out, apply: false }); setRes(r);
    } catch (e) { note(modErr(e, tr), true); }
  };
  const apply = async () => { if (!rows) return; try { const r = await trk<{ applied: boolean; rows: ImpRow[] }>("trk-targets-import", { rows, apply: true }); setRes(r); note(tr("Targets imported.", "تم استيراد الأهداف.")); } catch (e) { note(modErr(e, tr), true); } };
  const ok = res?.rows.filter((r) => !r.error) || [], badR = res?.rows.filter((r) => r.error) || [];
  return (
    <section className={cardCls + " space-y-2"} data-testid="trk-import">
      <h3 className="font-extrabold">🎯 {tr("Target import (Excel)", "استيراد الأهداف (Excel)")}</h3>
      <p className="text-xs opacity-70">{tr("Columns found automatically: SchoolID, Surname, Forename (or Name / Username), Year, Target (Grade), Scaled score. A Target is kept exactly; a row with only a scaled score gets the Target from the scaled-score criteria. Preview first, then apply.", "الأعمدة تُكتشف تلقائيًا. الهدف يُحفظ كما هو؛ والدرجة المعيارية تُستخدم فقط عند عدم وجود هدف.")}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => file.current?.click()} data-testid="trk-import-btn">⬆ {tr("Choose Target file", "اختر ملف الأهداف")}</button><input ref={file} type="file" accept=".xlsx" hidden data-testid="trk-import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
        {res && !res.applied && ok.length > 0 && <button type="button" className={btnCta} onClick={apply} data-testid="trk-import-apply">{tr(`Apply ${ok.length} rows`, `تطبيق ${ok.length}`)}</button>}</div>
      {res && <div className="text-sm" data-testid="trk-import-result"><p><b>{res.applied ? tr("Applied", "تم التطبيق") : tr("Preview", "معاينة")}</b>: {ok.length} {tr("matched", "مطابق")} · {badR.length} {tr("not applied", "غير مطبق")}</p>
        {!!badR.length && <ul className="mt-1 max-h-40 overflow-auto text-xs text-rose-800">{badR.map((r) => <li key={r.row}>{tr("Row", "صف")} {r.row}: {r.name} — {r.error}</li>)}</ul>}
        {!!ok.length && <details className="mt-1 text-xs"><summary className="cursor-pointer">{tr("Matched rows", "الصفوف المطابقة")}</summary><ul className="max-h-48 overflow-auto">{ok.map((r) => <li key={r.row}>{r.name} → {r.student}: {r.target || "—"} {r.how ? `(${r.how})` : ""}</li>)}</ul></details>}</div>}
    </section>
  );
}

function IsamsTemplates({ note }: { note: (m: string, b?: boolean) => void }) {
  const { tr } = useTr();
  const [items, setItems] = useState<{ cycle: string; name: string; term: string; at: number; size: number }[]>([]);
  const [cycle, setCycle] = useState(""); const [term, setTerm] = useState("Term 1");
  const file = useRef<HTMLInputElement>(null);
  const load = () => trk<{ items: typeof items }>("isams-tpl-list", {}).then((r) => setItems(r.items)).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);
  const upload = async (f: File) => {
    try {
      const data = await fileToB64(f);
      const c = cycle.trim() || f.name.replace(/\.xlsx$/i, "");
      await trk("isams-tpl-save", { cycle: c, name: f.name, term, data }); note(tr("Template saved.", "تم حفظ القالب.")); setCycle(""); void load();
    } catch (e) { note(modErr(e, tr), true); }
  };
  return (
    <section className={cardCls + " space-y-2"} data-testid="isams-tpls">
      <h3 className="font-extrabold">📄 {tr("iSAMS report templates (one per report cycle)", "قوالب تقارير iSAMS")}</h3>
      <p className="text-xs opacity-70">{tr("Upload the blank iSAMS report file downloaded from iSAMS. The Assessment Tracker fills Target, Effort and Attainment Grade for each pupil and keeps every sheet, hidden row/column, ID and validation list exactly as iSAMS made it.", "ارفع ملف iSAMS الفارغ لكل دورة؛ يملأ النظام الهدف والجهد والتحصيل ويحافظ على باقي الملف كما هو.")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className={lab}>{tr("Report cycle name", "اسم الدورة")}<input className={field + " mt-1 !w-64"} value={cycle} placeholder="26-27 PS Progress Report Term1(PC1)" onChange={(e) => setCycle(e.target.value)} data-testid="isams-cycle" /></label>
        <label className={lab}>{tr("Term", "الفصل")}<select className={field + " mt-1 !w-32"} value={term} onChange={(e) => setTerm(e.target.value)}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <button type="button" className={btn} onClick={() => file.current?.click()} data-testid="isams-upload">⬆ {tr("Upload template", "رفع القالب")}</button><input ref={file} type="file" accept=".xlsx" hidden data-testid="isams-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      </div>
      <ul className="text-sm">{items.map((t) => <li key={t.cycle} className="flex items-center gap-2 border-t border-black/5 py-1" data-testid="isams-tpl"><b>{t.cycle}</b><span className="text-xs opacity-70">{t.term} · {t.name} · {Math.round(t.size * 0.75 / 1024)} KB · {new Date(t.at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}</span><button type="button" className="ms-auto text-xs text-rose-700" onClick={async () => { if (confirm(tr("Delete this template?", "حذف القالب؟"))) { await trk("isams-tpl-delete", { cycle: t.cycle }); void load(); } }}>🗑</button></li>)}</ul>
    </section>
  );
}

function RepView({ note }: { note: (m: string, b?: boolean) => void }) {
  const { tr } = useTr();
  const [v, setV] = useState("");
  useEffect(() => { trk<{ repView: string }>("asys-list", {}).then((r) => setV(r.repView || "tracker")).catch(() => undefined); }, []);
  const save = async (x: string) => { setV(x); try { await trk("asys-save", { repView: x }); note(tr("Saved.", "تم الحفظ.")); } catch (e) { note(modErr(e, tr), true); } };
  return (
    <section className={cardCls + " space-y-2"} data-testid="asys-repview">
      <h3 className="font-extrabold">📈 {tr("Department Report — default view", "تقرير القسم — العرض الافتراضي")}</h3>
      <LinkDefault note={note} />
      <div className="flex flex-wrap gap-4 text-sm">{([["tracker", tr("Tracker attainment grades & progress", "درجات التحصيل والتقدم من المتتبع")], ["percent", tr("Old % view (quizzes & homework)", "عرض النسب القديم")]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="radio" name="repview" checked={v === k} onChange={() => save(k)} data-testid={`asys-repview-${k}`} /> {l}</label>)}</div>
    </section>
  );
}

function LinkDefault({ note }: { note: (m: string, b?: boolean) => void }) {
  const { tr } = useTr();
  const [v, setV] = useState("");
  useEffect(() => { trk<{ default: string }>("trk-link-get", { ids: [] }).then((r) => setV(r.default)).catch(() => undefined); }, []);
  const save = async (x: string) => { setV(x); try { await trk("trk-link-set", { default: x }); note(tr("Saved.", "تم الحفظ.")); } catch (e) { note(modErr(e, tr), true); } };
  return (
    <div className="rounded-xl bg-black/[0.03] p-2 text-sm dark:bg-white/5" data-testid="trk-link-default">
      <b>{tr("New assessments & Quran homework — 'Link to Assessment Tracker' default", "الافتراضي للتقييمات الجديدة: الربط بالمتتبع")}</b>
      <div className="mt-1 flex gap-4">{([["off", tr("Practice (OFF)", "تدريب (إيقاف)")], ["on", tr("Linked (ON)", "مرتبط (تشغيل)")]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="radio" name="trklinkdef" checked={v === k} onChange={() => save(k)} data-testid={`trk-link-default-${k}`} /> {l}</label>)}</div>
      <p className="text-[11px] opacity-70">{tr("Existing end-of-topic assessments linked to curriculum units stay ON. Teachers with tracker Add/Edit can switch each one.", "التقييمات الحالية المرتبطة بالوحدات تبقى مفعّلة.")}</p>
    </div>
  );
}
