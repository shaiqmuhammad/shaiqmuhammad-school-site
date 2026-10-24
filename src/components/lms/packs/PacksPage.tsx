"use client";

import { defaultSubject, teacherSubjects } from "@/components/lms/SubjectPick";
import { useCallback, useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { smallBtn, useLmsActor, useTr } from "@/components/lms/useLms";
import { modErr } from "@/lib/lmsMods";
import { blankSlide, lp, TYPE_LABEL, type Acc, type Pack, type PackType } from "@/lib/packs";
import { PackEditor } from "./PackEditor";
import { PackPlayer } from "./PackPlayer";

const TEMPLATES: [string, string, string, (ar: boolean) => Pack["slides"]][] = [
  ["blank", "Blank", "فارغة", () => [blankSlide()]],
  ["lesson", "Lesson: intro → learn → check → reflect", "درس: تمهيد ← تعلّم ← تحقّق ← تأمّل", (ar) => [ar ? "🎯 هدف الدرس" : "🎯 Learning objective", ar ? "📖 لنتعلّم" : "📖 Let's learn", ar ? "✅ تحقّق من فهمك" : "✅ Check your understanding", ar ? "💭 ماذا تعلّمت اليوم؟" : "💭 What did you learn today?"].map((t) => ({ ...blankSlide(), els: [{ id: Math.random().toString(36).slice(2), t: "text", text: t, color: "#1b3a57", font: ar ? "Amiri" : "Nunito", size: 72, bold: true, x: 6, y: 6, w: 88, h: 18 }] })) as Pack["slides"]],
  ["hw", "Homework: task + answer space", "واجب: مهمة + مساحة للإجابة", (ar) => [{ ...blankSlide(), els: [{ id: "t1", t: "text", text: ar ? "📝 المهمة" : "📝 Your task", color: "#1b3a57", font: ar ? "Amiri" : "Nunito", size: 64, bold: true, x: 6, y: 6, w: 88, h: 16 }, { id: "t2", t: "text", text: ar ? "اكتب أو ارسم أو سجّل إجابتك في هذه الشريحة." : "Type, draw or record your answer on this slide.", color: "#586a7d", font: ar ? "Amiri" : "Nunito", size: 36, x: 6, y: 26, w: 88, h: 14 }] }] as Pack["slides"]],
];

/** t315: Learning Material — Lesson Packs list (admin + teachers) and the student list (from the Learning Libraries). */
export function PacksPage() {
  const { tr, lang } = useTr();
  const { actor, ready } = useLmsActor();
  const asAdmin = actor?.role === "admin";
  const staff = actor?.role === "teacher" || asAdmin;
  const [items, setItems] = useState<Pack[] | null>(null);
  const [acc, setAcc] = useState<Acc | null>(null);
  const [edit, setEdit] = useState<Pack | null>(null);
  const [open, setOpen] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"" | PackType>("");
  const load = useCallback(() => lp.list(asAdmin).then((r) => { setItems(r.items); setAcc(r.acc || null); }).catch((e) => { setItems([]); setMsg(modErr(e, tr)); }), [asAdmin, tr]);
  useEffect(() => { if (ready && actor) load(); }, [ready, actor, load]);
  useEffect(() => { const q = new URLSearchParams(location.search); if (q.get("open")) setOpen(q.get("open")!); }, []);
  useEffect(() => { const q = new URLSearchParams(location.search); const t = q.get("new") as PackType | null; if (t && acc?.add && !edit) newPack(t, "blank"); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc]);
  const newPack = (type: PackType, tpl: string) => setEdit({ id: "", owner: "", ownerName: "", title: "", type, subject: asAdmin ? "" : defaultSubject(teacherSubjects(actor as never)), aud: [], students: [], topic: {}, mode: "self", assignAt: 0, due: 0, status: "draft", hw: "", live: -1, tpl: false, created: 0, updated: 0, slides: TEMPLATES.find((x) => x[0] === tpl)![3](/^islamic a$/i.test(actor?.subj?.[0] || "") || lang === "ar") });
  const title = tr("Learning Material", "المواد التعليمية");
  if (ready && !actor) return <AssessmentShell title={title} exitHref="/lms"><p className="p-8 text-center">{tr("Please sign in.", "يرجى تسجيل الدخول.")}</p></AssessmentShell>;
  const list = (items || []).filter((x) => !filter || x.type === filter);
  return (
    <AssessmentShell title={title} exitHref="/lms" wide toolbar={staff ? <LmsStaffToolbar /> : undefined}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-3 py-5 sm:px-6" data-testid="lp-page">
        {edit && acc ? <PackEditor key={edit.id || "new"} initial={edit} acc={acc} asAdmin={asAdmin} subjects={asAdmin ? ["Islamic A", "Islamic B", ...(actor?.subj || [])].filter((x, i, a) => a.indexOf(x) === i)   : teacherSubjects(actor as never)} onClose={() => { setEdit(null); load(); }} />
        : open ? <div className="space-y-2"><button type="button" className={smallBtn} onClick={() => setOpen("")} data-testid="lp-close">← {tr("Back", "رجوع")}</button><PackPlayer id={open} asAdmin={asAdmin} preview={staff} /></div>
        : <>
          <div className="rounded-3xl bg-gradient-to-br from-[#1d4a6e] to-header p-5 text-white">
            <h1 className="text-2xl font-extrabold !text-white">📚 {title}</h1>
            <p className="text-sm opacity-90">{staff ? tr("Build slide lessons and homework: text, pictures, drawing, audio, your YouTube videos, activities and Quran — then assign by year group, class, section or group.", "أنشئ دروسًا وواجبات بالشرائح: نصوص وصور ورسم وصوت وفيديوهاتك وأنشطة وقرآن — ثم أسندها.") : tr("Lessons from your teachers. Open one, then type, draw or record on the slides.", "دروس من معلميك. افتح درسًا واكتب أو ارسم أو سجّل على الشرائح.")}</p>
          </div>
          {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
          {staff && acc?.add && <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5" data-testid="lp-new">
            <b className="text-sm">➕ {tr("New", "جديد")}:</b>
            {(Object.keys(TYPE_LABEL) as PackType[]).map((k) => <button key={k} type="button" className={smallBtn} onClick={() => newPack(k, k === "material" ? "lesson" : "hw")} data-testid={`lp-new-${k}`}>{TYPE_LABEL[k][0]} {tr(TYPE_LABEL[k][1], TYPE_LABEL[k][2])}</button>)}
            <span className="text-xs opacity-60">{tr("Templates:", "القوالب:")}</span>
            {TEMPLATES.map(([k, en, ar]) => <button key={k} type="button" className={smallBtn} onClick={() => newPack(k === "hw" ? "homework" : "material", k)} data-testid={`lp-tpl-${k}`}>{tr(en, ar)}</button>)}
          </div>}
          {staff && !acc?.view && items && <p className="text-sm">{tr("This module is hidden for your account.", "هذه الوحدة مخفية لحسابك.")}</p>}
          <div className="flex flex-wrap gap-1.5">{(["", "material", "homework", "quran"] as const).map((k) => <button key={k} type="button" aria-pressed={filter === k} className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ring-black/10 ${filter === k ? "bg-header text-sun" : "bg-white text-[#1b2f44]"}`} onClick={() => setFilter(k)}>{k ? `${TYPE_LABEL[k][0]} ${tr(TYPE_LABEL[k][1], TYPE_LABEL[k][2])}` : tr("All", "الكل")}</button>)}</div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="lp-list">
            {items === null ? <li>…</li> : list.length === 0 ? <li className="glass rounded-3xl p-4 text-sm opacity-80">{staff ? tr("No packs yet — start with a template above.", "لا توجد حزم بعد — ابدأ بقالب.") : tr("Nothing here yet.", "لا شيء هنا بعد.")}</li> : list.map((x) => (
              <li key={x.id} className="glass space-y-2 rounded-3xl p-4" data-testid="lp-item">
                <div className="flex items-start gap-2"><span className="text-2xl">{TYPE_LABEL[x.type][0]}</span><div className="min-w-0 flex-1"><p className="font-extrabold" dir="auto">{x.title}</p><p className="text-xs opacity-70">{tr(TYPE_LABEL[x.type][1], TYPE_LABEL[x.type][2])} · {x.count} {tr("slides", "شرائح")}{x.subject ? ` · ${x.subject}` : ""}{x.topic?.title ? ` · ${x.topic.title}` : ""}</p>
                  {staff && <p className="text-xs opacity-70">{x.status === "published" ? (x.assignAt > Date.now() ? "⏰ " + tr("Scheduled", "مجدول") : "✅ " + tr("Published", "منشور")) : "📝 " + tr("Draft", "مسودة")}{x.due ? ` · ${tr("due", "التسليم")} ${new Date(x.due).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai" })}` : ""}{x.tpl ? ` · ${tr("template", "قالب")}` : ""}{x.mode === "live" ? " · 📡" : ""}</p>}</div></div>
                <div className="flex flex-wrap gap-1.5">
                  {staff && (x.owner === actor?.id || asAdmin) && <button type="button" className={smallBtn} onClick={() => lp.get(x.id, asAdmin).then((r) => setEdit(r.pack))} data-testid="lp-edit">✏️ {acc?.edit ? tr("Edit", "تعديل") : tr("View", "عرض")}</button>}
                  {(!staff || x.type === "material") && <button type="button" className={smallBtn} onClick={() => setOpen(x.id)} data-testid="lp-open">▶ {tr("Open", "فتح")}</button>}
                  {!staff && x.hw && <a className={smallBtn} href={`/lms/homework?id=${encodeURIComponent(x.hw)}`} data-testid="lp-open-hw">📝 {tr("Open homework", "افتح الواجب")}</a>}
                  {staff && acc?.add && <button type="button" className={smallBtn} onClick={() => lp.dup(x.id, asAdmin).then(load).catch((e) => setMsg(modErr(e, tr)))} data-testid="lp-dup">⧉ {tr("Duplicate", "تكرار")}</button>}
                  {staff && acc?.delete && (x.owner === actor?.id || asAdmin) && <button type="button" className={smallBtn + " !text-rose-700"} onClick={() => { if (confirm(tr("Delete this pack? Its homework and the students' work are deleted too.", "حذف هذه الحزمة؟ يُحذف واجبها وأعمال الطلاب أيضًا."))) lp.del(x.id, asAdmin).then(load).catch((e) => setMsg(modErr(e, tr))); }} data-testid="lp-delete">🗑</button>}
                </div>
              </li>))}
          </ul>
        </>}
      </div>
    </AssessmentShell>
  );
}
