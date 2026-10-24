"use client";

import { useEffect, useMemo, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { modCall, modErr } from "@/lib/lmsMods";
import { codeSkill, STD_DOMAINS, STD_OUTCOMES } from "@/lib/standards";

type Doc = { subject: string; name: string; lang: string; size: number };
const GRADES = ["K1", "K2", ...Array.from({ length: 12 }, (_, i) => `G${i + 1}`)];
const yearOf = (g: string) => (g === "K1" ? "KG1" : g === "K2" ? "Year 1 · KG2" : `Year ${Number(g.slice(1)) + 1} · Grade ${g.slice(1)}`);
const yearOfAr = (g: string) => (g === "K1" ? "روضة 1" : g === "K2" ? "Year 1 · روضة 2" : `Year ${Number(g.slice(1)) + 1} · الصف ${g.slice(1)}`);
const gradeOf = (code: string) => code.split(".").pop() || "";

/** t304: teachers' Standards smart book — structured UAE Islamic Education standards (searchable, by field and year) plus the uploaded original document. Islamic A reads in Arabic, Islamic B in English. */
export function StandardsBook() {
  const { tr, lang } = useTr();
  const { actor, ready } = useLmsActor();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [subject, setSubject] = useState("Islamic B");
  const [bookLang, setBookLang] = useState<"en" | "ar">("en");
  const [dom, setDom] = useState(0);
  const [grade, setGrade] = useState("");
  const [q, setQ] = useState("");
  const [pdf, setPdf] = useState("");
  const [msg, setMsg] = useState("");
  const staff = actor?.role === "teacher" || actor?.role === "admin";
  useEffect(() => { if (staff) modCall<{ items: Doc[] }>("std-doc-list", {}, actor?.role === "admin").then((r) => setDocs(r.items)).catch(() => undefined); }, [staff, actor]);
  const subjects = useMemo(() => [...new Set(["Islamic A", "Islamic B", ...docs.map((d) => d.subject)])], [docs]);
  const islamic = /^islamic/i.test(subject);
  const pick = (s: string) => { setSubject(s); setPdf(""); const d = docs.find((x) => x.subject === s); setBookLang(/ islamic a$|^islamic a$/i.test(s) || d?.lang === "ar" ? "ar" : "en"); };
  const list = useMemo(() => {
    if (!islamic) return [];
    const n = q.trim().toLowerCase();
    return Object.entries(STD_OUTCOMES).filter(([c, o]) => (!dom || codeSkill(c) === dom) && (!grade || gradeOf(c) === grade) && (!n || c.toLowerCase().includes(n) || o.en.toLowerCase().includes(n) || o.ar.includes(q.trim())))
      .sort(([a], [b]) => codeSkill(a) - codeSkill(b) || GRADES.indexOf(gradeOf(a)) - GRADES.indexOf(gradeOf(b)) || a.localeCompare(b, undefined, { numeric: true }));
  }, [islamic, dom, grade, q]);
  const openPdf = async () => {
    setMsg("");
    try {
      const r = await modCall<{ data: string; mime: string; name: string }>("std-doc-get", { subject }, actor?.role === "admin");
      const bin = atob(r.data); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      if (pdf) URL.revokeObjectURL(pdf);
      setPdf(URL.createObjectURL(new Blob([u8], { type: r.mime || "application/pdf" })));
    } catch (e) { setMsg(modErr(e, tr)); }
  };
  const doc = docs.find((d) => d.subject === subject);
  const ar = bookLang === "ar";
  const field = "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";
  if (ready && !staff) return <AssessmentShell title={tr("Standards book", "كتاب المعايير")} exitHref="/lms"><p className="p-8 text-center">{tr("Teachers only.", "للمعلمين فقط.")}</p></AssessmentShell>;
  return (
    <AssessmentShell title={tr("Standards book", "كتاب المعايير")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-3 py-5 sm:px-6" data-testid="std-book">
        <div className="rounded-3xl bg-gradient-to-br from-[#1d4a6e] to-header p-5 text-white">
          <h1 className="text-2xl font-extrabold !text-white">📘 {tr("Standards book", "كتاب المعايير")}</h1>
          <p className="text-sm text-white/80">{tr("Search the learning outcomes by field and year, or open the original document.", "ابحث في نواتج التعلم حسب المجال والسنة، أو افتح الوثيقة الأصلية.")}</p>
        </div>
        <div className="grid gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:grid-cols-2 lg:grid-cols-5 dark:bg-white/5">
          <label className="text-sm font-bold">{tr("Subject", "المادة")}<select className={field} value={subject} onChange={(e) => pick(e.target.value)} data-testid="std-subject">{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-sm font-bold">{tr("Field", "المجال")}<select className={field} value={dom} onChange={(e) => setDom(Number(e.target.value))} disabled={!islamic} data-testid="std-domain"><option value={0}>{tr("All fields", "كل المجالات")}</option>{STD_DOMAINS.map((d) => <option key={d.n} value={d.n}>{d.n}. {ar ? d.ar : d.en}</option>)}</select></label>
          <label className="text-sm font-bold">{tr("Year", "السنة")}<select className={field} value={grade} onChange={(e) => setGrade(e.target.value)} disabled={!islamic} data-testid="std-grade"><option value="">{tr("All years", "كل السنوات")}</option>{GRADES.map((g) => <option key={g} value={g}>{lang === "ar" ? yearOfAr(g) : yearOf(g)}</option>)}</select></label>
          <label className="text-sm font-bold">{tr("Search", "بحث")}<input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("word or code…", "كلمة أو رمز…")} disabled={!islamic} data-testid="std-search" /></label>
          <div className="flex items-end gap-2">
            <div className="flex overflow-hidden rounded-full ring-1 ring-black/15" role="group" aria-label={tr("Book language", "لغة الكتاب")}>{(["en", "ar"] as const).map((l) => <button key={l} type="button" aria-pressed={bookLang === l} className={`px-3 py-2 text-sm font-bold ${bookLang === l ? "bg-header text-sun" : ""}`} onClick={() => setBookLang(l)} data-testid={`std-lang-${l}`}>{l === "en" ? "English" : "عربي"}</button>)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc ? <button type="button" className="rounded-full bg-sun px-4 py-2 text-sm font-extrabold text-[#0b1b2b]" onClick={openPdf} data-testid="std-open-doc">📄 {tr("Open original document", "افتح الوثيقة الأصلية")} <span className="font-normal opacity-70" dir="auto">({doc.name}, {(doc.size / 1048576).toFixed(1)} MB)</span></button> : <span className="text-sm opacity-70" data-testid="std-no-doc">{tr("No document uploaded for this subject yet (Admin → Classes & subjects).", "لم تُرفع وثيقة لهذه المادة بعد (الإدارة ← الصفوف والمواد).")}</span>}
          {pdf && <button type="button" className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold" onClick={() => { URL.revokeObjectURL(pdf); setPdf(""); }}>✕ {tr("Close document", "إغلاق الوثيقة")}</button>}
          {islamic && <span className="ms-auto text-sm font-bold opacity-70" data-testid="std-count">{tr(`${list.length} outcomes`, `${list.length} ناتج تعلم`)}</span>}
        </div>
        {msg && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm text-rose-800">{msg}</p>}
        {pdf && <iframe src={pdf} title={doc?.name || "document"} className="h-[75dvh] w-full rounded-2xl border-0 bg-white ring-1 ring-black/10" data-testid="std-pdf" />}
        {!pdf && islamic && (
          <div className="space-y-4" dir={ar ? "rtl" : "ltr"} data-testid="std-list">
            {STD_DOMAINS.filter((d) => list.some(([c]) => codeSkill(c) === d.n)).map((d) => (
              <section key={d.n} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/5" data-testid="std-domain-sec">
                <h2 className="mb-2 text-lg font-extrabold">{d.n}. {ar ? d.ar : d.en}</h2>
                <ul className="divide-y divide-black/5 dark:divide-white/10">{list.filter(([c]) => codeSkill(c) === d.n).map(([c, o]) => (
                  <li key={c} className="flex gap-3 py-2 text-sm" data-testid="std-outcome"><span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 font-mono text-xs font-bold text-sky-900" dir="ltr">{c}</span><span className="flex-1" dir="auto">{(ar ? o.ar || o.en : o.en || o.ar)}</span><span className="shrink-0 text-xs opacity-60" dir="ltr">{ar ? `ص ${o.pAr}` : `p. ${o.p}`}</span></li>
                ))}</ul>
              </section>
            ))}
            {!list.length && <p className="py-8 text-center opacity-60">{tr("Nothing matches.", "لا توجد نتائج.")}</p>}
          </div>
        )}
        {!pdf && !islamic && <p className="rounded-3xl bg-white p-6 text-center text-sm opacity-75 dark:bg-white/5">{tr("The searchable book is available for Islamic Education. For this subject, open the uploaded document above.", "الكتاب القابل للبحث متاح للتربية الإسلامية. لهذه المادة افتح الوثيقة المرفوعة أعلاه.")}</p>}
      </div>
    </AssessmentShell>
  );
}
