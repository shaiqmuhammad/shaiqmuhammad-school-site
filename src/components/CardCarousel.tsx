"use client";

import Link from "next/link";
import { Children, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

const arrowBtn =
  "glass glass-emph inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold text-heading transition hover:bg-[var(--cta)] hover:text-[var(--cta-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun disabled:pointer-events-none disabled:opacity-35";

/**
 * Horizontal card slider built on CSS scroll-snap (no dependencies).
 * 1 card + a peek of the next on phones, 2 on tablets, 3 on desktop.
 * Swipe / trackpad / mouse-drag, small yellow-glass prev/next buttons in the heading row, arrow keys,
 * tiny progress dots. Works in RTL.
 */
export function CardCarousel({
  children,
  label,
  labelAr,
  testId,
  heading,
  moreHref,
  moreTestId,
}: {
  children: ReactNode;
  label: string;
  labelAr?: string;
  testId?: string;
  /** Section heading shown at the start of the control row. */
  heading?: ReactNode;
  /** Small "Show more →" link in the heading row. */
  moreHref?: string;
  moreTestId?: string;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const items = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ atStart: true, atEnd: items.length <= 1, page: 0, pages: 1 });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // RTL scrollLeft is negative in modern browsers
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0") : el.clientWidth;
    const perView = Math.max(1, Math.round(el.clientWidth / step));
    const pages = Math.max(1, Math.ceil(items.length / perView));
    const page = pos >= max - 4 ? pages - 1 : Math.min(pages - 1, Math.round(pos / (step * perView)));
    setState({ atStart: pos <= 4, atEnd: pos >= max - 4, page, pages });
  }, [items.length]);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  /** dir +1 = forward in reading order (right in English, left in Arabic). */
  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const sign = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    el.scrollBy({ left: dir * sign * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    e.preventDefault();
    const rtl = track.current ? getComputedStyle(track.current).direction === "rtl" : ar;
    go((e.key === "ArrowRight") !== rtl ? 1 : -1);
  };

  // Mouse drag (touch and trackpads already scroll natively).
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !track.current) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const el = track.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      el.style.scrollSnapType = "none";
      el.style.scrollBehavior = "auto";
    }
    if (d.moved) el.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const el = track.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d?.moved) return;
    el.style.scrollSnapType = "";
    el.style.scrollBehavior = "";
    // Swallow the click that follows a drag so cards don't open by accident.
    const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
    el.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 50);
  };

  const showNav = !(state.atStart && state.atEnd);

  const controls = (
    <div className="flex shrink-0 items-center gap-2">
      {moreHref && <ShowMoreLink href={moreHref} testId={moreTestId} />}
      {showNav && (
        <div className="flex gap-1.5">
          <button type="button" className={arrowBtn} onClick={() => go(-1)} disabled={state.atStart} aria-label={ar ? "السابق" : "Previous"} data-testid={testId ? `${testId}-prev` : undefined}>
            <span className="inline-block rtl:rotate-180" aria-hidden>←</span>
          </button>
          <button type="button" className={arrowBtn} onClick={() => go(1)} disabled={state.atEnd} aria-label={ar ? "التالي" : "Next"} data-testid={testId ? `${testId}-next` : undefined}>
            <span className="inline-block rtl:rotate-180" aria-hidden>→</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div role="region" aria-roledescription={ar ? "شريط عرض" : "carousel"} aria-label={ar && labelAr ? labelAr : label} data-testid={testId} onKeyDown={onKey}>
      {(heading || moreHref || showNav) && (
        <div className={`flex items-end gap-x-4 gap-y-2 ${heading ? "mb-6 justify-between" : "mb-3 justify-end"}`}>
          {heading && <div className="min-w-0">{heading}</div>}
          {controls}
        </div>
      )}
      <div
        ref={track}
        tabIndex={0}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-6 overflow-x-auto scroll-smooth px-4 pb-3 pt-1 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun sm:-mx-1 sm:scroll-px-1 sm:px-1 [&::-webkit-scrollbar]:hidden"
        data-testid={testId ? `${testId}-track` : undefined}
      >
        {items.map((child, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription={ar ? "بطاقة" : "slide"}
            aria-label={ar ? `${i + 1} من ${items.length}` : `${i + 1} of ${items.length}`}
            className="flex w-[85%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] [&>*]:w-full"
          >
            {child}
          </div>
        ))}
      </div>
      {showNav && state.pages > 1 && (
        // Tiny position indicator only; the arrows, keys and swipe do the navigating.
        <div className="mt-1 flex justify-center gap-1" aria-hidden data-testid={testId ? `${testId}-dots` : undefined}>
          {Array.from({ length: state.pages }, (_, p) => (
            <span key={p} className={`h-1.5 rounded-full transition-all ${p === state.page ? "w-4 bg-[var(--cta)]" : "w-1.5 bg-[var(--card-border)]"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Small "Show more →" text link for a section's heading row (tap area ≥ 32px). */
export function ShowMoreLink({ href, testId }: { href: string; testId?: string }) {
  const { lang } = useI18n();
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2 text-sm font-semibold text-primary transition hover:bg-[var(--cta)] hover:text-[var(--cta-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun"
      data-testid={testId}
    >
      {lang === "ar" ? "عرض المزيد" : "Show more"} <span className="inline-block rtl:rotate-180" aria-hidden>→</span>
    </Link>
  );
}
