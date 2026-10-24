"use client";

import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useTr } from "@/components/lms/useLms";
import { useDynNav } from "@/lib/dynNav";
import { useEffect, useRef, useState } from "react";

type Card = { href: string; src?: string; en: string; ar: string; icon: string; tone: string; den: string; dar: string };
const BASE: Card[] = [
  { href: "/encyclopedia/quran", src: "https://quranenc.com/en/home#transes", en: "Encyclopedia of Quran", ar: "موسوعة القرآن", icon: "📖", tone: "from-emerald-400 to-teal-500", den: "Translations and explanations of every surah.", dar: "ترجمات وتفاسير لكل سورة." },
  { href: "/encyclopedia/quran-com", src: "https://quran.com/", en: "Quran.com", ar: "Quran.com", icon: "🕌", tone: "from-sky-400 to-indigo-500", den: "Read and listen to the Quran.", dar: "اقرأ القرآن واستمع إليه." },
  { href: "/encyclopedia/hadith", src: "https://hadeethenc.com/en/home/about", en: "Encyclopedia of Hadith", ar: "موسوعة الحديث", icon: "📜", tone: "from-amber-400 to-orange-500", den: "Trusted hadith with meanings.", dar: "أحاديث موثوقة مع معانيها." },
  { href: "/encyclopedia/sunnah", src: "https://sunnah.com/", en: "Sunnah.com", ar: "Sunnah.com", icon: "🌙", tone: "from-violet-400 to-fuchsia-500", den: "Search the hadith collections.", dar: "ابحث في كتب الحديث." },
  { href: "/lms/material", en: "Learning Material", ar: "المواد التعليمية", icon: "🎒", tone: "from-rose-400 to-pink-500", den: "Slide lessons from your teachers.", dar: "دروس بالشرائح من معلميك." },
  { href: "/lessons", en: "Lesson pages", ar: "صفحات الدروس", icon: "📄", tone: "from-pink-300 to-rose-400", den: "Lessons on the school website.", dar: "دروس على موقع المدرسة." },
  { href: "/videos", en: "Videos", ar: "الفيديوهات", icon: "🎬", tone: "from-cyan-400 to-blue-500", den: "Watch and learn.", dar: "شاهد وتعلّم." },
];

/** t303: student-friendly Learning Libraries tab (encyclopedias, Learning Material and any extra pages the admin published). */
export function LearningLibrary() {
  const { tr } = useTr();
  const dyn = useDynNav();
  const extra = dyn.resources.filter((d) => !BASE.some((b) => b.href === d.href));
  // t304: libraries open INSIDE the student area (sandboxed frame without popups / top navigation, so nothing leaves the LMS).
  const [open, setOpen] = useState<{ title: string; src: string; same: boolean } | null>(null);
  const openCard = (title: string, href: string, src?: string) => { setOpen({ title, src: src || href, same: !src }); try { history.replaceState(null, "", `#open=${encodeURIComponent(href)}`); } catch { /* */ } };
  useEffect(() => { const m = /#open=(.+)/.exec(window.location.hash); if (!m) return; const h = decodeURIComponent(m[1]); const c = BASE.find((b) => b.href === h); if (c) setOpen({ title: tr(c.en, c.ar), src: c.src || c.href, same: !c.src }); else if (h.startsWith("/")) setOpen({ title: h, src: h, same: true }); }, [tr]);
  if (open) return (
    <AssessmentShell title={open.title} exitHref="/lms/library" wide toolbar={<LmsStaffToolbar />}>
      <div className="flex w-full flex-1 flex-col gap-2 px-2 py-2 sm:px-4" data-testid="lib-viewer">
        <div className="flex items-center gap-2"><button type="button" className="rounded-full bg-sun px-4 py-2 text-sm font-extrabold text-[#0b1b2b]" onClick={() => { setOpen(null); try { history.replaceState(null, "", window.location.pathname); } catch { /* */ } }} data-testid="lib-back">← {tr("All libraries", "كل المكتبات")}</button><h1 className="truncate text-lg font-extrabold" dir="auto">{open.title}</h1></div>
        <LibFrame src={open.src} same={open.same} title={open.title} />
      </div>
    </AssessmentShell>
  );
  return (
    <AssessmentShell title={tr("Learning Libraries", "مكتبات التعلم")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6" data-testid="lms-library">
        <div className="mb-5 rounded-3xl bg-gradient-to-br from-sun/80 to-amber-200 p-5 text-[#0b1b2b] shadow-sm">
          <h1 className="text-2xl font-extrabold sm:text-3xl">📚 {tr("Learning Libraries", "مكتبات التعلم")}</h1>
          <p className="mt-1 font-semibold opacity-80">{tr("Explore, read and learn — pick a library to start.", "استكشف واقرأ وتعلّم — اختر مكتبة للبدء.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BASE.map((c) => (
            <a key={c.href} href={c.href.startsWith("/lms/") ? c.href : `#open=${encodeURIComponent(c.href)}`} onClick={(e) => { if (c.href.startsWith("/lms/")) return; e.preventDefault(); openCard(tr(c.en, c.ar), c.href, c.src); }} className="group flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5 dark:ring-white/10" data-testid="lib-card">
              <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${c.tone} text-3xl shadow-inner`} aria-hidden>{c.icon}</span>
              <span className="min-w-0"><span className="block text-lg font-extrabold" dir="auto">{tr(c.en, c.ar)}</span><span className="block text-sm opacity-70">{tr(c.den, c.dar)}</span></span>
            </a>
          ))}
          {extra.map((d) => (
            <a key={d.href} href={`#open=${encodeURIComponent(d.href)}`} onClick={(e) => { if (!d.href.startsWith("/")) return; e.preventDefault(); openCard(d.label, d.href); }} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5 dark:ring-white/10" data-testid="lib-card">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lime-300 to-emerald-500 text-3xl" aria-hidden>📄</span>
              <span className="block text-lg font-extrabold" dir="auto">{d.label}</span>
            </a>
          ))}
        </div>
      </div>
    </AssessmentShell>
  );
}

/** Same-site pages are shown without the public site header/footer; links that try to open new windows are kept inside the frame. */
function LibFrame({ src, same, title }: { src: string; same: boolean; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const tidy = () => {
    if (!same) return;
    try {
      const d = ref.current?.contentDocument; if (!d) return;
      if (!d.getElementById("lms-embed-css")) { const st = d.createElement("style"); st.id = "lms-embed-css"; st.textContent = "header.bg-header,footer.bg-footer{display:none!important}"; d.head.appendChild(st); }
      d.querySelectorAll("a[target]").forEach((a) => a.removeAttribute("target"));
    } catch { /* */ }
  };
  return <iframe ref={ref} src={src} title={title} onLoad={tidy} className="h-[calc(100dvh-9rem)] w-full flex-1 rounded-2xl border-0 bg-white shadow-sm ring-1 ring-black/10" sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer" data-testid="lib-frame" />;
}
