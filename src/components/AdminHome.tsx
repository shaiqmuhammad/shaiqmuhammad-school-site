"use client";

import { useI18n } from "@/lib/i18n";

export type AdminHomeTab = "pages" | "videos" | "quizzes" | "certificate" | "banners" | "teacher" | "forum" | "settings";

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
    { label: tr("Announcements", "الإعلانات"), value: String(counts.banners), tab: "banners" },
  ];

  const time = refreshedAt
    ? refreshedAt.toLocaleTimeString(lang === "ar" ? "ar-AE" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className="space-y-8" data-testid="admin-home">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{tr("Welcome back", "أهلًا بعودتك")}</h2>
        <p className="text-sm text-muted">
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

      <div>
        <button
          type="button"
          onClick={() => onTab("quizzes")}
          className="w-full rounded-2xl bg-primary px-6 py-5 text-start text-primary-foreground shadow-sm transition hover:opacity-95 sm:w-auto"
        >
          <span className="block text-lg font-semibold">{tr("Assessments", "التقييمات")}</span>
          <span className="block text-sm opacity-90">{tr("Edit, enable or start a live class session", "تعديل أو تفعيل أو بدء جلسة صفية مباشرة")}</span>
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
        {stats.map((s) => (
          <button key={s.label} type="button" onClick={() => onTab(s.tab)} className="group text-start">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums group-hover:text-primary">{refreshing ? "…" : s.value}</dd>
          </button>
        ))}
      </dl>
    </section>
  );
}
