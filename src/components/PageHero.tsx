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
    <section className="band-cream border-b border-sun-border/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && (
          <p className="eyebrow mb-2">{tx(eyebrow)}</p>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">{tx(title)}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">{tx(subtitle)}</p>}
      </div>
    </section>
  );
}
