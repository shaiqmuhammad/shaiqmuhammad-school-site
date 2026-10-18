"use client";

import { useCallback, useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { btn, btnCta, cardCls, Head, Toast } from "@/components/lms/mods/ModUi";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, quranChapters, type Chapter, type Homework, type QuranData } from "@/lib/lms";
import { modCall, modErr, qhwPerm } from "@/lib/lmsMods";

type Dash = { homework: (Homework & { counts?: Record<string, number>; assigned?: number })[]; classes?: { cls: string; students: number }[]; students?: never[]; catalog?: never; scope?: string[]; quran?: { show: boolean; view: boolean; add: boolean; edit: boolean; del: boolean } };

/** Teacher page: Quran homework only (list, add, edit, delete, class Quran map), governed by the admin's Quran Homework switches. */
export function QuranHomeworkPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  const p = qhwPerm(actor?.perms);
  return (
    <AssessmentShell title={tr("Quran Homework", "واجب القرآن")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6" data-testid="quran-hw">
        {!ready ? null : !actor || actor.role !== "teacher" ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")} <a className="font-bold underline" href="/lms/login">{tr("Sign in", "دخول")}</a></p>
          : !p.show || !p.view ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="mod-no-access">{tr("You don't have access to Quran Homework. Ask the admin to switch it on for you.", "ليس لديك صلاحية لواجب القرآن. اطلب من الإدارة تفعيلها.")}</p>
          : <QuranHomework />}
      </div>
    </AssessmentShell>
  );
}

function QuranHomework() {
  const { tr, lang } = useTr();
  const [d, setD] = useState<Dash | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [extra, setExtra] = useState<{ classes: { cls: string; students: number }[]; students: never[]; catalog?: never; scope?: string[] }>({ classes: [], students: [] });
  const [editor, setEditor] = useState<Partial<Homework> | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const load = useCallback(() => { modCall<Dash>("dashboard", undefined, false).then((r) => { setD(r); setExtra({ classes: r.classes || [], students: (r.students || []) as never[], catalog: r.catalog, scope: r.scope }); }).catch((e) => { setD({ homework: [] }); setMsg(modErr(e, tr)); setBad(true); }); }, [tr]);
  useEffect(() => { load(); quranChapters().then(setChapters); }, [load]);
  const q = d?.quran || { show: true, view: true, add: false, edit: false, del: false };
  const items = (d?.homework || []).filter((h) => h.kind === "quran");
  const sn = (n: number) => chapters.find((c) => c.id === n)?.name_simple || `Surah ${n}`;
  const del = async (h: Homework) => { if (!confirm(tr("Delete this Quran homework and all submissions?", "حذف واجب القرآن وكل التسليمات؟"))) return; try { await lmsApi.deleteHomework(h.id, false); setMsg(tr("Deleted.", "تم الحذف.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); } };
  return (
    <div className="space-y-1">
      <Head icon="📖" title={tr("Quran Homework", "واجب القرآن")} sub={tr("Quran recitation homework for your classes: assign, review and track.", "واجبات تلاوة القرآن لصفوفك: إسناد ومراجعة ومتابعة.")}>
        <a className={btn} href="/lms/map" data-testid="qhw-map">🗺️ {tr("Class Quran map", "خريطة القرآن للصف")}</a>
        {q.add && <button type="button" className={btnCta} onClick={() => setEditor({})} data-testid="qhw-new">+ {tr("New Quran homework", "واجب قرآن جديد")}</button>}
      </Head>
      {!q.add && !q.edit && !q.del && <p className="mb-3 rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-900" data-testid="qhw-viewonly">{tr("View only — you can see Quran homework but not change it.", "للعرض فقط — يمكنك رؤية واجب القرآن دون تعديله.")}</p>}
      <Toast msg={msg} bad={bad} />
      {editor && <div className="mb-4"><HomeworkEditor initial={editor.id ? (editor as Homework) : undefined} kinds={["quran"]} classes={extra.classes} students={extra.students} catalog={extra.catalog} scope={extra.scope} asAdmin={false} onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); setMsg(tr("Saved.", "تم الحفظ.")); setBad(false); load(); }} /></div>}
      {d === null ? <p className="py-10 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : !items.length ? <p className={cardCls + " text-center opacity-70"} data-testid="qhw-empty">{tr("No Quran homework yet.", "لا يوجد واجب قرآن بعد.")}</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((h) => { const qd = h.data as QuranData; const c = h.counts || {}; return (
            <article key={h.id} className={cardCls} data-testid="qhw-item">
              <p className="text-lg font-extrabold" dir="auto">📖 {h.title}</p>
              <p className="text-sm opacity-80">{sn(qd.surah)} · {qd.from}–{qd.to}</p>
              <p className="mt-1 text-xs opacity-70">{[h.cls, h.section].filter(Boolean).join(" · ") || tr("Selected students", "طلاب محددون")}{h.due ? ` · ⏰ ${new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}</p>
              <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-800 dark:bg-white/10 dark:text-white">{tr("Assigned", "مُسند")} {h.assigned ?? 0}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{tr("Submitted", "مُسلَّم")} {c.submitted || 0}</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">{tr("Approved", "مقبول")} {c.approved || 0}</span></p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className={btn + " !py-1"} href={`/lms/homework?id=${h.id}`} data-testid="qhw-open">{tr("Open / review", "فتح / مراجعة")}</a>
                {q.edit && <button type="button" className={btn + " !py-1"} onClick={() => setEditor(h)} data-testid="qhw-edit">✎ {tr("Edit", "تعديل")}</button>}
                {q.del && <button type="button" className={btn + " !py-1"} onClick={() => del(h)} data-testid="qhw-del">🗑</button>}
              </div>
            </article>
          ); })}
        </div>
      )}
    </div>
  );
}
