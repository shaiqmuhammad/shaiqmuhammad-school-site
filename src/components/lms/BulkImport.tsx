"use client";
import { useMemo, useState } from "react";
import { lmsApi, type Catalog, type LmsUser } from "@/lib/lms";

type Field = "surname" | "forename" | "dob" | "form" | "year" | "house" | "gender";
const FIELDS: { k: Field; label: string; re: RegExp }[] = [
  { k: "surname", label: "Surname", re: /^(sur\s*name|last\s*name|family)/i },
  { k: "forename", label: "Forename", re: /^(fore\s*name|first\s*name|given)/i },
  { k: "dob", label: "Date of Birth", re: /(date\s*of\s*birth|^dob)/i },
  { k: "form", label: "Form", re: /^(form|section|reg)/i },
  { k: "year", label: "Year Group", re: /^(year|grade|class)/i },
  { k: "house", label: "House Code", re: /^house/i },
  { k: "gender", label: "Gender", re: /^(gender|sex)/i },
];
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

type Sheet = { headers: string[]; rows: unknown[][] };
type Out = { i: number; surname: string; forename: string; dob: string; form: string; year: string; gender: string; cls: string; section: string; status: "ok" | "unmatched" | "dup-system" | "dup-file" };

async function readBook(f: File): Promise<Sheet[]> {
  const X = await import("xlsx");
  const wb = X.read(await f.arrayBuffer(), { cellDates: true });
  const out: Sheet[] = [];
  for (const n of wb.SheetNames) {
    const a = X.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "", raw: false });
    const hi = a.findIndex((r) => r.filter((v) => FIELDS.some((F) => F.re.test(String(v).trim()))).length >= 2);
    if (hi < 0) continue;
    out.push({ headers: a[hi].map((v) => String(v).trim()), rows: a.slice(hi + 1) });
  }
  return out;
}

export default function BulkImport({ catalog, onSaveRows, tr }: { catalog: Catalog | null; onSaveRows: (rows: Partial<LmsUser>[]) => Promise<unknown>; tr: (en: string, ar: string) => string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [map, setMap] = useState<Record<Field, string>>({} as Record<Field, string>);
  const [use, setUse] = useState<Record<Field, boolean>>({ surname: true, forename: true, dob: true, form: true, year: true, house: true, gender: true });
  const [all, setAll] = useState<LmsUser[] | null>(null);
  const [phase, setPhase] = useState(""), [dept, setDept] = useState(""), [subject, setSubject] = useState(""), [teacher, setTeacher] = useState("");
  const [fix, setFix] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [summary, setSummary] = useState<{ added: number; dup: number; unmatched: number; failed: number } | null>(null);
  const cat = catalog;
  const headers = useMemo(() => [...new Set((sheets || []).flatMap((s) => s.headers).filter(Boolean))], [sheets]);
  const secOpts = useMemo(() => (cat?.sections || []).map((s) => ({ v: `${s.cls}|${s.name}`, cls: s.cls, name: s.name })), [cat]);

  async function onFile(f: File) {
    setErr(""); setSummary(null); setFix({});
    try {
      const sh = await readBook(f);
      if (!sh.length) { setErr(tr("No header row (Surname, Forename…) found.", "لم يتم العثور على صف العناوين.")); return; }
      const hs = [...new Set(sh.flatMap((s) => s.headers).filter(Boolean))];
      const m = {} as Record<Field, string>;
      for (const F of FIELDS) m[F.k] = hs.find((h) => F.re.test(h)) || "";
      setMap(m); setSheets(sh);
      if (!all) { const r = await lmsApi.users(true); setAll(r.users); }
    } catch { setErr(tr("That file couldn't be read.", "تعذّرت قراءة الملف.")); }
  }

  const matchSec = (year: string, form: string): { cls: string; section: string } | null => {
    if (!cat) return null;
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
    for (const s of sheets) {
      const col = (k: Field) => (use[k] && map[k] ? s.headers.indexOf(map[k]) : -1);
      const g = (r: unknown[], k: Field) => { const c = col(k); return c < 0 ? "" : String(r[c] ?? "").trim(); };
      for (const r of s.rows) {
        const surname = g(r, "surname"), forename = g(r, "forename");
        if (!surname || !forename) continue;
        i++;
        const dob = isoDob(col("dob") < 0 ? "" : r[col("dob")]);
        const form = g(r, "form"), year = g(r, "year");
        const gr = g(r, "gender").toUpperCase();
        const fx = fix[i]; const m = fx ? { cls: fx.split("|")[0], section: fx.split("|")[1] } : matchSec(year, form);
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
  }, [sheets, map, use, all, fix, cat]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <p className="text-xs opacity-75">{tr("Any sheet with Surname, Forename, Date of Birth, Form, Year Group… All sheets are read. Pupils already in the system are skipped.", "يُقرأ كل الأوراق. يتم تخطي الطلاب الموجودين.")}</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-indigo-700">
        ⬆ {tr("Choose .xlsx / .xls / .csv", "اختر ملف")}
        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" data-testid="bi-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
      </label>
      {err && <p className="text-sm text-rose-700 dark:text-rose-300">{err}</p>}
      {summary && <p className="rounded-lg bg-emerald-100 p-2 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100" data-testid="bi-summary">✓ {tr(`Added ${summary.added} · skipped duplicates ${summary.dup} · unmatched ${summary.unmatched}${summary.failed ? ` · failed ${summary.failed}` : ""}`, `أضيف ${summary.added} · مكرر ${summary.dup} · غير مطابق ${summary.unmatched}`)}</p>}
      {sheets && (<>
        <fieldset className="grid gap-2 sm:grid-cols-2" data-testid="bi-cols">
          <legend className="mb-1 text-sm font-bold">{tr("Columns found", "الأعمدة")}</legend>
          {FIELDS.map((F) => (
            <div key={F.k} className="flex items-center gap-2 rounded-lg bg-white/80 p-1.5 text-sm dark:bg-white/5">
              <input type="checkbox" checked={use[F.k]} onChange={(e) => setUse({ ...use, [F.k]: e.target.checked })} aria-label={F.label} />
              <span className="w-24 shrink-0 font-semibold">{F.label}{F.k === "house" ? " *" : ""}</span>
              <select className={sel + " mt-0"} value={map[F.k] || ""} onChange={(e) => setMap({ ...map, [F.k]: e.target.value })} aria-label={F.label + " column"}>
                <option value="">—</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          <p className="text-xs opacity-60 sm:col-span-2">* {tr("House code is shown but not stored (no house field yet).", "رمز البيت لا يُحفظ حاليًا.")}</p>
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs font-bold">{tr("Phase", "المرحلة")}<select className={sel} value={phase} onChange={(e) => { setPhase(e.target.value); setDept(""); setSubject(""); }} data-testid="bi-phase"><option value="">—</option>{phases.map((p) => <option key={p.id}>{p.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Department", "القسم")}<select className={sel} value={dept} onChange={(e) => { setDept(e.target.value); setSubject(""); }} data-testid="bi-dept"><option value="">—</option>{depts.map((d) => <option key={d.id}>{d.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Subject", "المادة")}<select className={sel} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="bi-subject"><option value="">—</option>{subs.map((s) => <option key={s.id}>{s.name}</option>)}</select></label>
          <label className="text-xs font-bold">{tr("Teacher", "المعلم")}<select className={sel} value={teacher} onChange={(e) => setTeacher(e.target.value)} data-testid="bi-teacher"><option value="">—</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
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
