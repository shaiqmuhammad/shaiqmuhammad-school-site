"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  brandUrl, DEFAULT_LOGO_URL, emptyBrand, emptySocial,
  type BrandSettings, type SocialLinks,
} from "@/lib/siteSettings";

type SiteBrand = { brand: BrandSettings; social: SocialLinks };

const SiteBrandContext = createContext<SiteBrand>({ brand: emptyBrand, social: emptySocial });

/** Provides build-time branding + social links (from settings.json) to client components. */
export function SiteBrandProvider({ brand, social, children }: SiteBrand & { children: ReactNode }) {
  return <SiteBrandContext.Provider value={{ brand, social }}>{children}</SiteBrandContext.Provider>;
}

export function useSiteBrand(): SiteBrand {
  return useContext(SiteBrandContext);
}

/** Uploaded logo (cache-busted) or the built-in /logo.svg. */
export function useLogoUrl(): string {
  const { brand } = useSiteBrand();
  return brandUrl(brand.logoPath, brand.version, DEFAULT_LOGO_URL);
}
