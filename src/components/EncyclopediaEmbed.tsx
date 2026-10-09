type Props = {
  title: string;
  description: string;
  src: string;
};

export function EncyclopediaEmbed({ title, description, src }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
      </div>
      <div className="relative min-h-[70vh] flex-1 bg-background">
        <iframe
          title={title}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          // Sandboxed: scripts, logins/forms and links that open new tabs still work inside the embed,
          // but the embedded site can't navigate this page away (no allow-top-navigation).
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          // Audio recitations (quran.com) need autoplay/encrypted-media.
          allow="autoplay; encrypted-media; fullscreen; clipboard-write"
        />
        <noscript>
          <div className="p-6 text-sm text-muted">
            JavaScript is required to embed this encyclopedia.
          </div>
        </noscript>
      </div>
    </div>
  );
}
