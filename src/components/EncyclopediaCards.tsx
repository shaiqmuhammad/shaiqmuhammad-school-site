import Link from "next/link";
import { encyclopediaLinks } from "@/content/site";
import { HadithScrollIcon, QuranBookIcon } from "@/components/EncyclopediaIcons";

const icons = {
  quran: QuranBookIcon,
  hadith: HadithScrollIcon,
} as const;

export function EncyclopediaCards({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-5 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
      {encyclopediaLinks.map((item) => {
        const Icon = icons[item.id];
        return (
          <Link
            key={item.id}
            href={item.href}
            className="group relative overflow-hidden rounded-2xl border border-card-border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-8"
          >
            <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gold-soft opacity-60 transition group-hover:scale-110" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-primary shadow-sm ring-1 ring-primary/10">
                <Icon className="h-8 w-8" />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-foreground group-hover:text-primary sm:text-xl">
                  {item.label}
                </h3>
                {!compact && (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {item.description}
                  </p>
                )}
                <p className="mt-3 text-sm font-medium text-primary">
                  Open on this site →
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
