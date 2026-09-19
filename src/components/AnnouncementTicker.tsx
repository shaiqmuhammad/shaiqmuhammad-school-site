import Link from "next/link";
import { announcements } from "@/content/announcements";

export function AnnouncementTicker() {
  if (announcements.length === 0) return null;

  const items = [...announcements, ...announcements];

  return (
    <div className="border-b border-card-border bg-accent-soft text-sm text-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
          News
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="animate-ticker flex w-max gap-10 whitespace-nowrap">
            {items.map((item, index) => {
              const content = (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="text-primary">
                    •
                  </span>
                  {item.text}
                </span>
              );
              return item.href ? (
                <Link
                  key={`${item.id}-${index}`}
                  href={item.href}
                  className="hover:text-primary hover:underline"
                >
                  {content}
                </Link>
              ) : (
                <span key={`${item.id}-${index}`}>{content}</span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
