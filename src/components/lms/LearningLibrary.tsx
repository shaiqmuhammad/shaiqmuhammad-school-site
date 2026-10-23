"use client";

import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useTr } from "@/components/lms/useLms";
import { useDynNav } from "@/lib/dynNav";

type Card = { href: string; en: string; ar: string; icon: string; tone: string; den: string; dar: string };
const BASE: Card[] = [
  { href: "/encyclopedia/quran", en: "Encyclopedia of Quran", ar: "موسوعة القرآن", icon: "📖", tone: "from-emerald-400 to-teal-500", den: "Translations and explanations of every surah.", dar: "ترجمات وتفاسير لكل سورة." },
  { href: "/encyclopedia/quran-com", en: "Quran.com", ar: "Quran.com", icon: "🕌", tone: "from-sky-400 to-indigo-500", den: "Read and listen to the Quran.", dar: "اقرأ القرآن واستمع إليه." },
  { href: "/encyclopedia/hadith", en: "Encyclopedia of Hadith", ar: "موسوعة الحديث", icon: "📜", tone: "from-amber-400 to-orange-500", den: "Trusted hadith with meanings.", dar: "أحاديث موثوقة مع معانيها." },
  { href: "/encyclopedia/sunnah", en: "Sunnah.com", ar: "Sunnah.com", icon: "🌙", tone: "from-violet-400 to-fuchsia-500", den: "Search the hadith collections.", dar: "ابحث في كتب الحديث." },
  { href: "/lessons", en: "Learning Pages", ar: "صفحات التعلم", icon: "🎒", tone: "from-rose-400 to-pink-500", den: "Lessons made by your teachers.", dar: "دروس أعدّها معلموك." },
  { href: "/videos", en: "Videos", ar: "الفيديوهات", icon: "🎬", tone: "from-cyan-400 to-blue-500", den: "Watch and learn.", dar: "شاهد وتعلّم." },
];

/** t303: student-friendly Learning Libraries tab (encyclopedias, Learning Pages and any extra pages the admin published). */
export function LearningLibrary() {
  const { tr } = useTr();
  const dyn = useDynNav();
  const extra = dyn.resources.filter((d) => !BASE.some((b) => b.href === d.href));
  return (
    <AssessmentShell title={tr("Learning Libraries", "مكتبات التعلم")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6" data-testid="lms-library">
        <div className="mb-5 rounded-3xl bg-gradient-to-br from-sun/80 to-amber-200 p-5 text-[#0b1b2b] shadow-sm">
          <h1 className="text-2xl font-extrabold sm:text-3xl">📚 {tr("Learning Libraries", "مكتبات التعلم")}</h1>
          <p className="mt-1 font-semibold opacity-80">{tr("Explore, read and learn — pick a library to start.", "استكشف واقرأ وتعلّم — اختر مكتبة للبدء.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BASE.map((c) => (
            <a key={c.href} href={c.href} className="group flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5 dark:ring-white/10" data-testid="lib-card">
              <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${c.tone} text-3xl shadow-inner`} aria-hidden>{c.icon}</span>
              <span className="min-w-0"><span className="block text-lg font-extrabold" dir="auto">{tr(c.en, c.ar)}</span><span className="block text-sm opacity-70">{tr(c.den, c.dar)}</span></span>
            </a>
          ))}
          {extra.map((d) => (
            <a key={d.href} href={d.href} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5 dark:ring-white/10" data-testid="lib-card">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lime-300 to-emerald-500 text-3xl" aria-hidden>📄</span>
              <span className="block text-lg font-extrabold" dir="auto">{d.label}</span>
            </a>
          ))}
        </div>
      </div>
    </AssessmentShell>
  );
}
