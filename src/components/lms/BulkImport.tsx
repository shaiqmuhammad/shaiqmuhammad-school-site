"use client";
import { useMemo, useState } from "react";
import { lmsApi, type Catalog, type LmsUser } from "@/lib/lms";

type Field = "surname" | "forename" | "fullname" | "dob" | "year" | "cls" | "form" | "house" | "gender";
const FIELDS: { k: Field; label: string; re: RegExp }[] = [
  { k: "surname", label: "Surname", re: /^(sur\s*name|last\s*name|family(\s*name)?|legal\s*surname)/i },
  { k: "forename", label: "Forename", re: /^(fore\s*name|first\s*name|given(\s*name)?|preferred\s*name|legal\s*forename)/i },
  { k: "fullname", label: "Full name", re: /^(full\s*name|pupil(\s*name)?|student(\s*name)?|name)$/i },
  { k: "dob", label: "Date of Birth", re: /(date\s*of\s*birth|^d\.?o\.?b|birth\s*date|birthday)/i },
  { k: "year", label: "Year Group", re: /^(year(\s*group)?|grade|yr|ncy)/i },
  { k: "cls", label: "Class", re: /^class(\s*name)?$/i },
  { k: "form", label: "Form / Section", re: /^(form|section|reg(istration)?(\s*group)?|tutor\s*group|division|homeroom)/i },
  { k: "house", label: "House", re: /^house/i },
  { k: "gender", label: "Gender", re: /^(gender|sex)/i },
];
const autoField = (h: string): Field | "" => FIELDS.find((F) => F.re.test(h.trim()))?.k || "";
const MEM = "sm-bi-map-v1";
const loadMem = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(MEM) || "{}"); } catch { return {}; } };
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n: number | string) => String(n).padStart(2, "0");
export function isoDob(v: unknown): string {
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  const s = String(v ?? "").replace(/\(.*?\)/g, "").trim();
  let m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3})[A-Za-z]*[-\s/.](\d{4})/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  return "";
}
const N = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

type Sheet = { name: string; grid: unknown[][]; hi: number };
type Out = { i: number; surname: string; forename: string; dob: string; form: string; year: string; gender: string; cls: string; section: string; status: "ok" | "unmatched" | "dup-system" | "dup-file" };

async function readBook(f: File): Promise<Sheet[]> {
  const X = await import("xlsx");
  const wb = X.read(await f.arrayBuffer(), { cellDates: true });
  return wb.SheetNames.map((n) => {
    const grid = X.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "", raw: false });
    let hi = grid.slice(0, 30).findIndex((r) => r.filter((v) => autoField(String(v))).length >= 2);
    if (hi < 0) hi = Math.max(0, grid.findIndex((r) => r.filter((v) => String(v).trim()).length >= 2));
    return { name: n, grid, hi };
  }).filter((s) => s.grid.length);
}
const hdrs = (s: Sheet) => (s.grid[s.hi] || []).map((v) => String(v).trim());

