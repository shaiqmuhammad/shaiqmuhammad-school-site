"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Phones (iOS Safari / Android Chrome) paint the status-bar / top toolbar area with <meta name="theme-color">.
 * Without it Safari shows a translucent, blurred strip of the page behind it. Keep it opaque and equal to the
 * colour of whatever bar is at the very top of the current page (navy LMS/site header, white admin bar, dark mode).
 */
export function ThemeColor() {
  const pathname = usePathname() || "";
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    const m = meta;
    const pick = () => {
      let el: Element | null = document.elementFromPoint(Math.round(window.innerWidth / 2), 1);
      while (el && el !== document.documentElement) {
        const c = getComputedStyle(el).backgroundColor;
        const a = c.match(/rgba?\(([^)]+)\)/)?.[1].split(",").map((x) => parseFloat(x));
        if (a && (a.length < 4 || a[3] >= 0.99)) { if (m.content !== c) m.content = c; return; }
        el = el.parentElement;
      }
      m.content = resolvedTheme === "dark" ? "#0d1b2a" : "#ffffff";
    };
    pick();
    const t = [setTimeout(pick, 400), setTimeout(pick, 1500), setTimeout(pick, 4000)];
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(pick); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { t.forEach(clearTimeout); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [pathname, resolvedTheme]);
  return null;
}
