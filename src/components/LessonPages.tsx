"use client";
/** t320: Learning Material lesson pages — signed-in admin / teacher / student only, read and edited through the LMS API. */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { lmsSession } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";
import { pgApi, type LPage, type LPageList } from "@/lib/lessonPages";
import { renderMarkdownLite } from "@/lib/markdownLite";
import { RichHtml } from "@/components/YtPlayer";
import { useI18n } from "@/lib/i18n";

export function canSeeMaterial() {
  const s = lmsSession();
  if (s) return ["teacher", "student", "admin"].includes(String(s.user.role));
  return !!getServerSession()?.token;
}

/** Old public /lessons URLs: signed-in users go into their account, everyone else to the LMS login. */
export function LessonRedirect() {
  useEffect(() => {
    const m = location.pathname.match(/^\/lessons\/([^/]+)/);
    const dest = `/lms/lessons${m ? `?p=${encodeURIComponent(decodeURIComponent(m[1]))}` : ""}`;
    window.location.replace(canSeeMaterial() ? dest : `/lms/login?next=${encodeURIComponent(dest)}`);
  }, []);
  return <p className="p-10 text-center text-sm opacity-70" data-testid="lesson-redirect">…</p>;
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 90);
const inp = "w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-[#1b2f44]";
const btn = "rounded-full bg-header px-4 py-1.5 text-sm font-extrabold text-sun";

