"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Banner } from "@/lib/banners";
import { useI18n } from "@/lib/i18n";

/** Home page banner slider (managed in Admin → Banners). Hidden when there are no visible slides. */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const slides = banners;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (dir: number) => {
      if (!slides.length) return;
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length],
  );

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const t = setInterval(() => go(1), 6000);
    return () => clearInterval(t);
  }, [slides.length, paused, go]);

  if (!slides.length) return null;
  const slide = slides[Math.min(index, slides.length - 1)];
  const title = (ar && slide.titleAr) || slide.title;
  const subtitle = (ar && slide.subtitleAr) || slide.subtitle;
  const buttonText = (ar && slide.buttonTextAr) || slide.buttonText;
  const label = ar ? "اللافتات المميزة" : "Featured banners";

  return (
    <section
      className="band-cream relative overflow-hidden border-b border-sun-border/30"
      aria-roledescription="carousel"
      aria-label={label}
      data-testid="banners"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="glass glass-emph relative overflow-hidden rounded-[20px] p-0">
          <div className="relative aspect-[4/3] min-h-[300px] w-full sm:aspect-[21/9] sm:min-h-[260px]">
            {slide.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={slide.id} src={slide.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-deep to-[#0f2438]" aria-hidden>
                <div className="absolute -end-10 -top-10 h-48 w-48 rounded-full bg-sun/30 blur-2xl" />
                <div className="absolute -bottom-12 start-10 h-40 w-40 rounded-full bg-teal-brand/30 blur-2xl" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1b2a]/85 via-[#0d1b2a]/40 to-transparent sm:bg-gradient-to-r rtl:sm:bg-gradient-to-l" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 pb-10 sm:p-8 sm:pb-12 md:p-10 md:pb-12">
              {title && <h3 className="max-w-xl text-2xl font-extrabold tracking-tight text-white drop-shadow sm:text-3xl md:text-4xl">{title}</h3>}
              {subtitle && <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">{subtitle}</p>}
              {buttonText && slide.buttonHref && (
                <div className="mt-4">
                  <Link href={slide.buttonHref} className="btn-cta px-5 py-2.5 text-sm">
                    {buttonText} <span className="inline-block rtl:rotate-180" aria-hidden>→</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                aria-label={ar ? "الشريحة السابقة" : "Previous slide"}
                onClick={() => go(-1)}
                className="absolute start-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 sm:flex"
              >
                <span className="rtl:rotate-180" aria-hidden>‹</span>
              </button>
              <button
                type="button"
                aria-label={ar ? "الشريحة التالية" : "Next slide"}
                onClick={() => go(1)}
                className="absolute end-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 sm:flex"
              >
                <span className="rtl:rotate-180" aria-hidden>›</span>
              </button>
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2" role="tablist" aria-label={ar ? "الشرائح" : "Slides"}>
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={ar ? `الشريحة ${i + 1}` : `Go to slide ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-sun" : "w-2.5 bg-white/60 hover:bg-white"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {ar ? `الشريحة ${index + 1} من ${slides.length}: ${title}` : `Slide ${index + 1} of ${slides.length}: ${title}`}
        </p>
      </div>
    </section>
  );
}
