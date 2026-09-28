"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Banner } from "@/lib/banners";

export function BannerCarousel({ banners }: { banners: Banner[] }) {
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
  const slide = slides[index];

  return (
    <section
      className="relative overflow-hidden border-b border-card-border bg-card"
      aria-roledescription="carousel"
      aria-label="Featured banners"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
          <div className="relative aspect-[21/9] min-h-[180px] w-full bg-accent-soft sm:min-h-[240px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={slide.id}
              src={slide.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/35 to-black/10" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8 md:p-10">
              {slide.title && (
                <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-white drop-shadow sm:text-3xl md:text-4xl">
                  {slide.title}
                </h2>
              )}
              {slide.subtitle && (
                <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">{slide.subtitle}</p>
              )}
              {slide.buttonText && slide.buttonHref && (
                <div className="mt-4">
                  <Link
                    href={slide.buttonHref}
                    className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
                  >
                    {slide.buttonText}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() => go(-1)}
                className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow hover:bg-white"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() => go(1)}
                className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow hover:bg-white"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2" role="tablist" aria-label="Slides">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={`h-2.5 w-2.5 rounded-full transition ${i === index ? "bg-white scale-110" : "bg-white/50 hover:bg-white/80"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          Slide {index + 1} of {slides.length}: {slide.title}
        </p>
      </div>
    </section>
  );
}

