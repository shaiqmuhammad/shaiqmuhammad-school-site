"use client";

import { useI18n } from "@/lib/i18n";

type PageHeroProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export function PageHero({ title, subtitle, eyebrow }: PageHeroProps) {
  const { tx } = useI18n();
  return (
    <section className="border-b border-card-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{tx(eyebrow)}</p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{tx(title)}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">{tx(subtitle)}</p>}
      </div>
    </section>
  );
}
