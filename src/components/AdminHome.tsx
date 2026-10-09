"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { lmsApi } from "@/lib/lms";
import { mailApi } from "@/lib/mail";

export type AdminHomeTab = "pages" | "videos" | "quizzes" | "certificate" | "banners" | "announcements" | "teacher" | "forum" | "settings" | "students" | "teachers" | "lmshw" | "mail" | "activities" | "classes";

type Stat = { label: string; value: string; tab: AdminHomeTab };

type Props = {
  counts: {
    pages: number;
    videos: number;
    assessments: number;
    assessmentsEnabled: number;
    results: number;
    threads: number;
    banners: number;
    announcements: number;
  };
  refreshedAt: Date | null;
  refreshing: boolean;
  hasToken: boolean;
  onTab: (t: AdminHomeTab) => void;
};

/** Calm admin landing: a few numbers and one obvious next step. */
export function AdminHome({ counts, refreshedAt, refreshing, hasToken, onTab }: Props) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const stats: Stat[] = [
    { label: tr("Active assessments", "التقييمات النشطة"), value: `${counts.assessmentsEnabled} / ${counts.assessments}`, tab: "quizzes" },
    { label: tr("Published results", "النتائج المنشورة"), value: String(counts.results), tab: "quizzes" },
    { label: tr("Lesson pages", "صفحات الدروس"), value: String(counts.pages), tab: "pages" },
    { label: tr("Videos", "الفيديوهات"), value: String(counts.videos), tab: "videos" },
    { label: tr("Forum threads", "مواضيع المنتدى"), value: String(counts.threads), tab: "forum" },
    { label: tr("Announcements", "الإعلانات"), value: String(counts.announcements), tab: "announcements" },
    { label: tr("Banners", "اللافتات"), value: String(counts.banners), tab: "banners" },
  ];

  const time = refreshedAt
    ? refreshedAt.toLocaleTimeString(lang === "ar" ? "ar-AE" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const [school, setSchool] = useState<{ students: number; teachers: number; blocked: number; homework: number; unread: number } | null>(null);
  useEffect(() => {
    let on = true;
    Promise.all([
      lmsApi.users(true).catch(() => ({ users: [] as { role: string; disabled?: boolean }[] })),
      lmsApi.dashboard(true).catch(() => ({ homework: [] as unknown[] })),
    ]).then(([u, d]) => {
      if (!on) return;
      const us = u.users as { role: string; disabled?: boolean }[];
      setSchool((x) => ({ students: us.filter((y) => y.role === "student").length, teachers: us.filter((y) => y.role === "teacher").length, blocked: us.filter((y) => y.disabled).length, homework: ((d as { homework?: unknown[] }).homework || []).length, unread: x?.unread ?? 0 }));
    });
    mailApi.status().then((m) => { if (on) setSchool((x) => (x ? { ...x, unread: Number(m.unread) || 0 } : x)); }).catch(() => undefined);
    return () => { on = false; };
  }, []);
  const glass = "rounded-3xl border border-black/10 bg-white/75 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5";
  const actions: { tab: AdminHomeTab; icon: string; title: string; sub: string }[] = [
    { tab: "quizzes", icon: "📝", title: tr("Assessments", "التقييمات"), sub: tr("Edit, enable or host live", "تعديل أو تفعيل أو بث مباشر") },
    { tab: "students", icon: "🎒", title: tr("Students", "الطلاب"), sub: tr("Add, PINs, sign-in sheets", "إضافة، أرقام سرية، أوراق دخول") },
    { tab: "lmshw", icon: "📚", title: tr("Homework", "الواجبات"), sub: tr("All homework & submissions", "كل الواجبات والتسليمات") },
    { tab: "mail", icon: "✉️", title: tr("Mail", "البريد"), sub: "contact@shaiqmuhammad.com" },
    { tab: "activities", icon: "🎲", title: tr("Activities", "الأنشطة"), sub: tr("Wall, wheel, polls, votes", "الجدار، العجلة، الاستطلاعات") },
    { tab: "classes", icon: "🏫", title: tr("Classes", "الصفوف"), sub: tr("Class view & Quran map", "عرض الصف وخريطة القرآن") },
  ];
  const big: { label: string; value: string; tab: AdminHomeTab; tone: string }[] = school ? [
    { label: tr("Students", "الطلاب"), value: String(school.students), tab: "students", tone: "bg-sky-500" },
    { label: tr("Teachers", "المعلمون"), value: String(school.teachers), tab: "teachers", tone: "bg-emerald-500" },
    { label: tr("Homework", "الواجبات"), value: String(school.homework), tab: "lmshw", tone: "bg-sun" },
    { label: tr("Unread mail", "بريد غير مقروء"), value: String(school.unread), tab: "mail", tone: "bg-rose-500" },
  ] : [];

  return (
    <section className="space-y-8" data-testid="admin-home">
      <div className="relative overflow-hidden rounded-3xl bg-header px-6 py-7 text-white shadow-[0_18px_40px_-24px_rgba(10,25,40,0.8)] sm:px-8">
        <div aria-hidden className="absolute -end-12 -top-12 h-48 w-48 rounded-full bg-sun/30 blur-3xl" />
        <h2 className="relative text-3xl font-extrabold tracking-tight !text-white">{tr("Welcome back", "أهلًا بعودتك")} 👋</h2>
        <p className="relative mt-1 max-w-2xl text-sm text-white/75">
          {refreshing
            ? tr("Loading the latest published content…", "جارٍ تحميل أحدث محتوى منشور…")
            : tr(`Showing the latest published content (refreshed ${time}). Tap the logo any time to come back here and refresh.`, `يُعرض أحدث محتوى منشور (آخر تحديث ${time}). اضغط الشعار في أي وقت للعودة إلى هنا والتحديث.`)}
        </p>
      </div>

      {!hasToken && (
        <div className="rounded-xl bg-gold-soft px-4 py-3 text-sm">
          {tr("Publishing isn't connected on this device.", "النشر غير متصل على هذا الجهاز.")}{" "}
          <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onTab("settings")}>
            {tr("Open Settings", "افتح الإعدادات")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-home-school">
        {(school ? big : Array.from({ length: 4 }, () => null)).map((b, i) => b ? (
          <button key={b.label} type="button" onClick={() => onTab(b.tab)} className={glass + " flex items-center gap-3 px-5 py-4 text-start"}>
            <span className={`h-10 w-1.5 rounded-full ${b.tone}`} aria-hidden />
            <span><span className="block text-3xl font-extrabold tabular-nums leading-none">{b.value}</span><span className="mt-1 block text-xs font-semibold opacity-70">{b.label}</span></span>
          </button>
        ) : <div key={i} className={glass + " h-[76px] animate-pulse"} />)}
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-extrabold"><span className="h-5 w-1.5 rounded-full bg-sun" aria-hidden />{tr("Quick actions", "إجراءات سريعة")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((a) => (
            <button key={a.tab} type="button" onClick={() => onTab(a.tab)} className={glass + " flex items-center gap-4 px-5 py-4 text-start"} data-testid={`admin-home-action-${a.tab}`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sun/20 text-2xl" aria-hidden>{a.icon}</span>
              <span className="min-w-0"><span className="block font-extrabold">{a.title}</span><span className="block truncate text-sm opacity-70">{a.sub}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-extrabold"><span className="h-5 w-1.5 rounded-full bg-sun" aria-hidden />{tr("Website content", "محتوى الموقع")}</h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {stats.map((s) => (
            <button key={s.label} type="button" onClick={() => onTab(s.tab)} className={glass + " group px-4 py-3 text-start"}>
              <dt className="text-xs font-semibold opacity-70">{s.label}</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums group-hover:text-primary">{refreshing ? "…" : s.value}</dd>
            </button>
          ))}
        </dl>
      </div>
    </section>
  );
}