export default function BulkImport({ catalog, onSaveRows, tr }: { catalog: Catalog | null; onSaveRows: (rows: Partial<LmsUser>[]) => Promise<unknown>; tr: (en: string, ar: string) => string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [pick, setPick] = useState<string>("all");
  const [cmap, setCmap] = useState<Record<string, Field | "">>({});
  const [fCls, setFCls] = useState(""), [fSec, setFSec] = useState(""), [mode, setMode] = useState<"fallback" | "all">("fallback");
  const [all, setAll] = useState<LmsUser[] | null>(null);
  const [phase, setPhase] = useState(""), [dept, setDept] = useState(""), [subject, setSubject] = useState(""), [teacher, setTeacher] = useState("");
  const [fix, setFix] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [summary, setSummary] = useState<{ added: number; dup: number; unmatched: number; failed: number } | null>(null);
  const cat = catalog;
  const active = useMemo(() => (sheets || []).filter((x, i) => pick === "all" || String(i) === pick), [sheets, pick]);
  const headers = useMemo(() => [...new Set(active.flatMap(hdrs).filter(Boolean))], [active]);
  const setHi = (i: number, hi: number) => setSheets((ss) => ss && ss.map((x, j) => (j === i ? { ...x, hi: Math.max(0, hi) } : x)));
  const remap = (h: string, f: Field | "") => { const n = { ...cmap, [h]: f }; setCmap(n); try { localStorage.setItem(MEM, JSON.stringify({ ...loadMem(), [h.toLowerCase()]: f })); } catch { /* */ } };
  const secOpts = useMemo(() => (cat?.sections || []).map((s) => ({ v: `${s.cls}|${s.name}`, cls: s.cls, name: s.name })), [cat]);

  async function onFile(f: File) {
    setErr(""); setSummary(null); setFix({});
    try {
      const sh = await readBook(f);
      if (!sh.length) { setErr(tr("The file is empty.", "الملف فارغ.")); return; }
      const mem = loadMem(); const m: Record<string, Field | ""> = {};
      for (const h of new Set(sh.flatMap(hdrs).filter(Boolean))) m[h] = (h.toLowerCase() in mem ? mem[h.toLowerCase()] : autoField(h)) as Field | "";
      setCmap(m); setSheets(sh); setPick("all");
      if (!all) { const r = await lmsApi.users(true); setAll(r.users); }
    } catch { setErr(tr("That file couldn't be read.", "تعذّرت قراءة الملف.")); }
  }

  const matchSec = (year: string, form: string, clsCol = ""): { cls: string; section: string } | null => {
    if (!cat) return null;
    if (clsCol) { const c = cat.classes.find((x) => N(x.name) === N(clsCol)) || cat.classes.find((x) => { const d = x.name.match(/\d+/); return d && N(clsCol).replace(/\D/g, "") === d[0] && !/[a-z]$/.test(N(clsCol).replace(/^(year|grade|class)/, "")); });
      if (c) { if (!form) return { cls: c.name, section: "" }; const sct = cat.sections.find((x) => x.cls === c.name && (N(x.name) === N(form) || N(x.name) === N(c.name.replace(/\D/g, "") + form))); return sct ? { cls: c.name, section: sct.name } : null; }
      if (!form) form = clsCol; }
    const f = N(form), y = String(year).trim();
    const yr = (cls: string) => { if (!y) return true; const n = Number(y); if (n === 0 || /^(fs|r|k)/i.test(y)) return /^(fs|eyfs|foundation|reception|kg)/i.test(cls); const d = cls.match(/\d+/); return d ? Number(d[0]) === n : N(cls) === N(y); };
    if (f) { const s = cat.sections.find((x) => N(x.name) === f && yr(x.cls)) || cat.sections.find((x) => N(x.name) === f); return s ? { cls: s.cls, section: s.name } : null; }
    return null;
  };

  const rows: Out[] = useMemo(() => {
    if (!sheets) return [];
    const res: Out[] = []; const seen = new Set<string>();
    const stu = (all || []).filter((u) => u.role === "student");
    let i = 0;
    for (const s of active) {
      const H = hdrs(s);
      const col = (k: Field) => H.findIndex((h) => h && cmap[h] === k);
      const g = (r: unknown[], k: Field) => { const c = col(k); return c < 0 ? "" : String(r[c] ?? "").trim(); };
      for (const r of s.grid.slice(s.hi + 1)) {
        let surname = g(r, "surname"), forename = g(r, "forename");
        const full = g(r, "fullname");
        if (full && (!surname || !forename)) { const pp = full.includes(",") ? full.split(",").map((x) => x.trim()).reverse() : full.split(/\s+/); if (full.includes(",")) { forename ||= pp[0]; surname ||= pp.slice(1).join(" "); } else { forename ||= pp[0]; surname ||= pp.slice(1).join(" "); } }
        if (!surname || !forename) continue;
        i++;
        const dob = isoDob(col("dob") < 0 ? "" : r[col("dob")]);
        const form = g(r, "form"), year = g(r, "year");
        const gr = g(r, "gender").toUpperCase();
        const fb = fCls ? { cls: fCls, section: fSec } : null;
        const fx = fix[i]; const m = fx ? { cls: fx.split("|")[0], section: fx.split("|")[1] } : mode === "all" && fb ? fb : (matchSec(year, form, g(r, "cls")) || (!form && !year && !g(r, "cls") ? fb : null));
        const nm = N(forename) + N(surname);
        const key = nm + "|" + (dob || m?.section || "");
        let status: Out["status"] = m ? "ok" : "unmatched";
        if (seen.has(key)) status = "dup-file";
        else if (stu.some((u) => (N((u.firstName || "") + (u.lastName || "")) === nm || N(u.name) === nm) && (dob && u.dob ? u.dob === dob : !!m && u.cls === m.cls && u.section === m.section))) status = "dup-system";
        seen.add(key);
        res.push({ i, surname, forename, dob, form, year, gender: gr.startsWith("M") || gr.startsWith("B") ? "b" : gr.startsWith("F") || gr.startsWith("G") ? "g" : "", cls: m?.cls || "", section: m?.section || "", status });
      }
    }
    return res;
  }, [active, cmap, all, fix, cat, fCls, fSec, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (s: Out["status"]) => rows.filter((r) => r.status === s).length;
  const phases = cat?.phases || [];
  const ph = phases.find((p) => p.name === phase);
  const depts = (cat?.depts || []).filter((d) => !ph || d.phaseId === ph.id);
  const dp = depts.find((d) => d.name === dept);
  const subs = (cat?.subjects || []).filter((s) => !dp || s.deptId === dp.id);
  const teachers = (all || []).filter((u) => u.role === "teacher" && !u.disabled).sort((a, b) => a.name.localeCompare(b.name));

  async function doImport() {
    const ok = rows.filter((r) => r.status === "ok");
    const taken = new Set((all || []).map((u) => u.username));
    const out = ok.map((r) => {
      const base = `${slug(r.forename.split(/\s+/)[0]) || "pupil"}.${slug(r.surname.split(/\s+/).pop() || "") || "x"}`.slice(0, 36);
      let u = base, n = 1; while (taken.has(u)) u = `${base}${++n}`; taken.add(u);
      return { username: u, name: `${r.forename} ${r.surname}`, firstName: r.forename, lastName: r.surname, role: "student" as const, cls: r.cls, section: r.section, dob: r.dob, gender: r.gender, ...(subject ? { subject, subjects: [subject] } : {}), ...(phase ? { phase } : {}) };
    });
    setBusy("…");
    let failed = 0;
    try { const r = (await onSaveRows(out)) as { failed?: number } | undefined; failed = r?.failed || 0; } catch { failed = out.length; }
    if (teacher && out.length) {
      const t = teachers.find((x) => x.id === teacher);
      if (t) {
        const add = [...new Set(out.map((o) => `${o.cls}|${o.section}`))].filter((tok) => !t.scope.includes(tok) && !t.scope.includes(tok.split("|")[0]));
        const subj = subject && !t.subjects.includes(subject) ? [...t.subjects, subject] : t.subjects;
        if (add.length || subj !== t.subjects) { try { await lmsApi.saveUsers([{ ...t, scope: [...t.scope, ...add], subjects: subj }], true); } catch { setErr(tr("Pupils added, but the teacher's classes couldn't be updated.", "أضيف الطلاب لكن تعذّر تحديث صفوف المعلم.")); } }
      }
    }
    setBusy(""); setSummary({ added: out.length - failed, dup: count("dup-system") + count("dup-file"), unmatched: count("unmatched"), failed }); setSheets(null); setAll(null);
  }

  const sel = "mt-1 w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm dark:border-white/20 dark:bg-[#132233]";
  const badge: Record<Out["status"], string> = { ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200", unmatched: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200", "dup-system": "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100", "dup-file": "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" };
  const lbl: Record<Out["status"], string> = { ok: tr("Will add", "سيضاف"), unmatched: tr("No class match", "لا يوجد صف مطابق"), "dup-system": tr("Already in system", "موجود مسبقًا"), "dup-file": tr("Duplicate in file", "مكرر في الملف") };

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-400/30 dark:bg-indigo-950/30" data-testid="bi-root">
      <h4 className="font-extrabold">{tr("Import pupils from a school Excel / CSV", "استيراد الطلاب من ملف المدرسة")}</h4>
      <p className="text-xs opacity-75">{tr("Any student list works: pick the sheet and header row, then say what each column is. Unknown columns are ignored. Pupils already in the system are skipped.", "يُقرأ كل الأوراق. يتم تخطي الطلاب الموجودين.")}</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-indigo-700">
        ⬆ {tr("Choose .xlsx / .xls / .csv", "اختر ملف")}
        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" data-testid="bi-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
      </label>
      {err && <p className="text-sm text-rose-700 dark:text-rose-300">{err}</p>}
      {summary && <p className="rounded-lg bg-emerald-100 p-2 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100" data-testid="bi-summary">✓ {tr(`Added ${summary.added} · skipped duplicates ${summary.dup} · unmatched ${summary.unmatched}${summary.failed ? ` · failed ${summary.failed}` : ""}`, `أضيف ${summary.added} · مكرر ${summary.dup} · غير مطابق ${summary.unmatched}`)}</p>}
      {sheets && (<>
        <div className="flex flex-wrap items-end gap-2 text-xs font-bold">
          <label>{tr("Sheet", "الورقة")}<select className={sel} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="bi-sheet"><option value="all">{tr(`All sheets (${sheets.length})`, "كل الأوراق")}</option>{sheets.map((x, i) => <option key={i} value={i}>{x.name}</option>)}</select></label>
          {sheets.map((x, i) => (pick === "all" ? i === 0 : String(i) === pick) && <label key={i}>{tr("Header row", "صف العناوين")}{pick === "all" && sheets.length > 1 ? ` (${x.name})` : ""}<input type="number" min={1} className={sel + " w-20"} value={x.hi + 1} onChange={(e) => setHi(i, Number(e.target.value) - 1)} data-testid="bi-hrow" /></label>)}
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-2" data-testid="bi-cols">
          <legend className="mb-1 text-sm font-bold">{tr("Columns found — tick to use, change what each one is", "الأعمدة الموجودة")}</legend>
          {headers.map((h) => (
            <div key={h} className="flex items-center gap-2 rounded-lg bg-white/80 p-1.5 text-sm dark:bg-white/5">
              <input type="checkbox" checked={!!cmap[h]} onChange={(e) => remap(h, e.target.checked ? autoField(h) || "fullname" : "")} aria-label={h} />
              <span className="min-w-0 flex-1 truncate font-semibold" title={h}>{h}</span>
              <select className={sel.replace("w-full", "w-40 shrink-0") + " mt-0"} value={cmap[h] || ""} onChange={(e) => remap(h, e.target.value as Field | "")} aria-label={h + " → field"}>
                <option value="">{tr("Ignore", "تجاهل")}</option>{FIELDS.map((F) => <option key={F.k} value={F.k}>{F.label}</option>)}
              </select>
            </div>
          ))}
          {!headers.length && <p className="text-sm opacity-70">{tr("No headers on that row — change the header row.", "لا توجد عناوين في هذا الصف.")}</p>}
          <p className="text-xs opacity-60 sm:col-span-2">{tr("House is read but not stored yet. Your choices are remembered for next time.", "يتم تذكر اختياراتك.")}</p>
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs font-bold">{tr("Phase", "المرحلة")}<select className={sel} value={phase} onChange={(e) => { setPhase(e.target.value); setDept(""); setSubject(""); }} data-testid="bi-phase"><option value="">—</option>{phases.map((p) => <option key={p.id}>{p.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Department", "القسم")}<select className={sel} value={dept} onChange={(e) => { setDept(e.target.value); setSubject(""); }} data-testid="bi-dept"><option value="">—</option>{depts.map((d) => <option key={d.id}>{d.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Subject", "المادة")}<select className={sel} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="bi-subject"><option value="">—</option>{subs.map((s) => <option key={s.id}>{s.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Teacher", "المعلم")}<select className={sel} value={teacher} onChange={(e) => setTeacher(e.target.value)} data-testid="bi-teacher"><option value="">—</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-bold">{tr("Class", "الصف")}<select className={sel} value={fCls} onChange={(e) => { setFCls(e.target.value); setFSec(""); }} data-testid="bi-cls"><option value="">—</option>{(cat?.classes || []).filter((c) => !ph || !c.phaseId || c.phaseId === ph.id).map((c) => <option key={c.id}>{c.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Section", "الشعبة")}<select className={sel} value={fSec} onChange={(e) => setFSec(e.target.value)} disabled={!fCls} data-testid="bi-sec"><option value="">—</option>{(cat?.sections || []).filter((x) => x.cls === fCls).map((x) => <option key={x.id}>{x.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Use the chosen class", "استخدام الصف المختار")}<select className={sel} value={mode} onChange={(e) => setMode(e.target.value as "fallback" | "all")} disabled={!fCls} data-testid="bi-mode"><option value="fallback">{tr("Only when the file has none", "فقط إن لم يوجد في الملف")}</option><option value="all">{tr("For all rows", "لكل الصفوف")}</option></select></label>
        </div>
        {teacher && <p className="text-xs opacity-70">{tr("The matched classes/sections (and subject) will be added to this teacher's assignment. Nothing is removed.", "ستُضاف الصفوف المطابقة إلى إسناد المعلم دون حذف شيء.")}</p>}
        <p className="text-sm font-semibold" data-testid="bi-counts">{rows.length} {tr("rows", "صف")} · <span className="text-emerald-700 dark:text-emerald-300">{count("ok")} {tr("to add", "للإضافة")}</span> · {count("dup-system") + count("dup-file")} {tr("duplicates", "مكرر")} · <span className="text-amber-700 dark:text-amber-300">{count("unmatched")} {tr("unmatched", "غير مطابق")}</span></p>
        <div className="max-h-80 overflow-auto rounded-xl border border-black/10 bg-white dark:border-white/15 dark:bg-[#0f1a26]">
          <table className="w-full text-xs sm:text-sm" data-testid="bi-preview">
            <thead className="sticky top-0 bg-slate-100 text-start dark:bg-slate-800"><tr><th className="p-1.5 text-start">{tr("Name", "الاسم")}</th><th className="p-1.5 text-start">DOB</th><th className="p-1.5 text-start">{tr("Year / Form", "السنة / الشعبة")}</th><th className="p-1.5 text-start">{tr("Class · Section", "الصف · الشعبة")}</th><th className="p-1.5 text-start">{tr("Status", "الحالة")}</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.i} className="border-t border-black/5 dark:border-white/10">
                <td className="p-1.5" dir="auto">{r.forename} {r.surname}</td><td className="p-1.5 whitespace-nowrap">{r.dob || "—"}</td><td className="p-1.5">{r.year || "—"} / {r.form || "—"}</td>
                <td className="p-1.5">{r.status === "unmatched" || fix[r.i] ? (
                  <select className={sel + " mt-0 min-w-[8rem]"} value={fix[r.i] || ""} onChange={(e) => setFix({ ...fix, [r.i]: e.target.value })} aria-label={tr("Pick class and section", "اختر الصف والشعبة")} data-testid="bi-fix"><option value="">{tr("Pick…", "اختر…")}</option>{secOpts.map((o) => <option key={o.v} value={o.v}>{o.cls} · {o.name}</option>)}</select>
                ) : r.cls ? `${r.cls} · ${r.section}` : "—"}</td>
                <td className="p-1.5"><span className={"rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap " + badge[r.status]}>{lbl[r.status]}</span></td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={!!busy || !count("ok")} onClick={() => void doImport()} data-testid="bi-import">{busy ? tr("Adding…", "جارٍ الإضافة…") : tr(`Add ${count("ok")} pupils`, `إضافة ${count("ok")} طالب`)}</button>
          <button type="button" className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20" onClick={() => { setSheets(null); setFix({}); }}>{tr("Cancel", "إلغاء")}</button>
        </div>
      </>)}
    </div>
  );
}
