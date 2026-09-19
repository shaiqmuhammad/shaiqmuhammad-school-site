type Props = {
  title: string;
  description: string;
  src: string;
  externalUrl: string;
};

export function EncyclopediaEmbed({ title, description, src, externalUrl }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-primary/30 bg-accent-soft px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          Open in new tab ↗
        </a>
      </div>
      <div className="relative min-h-[70vh] flex-1 bg-background">
        <iframe
          title={title}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen"
        />
        <noscript>
          <div className="p-6 text-sm text-muted">
            JavaScript is required to embed this encyclopedia.{" "}
            <a href={externalUrl} className="text-primary underline" target="_blank" rel="noopener noreferrer">
              Open {title} in a new tab
            </a>
            .
          </div>
        </noscript>
      </div>
      <p className="border-t border-card-border bg-accent-soft/50 px-4 py-2 text-center text-xs text-muted sm:px-6">
        If the encyclopedia does not appear above (some browsers block embeds), use{" "}
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Open in new tab
        </a>
        .
      </p>
    </div>
  );
}
