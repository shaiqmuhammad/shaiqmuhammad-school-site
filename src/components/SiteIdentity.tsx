"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { siteConfig } from "@/content/site";
import { useI18n } from "@/lib/i18n";
import {
  cacheIdentity, cachedIdentity, displayName, displayTagline, fetchIdentity, IDENTITY_EVENT, themeCss, type SiteIdentity,
} from "@/lib/siteIdentity";

const Ctx = createContext<SiteIdentity | null>(null);
const STYLE_ID = "sm-site-theme";

/** Applies a theme (also used by the live preview in Admin → Site & branding). */
export function applyThemeCss(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement("style"); el.id = STYLE_ID; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}

/**
 * Loads the saved site name / tagline / colours at runtime (cached on the device for an instant first paint)
 * and applies them site-wide: CSS colour variables, header/footer names and the browser tab title.
 */
export function SiteIdentityProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<SiteIdentity | null>(null);
  const { lang } = useI18n();
  const { setTheme } = useTheme();

  useEffect(() => {
    const load = () => setId(cachedIdentity());
    load();
    fetchIdentity().then((fresh) => { cacheIdentity(fresh); }).catch(() => undefined);
    window.addEventListener(IDENTITY_EVENT, load);
    return () => window.removeEventListener(IDENTITY_EVENT, load);
  }, []);

  // Colours (the Branding page previews its own draft and restores this afterwards).
  useEffect(() => {
    if (document.documentElement.dataset.brandPreview === "1") return;
    applyThemeCss(id ? themeCss(id.theme) : "");
  }, [id]);

  // Default light/dark for visitors who never picked one themselves.
  useEffect(() => {
    if (!id || id.theme.mode !== "dark") return;
    try {
      if (!localStorage.getItem("theme")) setTheme("dark");
    } catch {
      // storage unavailable
    }
  }, [id, setTheme]);

  // Tab titles: swap the built-in name for the chosen one.
  useEffect(() => {
    const name = displayName(id, lang);
    if (!id || name === siteConfig.name) return;
    const fix = () => {
      if (document.title.includes(siteConfig.name)) document.title = document.title.split(siteConfig.name).join(name);
    };
    fix();
    const t = document.querySelector("title");
    const mo = new MutationObserver(fix);
    if (t) mo.observe(t, { childList: true, characterData: true, subtree: true });
    mo.observe(document.head, { childList: true });
    return () => mo.disconnect();
  }, [id, lang]);

  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

export function useSiteIdentity(): SiteIdentity | null {
  return useContext(Ctx);
}

/** Site name in the current language (built-in default until one is saved). */
export function useSiteName(): string {
  const id = useSiteIdentity();
  const { lang } = useI18n();
  return displayName(id, lang);
}

/** Saved tagline in the current language, or "" to keep the built-in text. */
export function useSiteTagline(): string {
  const id = useSiteIdentity();
  const { lang } = useI18n();
  return displayTagline(id, lang);
}

/** Site name as plain text (for spots that only need the words). */
export function SiteNameText() {
  return <>{useSiteName()}</>;
}
