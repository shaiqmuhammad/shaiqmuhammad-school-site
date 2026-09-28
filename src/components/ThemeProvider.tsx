"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/lib/i18n";

/**
 * Light by default; visitors can switch to dark with the header toggle.
 * next-themes stores the choice in localStorage ("theme") and sets class="dark" on <html>,
 * so /admin shares the same preference as the public site.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <LanguageProvider>{children}</LanguageProvider>
    </NextThemesProvider>
  );
}