/** List + reader + editor. Used at /lms/lessons (students read; teachers by permission) and in Admin › Learning Material. */
export function LessonPagesManager({ asAdmin }: { asAdmin?: boolean }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [ok, setOk] = useState<boolean | null>(null);
  const [data, setData] = useState<LPageList | null>(null);
  const [slug, setSlug] = useState("");
  const [page, setPage] = useState<LPage | null>(null);
  const [ed, setEd] = useState<(Partial<LPage> & { body: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => pgApi.list(asAdmin).then(setData).catch((e) => { setMsg(String((e as Error).message)); setData({ items: [], canAdd: false, subjects: [] }); }), [asAdmin]);
  useEffect(() => {
    const allowed = asAdmin || canSeeMaterial();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth and URL are only readable after hydration
    setOk(allowed);
    if (!allowed) { window.location.replace(`/lms/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    const read = () => setSlug(asAdmin ? "" : new URLSearchParams(location.search).get("p") || "");
    read(); window.addEventListener("popstate", read); void load();
    return () => window.removeEventListener("popstate", read);
  }, [asAdmin, load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the reader when leaving a page
  useEffect(() => { if (!slug) { setPage(null); return; } pgApi.get(slug, asAdmin).then(setPage).catch(() => setPage(null)); }, [slug, asAdmin]);
  const open = (s: string) => { setSlug(s); if (!asAdmin) history.pushState(null, "", s ? `/lms/lessons?p=${encodeURIComponent(s)}` : "/lms/lessons"); };
  const edit = async (p?: LPage) => { setMsg(""); if (!p) { setEd({ title: "", slug: "", excerpt: "", body: "", subject: "", published: true }); return; } const full = await pgApi.get(p.slug, asAdmin); setEd({ ...full, body: full.body || "" }); };
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!ed) return;
    try { await pgApi.save({ ...ed, slug: ed.slug || slugify(ed.title || "") }, asAdmin); setEd(null); setMsg(tr("Saved — visible to signed-in students and teachers only.", "تم الحفظ — يظهر للطلاب والمعلمين المسجلين فقط.")); await load(); if (page) setPage(await pgApi.get(page.slug, asAdmin).catch(() => null)); }
    catch (er) { setMsg(String((er as Error).message) === "slug_taken" ? tr("That address is already used.", "هذا الرابط مستخدم.") : tr("Not allowed or not saved.", "غير مسموح أو لم يُحفظ.") + ` (${(er as Error).message})`); }
  };
  const del = async (p: LPage) => { if (!confirm(tr(`Delete "${p.title}"?`, `حذف "${p.title}"؟`))) return; try { await pgApi.del(p.id, asAdmin); setMsg(tr("Deleted.", "تم الحذف.")); if (slug === p.slug) open(""); await load(); } catch (er) { setMsg(String((er as Error).message)); } };
  if (!ok || !data) return <p className="p-6 opacity-60">…</p>;
  const editor = ed && (
    <form onSubmit={save} className="space-y-2 rounded-2xl border border-sky-200 bg-white p-4 text-[#1b2f44]" data-testid="pg-editor">
      <input className={inp} placeholder={tr("Title", "العنوان")} value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value, slug: ed.id ? ed.slug : slugify(e.target.value) })} required data-testid="pg-title" dir="auto" />
      <input className={inp} placeholder={tr("Address (slug)", "الرابط")} value={ed.slug} onChange={(e) => setEd({ ...ed, slug: slugify(e.target.value) })} data-testid="pg-slug" />
      <textarea className={inp + " min-h-16"} placeholder={tr("Short summary", "ملخص قصير")} value={ed.excerpt} onChange={(e) => setEd({ ...ed, excerpt: e.target.value })} dir="auto" />
      {!!data.subjects.length && <select className={inp} value={ed.subject} onChange={(e) => setEd({ ...ed, subject: e.target.value })} data-testid="pg-subject"><option value="">{tr("All subjects", "كل المواد")}</option>{data.subjects.map((s) => <option key={s}>{s}</option>)}</select>}
      <textarea className={inp + " min-h-48 font-mono text-xs"} placeholder={tr("Body (## headings, ![image](url), :::youtube ID)", "المحتوى")} value={ed.body} onChange={(e) => setEd({ ...ed, body: e.target.value })} data-testid="pg-body" dir="auto" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!ed.published} onChange={(e) => setEd({ ...ed, published: e.target.checked })} data-testid="pg-published" /> {tr("Published (students can see it)", "منشور (يراه الطلاب)")}</label>
      <div className="flex gap-2"><button type="submit" className={btn} data-testid="pg-save">{tr("Save", "حفظ")}</button><button type="button" className="text-sm underline" onClick={() => setEd(null)}>{tr("Cancel", "إلغاء")}</button></div>
    </form>
  );
  if (slug && !ed) return page ? (
    <article className="mx-auto max-w-3xl space-y-4 p-4" data-testid="lesson-page">
      <div className="flex flex-wrap items-center gap-3"><button type="button" className="text-sm font-bold text-primary hover:underline" onClick={() => open("")}>← {tr("All lesson pages", "كل صفحات الدروس")}</button>
        {page.canEdit && <button type="button" className="text-sm font-bold underline" onClick={() => edit(page)} data-testid="pg-edit-open">✏️ {tr("Edit", "تعديل")}</button>}</div>
      <div className="glass rounded-3xl p-5 sm:p-8"><h1 className="text-2xl font-extrabold" dir="auto">{page.title}</h1>{page.excerpt && <p className="mt-1 text-muted" dir="auto">{page.excerpt}</p>}
        <RichHtml className="prose-lesson mt-6" html={renderMarkdownLite(page.body || "")} /></div>
    </article>
  ) : <p className="p-6 opacity-70">…</p>;
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4" data-testid="lesson-list">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-extrabold">📄 {tr("Lesson pages", "صفحات الدروس")} <span className="text-sm font-normal opacity-60">({data.items.length})</span></h1>
        {data.canAdd && !ed && <button type="button" className={btn} onClick={() => edit()} data-testid="pg-new">＋ {tr("New lesson page", "صفحة درس جديدة")}</button>}</div>
      <p className="text-xs opacity-70">🔒 {tr("Only signed-in students, teachers and admin can see these pages.", "هذه الصفحات للطلاب والمعلمين والإدارة المسجلين فقط.")}</p>
      {msg && <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-[#1b2f44]" role="status" data-testid="pg-msg">{msg}</p>}
      {editor}
      {!data.items.length ? <p className="opacity-70">{tr("No lesson pages yet.", "لا توجد صفحات دروس بعد.")}</p> :
        <div className="grid gap-4 sm:grid-cols-2">{data.items.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-4" data-testid="pg-card">
            <button type="button" className="block w-full text-start" onClick={() => open(p.slug)}><h3 className="font-bold" dir="auto">{p.title}</h3><p className="mt-1 text-sm text-muted" dir="auto">{p.excerpt}</p></button>
            <p className="mt-2 text-xs opacity-70">{p.published ? tr("Published", "منشور") : tr("Draft", "مسودة")}{p.subject ? ` · ${p.subject}` : ""} · {p.ownerName}</p>
            {(p.canEdit || p.canDelete) && <div className="mt-2 flex gap-3 text-sm">{p.canEdit && <button type="button" className="font-bold text-primary underline" onClick={() => edit(p)} data-testid="pg-edit">{tr("Edit", "تعديل")}</button>}{p.canDelete && <button type="button" className="font-bold text-rose-700 underline" onClick={() => del(p)} data-testid="pg-del">{tr("Delete", "حذف")}</button>}</div>}
          </div>))}</div>}
    </section>
  );
}

export function LessonPages() { return <LessonPagesManager />; }
