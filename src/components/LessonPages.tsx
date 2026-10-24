"use client";
/** t320: Learning Material pages are for signed-in admin / teacher / student accounts only (rendered inside the account area). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { lmsSession } from "@/lib/lms";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listPublishedPages, getPageBySlug, normalizeContentData, type ContentData } from "@/lib/content";
import { renderMarkdownLite } from "@/lib/markdownLite";
import { RichHtml } from "@/components/YtPlayer";
import { useI18n } from "@/lib/i18n";

export function canSeeMaterial() {
  if (isAdminAuthenticated()) return true;
  const s = lmsSession();
  return !!s && (s.user.role === "teacher" || s.user.role === "student" || s.user.role === "admin" || String(s.user.role) === "staff");
}

/** Public /lessons URLs: send signed-in users into their account, everyone else to the LMS login. */
export function LessonRedirect({ slug }: { slug?: string }) {
  useEffect(() => {
    const dest = `/lms/lessons${slug ? `?p=${encodeURIComponent(slug)}` : ""}`;
    window.location.replace(canSeeMaterial() ? dest : `/lms/login?next=${encodeURIComponent(dest)}`);
  }, [slug]);
  return <p className="p-10 text-center text-sm opacity-70" data-testid="lesson-redirect">…</p>;
}

export function LessonPages() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [ok, setOk] = useState<boolean | null>(null);
  const [data, setData] = useState<ContentData | null>(null);
  const [slug, setSlug] = useState("");
  useEffect(() => {
    const allowed = canSeeMaterial();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth and URL are only readable after hydration
    setOk(allowed);
    if (!allowed) { window.location.replace(`/lms/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    const read = () => setSlug(new URLSearchParams(location.search).get("p") || "");
    read(); window.addEventListener("popstate", read);
    fetch(`/content/data.json?${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setData(normalizeContentData(j))).catch(() => setData(normalizeContentData({})));
    return () => window.removeEventListener("popstate", read);
  }, []);
  if (!ok || !data) return <p className="p-6 opacity-60">…</p>;
  const page = slug ? getPageBySlug(data, slug) : undefined;
  if (page) return (
    <article className="mx-auto max-w-3xl space-y-4 p-4" data-testid="lesson-page">
      <Link href="/lms/lessons" className="text-sm font-bold text-primary hover:underline" onClick={() => setSlug("")}>← {tr("All lesson pages", "كل صفحات الدروس")}</Link>
      <div className="glass rounded-3xl p-5 sm:p-8"><h1 className="text-2xl font-extrabold">{page.title}</h1>{page.excerpt && <p className="mt-1 text-muted">{page.excerpt}</p>}
        <RichHtml className="prose-lesson mt-6" html={renderMarkdownLite(page.body)} /></div>
    </article>
  );
  const pages = listPublishedPages(data);
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4" data-testid="lesson-list">
      <h1 className="text-2xl font-extrabold">📄 {tr("Lesson pages", "صفحات الدروس")}</h1>
      {!pages.length ? <p className="opacity-70">{tr("No published lessons yet.", "لا توجد دروس منشورة بعد.")}</p> :
        <div className="grid gap-4 sm:grid-cols-2">{pages.map((p) => <Link key={p.id} href={`/lms/lessons?p=${encodeURIComponent(p.slug)}`} onClick={() => setSlug(p.slug)} className="glass block rounded-2xl p-4 hover:-translate-y-0.5"><h3 className="font-bold">{p.title}</h3><p className="mt-1 text-sm text-muted">{p.excerpt}</p></Link>)}</div>}
    </section>
  );
}
