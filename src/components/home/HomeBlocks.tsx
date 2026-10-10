"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { youtubeId, type HomeSection } from "@/lib/homepage";

/** Picks the Arabic text when the site is in Arabic and one was given. */
export function Bi({ en, ar, fallback = "" }: { en?: string; ar?: string; fallback?: string }) {
  const { lang } = useI18n();
  return <>{(lang === "ar" && ar) || en || fallback}</>;
}

function Heading({ s, h1 = false }: { s: HomeSection; h1?: boolean }) {
  const H = h1 ? "h1" : "h2";
  return (
    <>
      {(s.eyebrow || s.eyebrowAr) && <p className="eyebrow"><Bi en={s.eyebrow} ar={s.eyebrowAr} /></p>}
      {(s.title || s.titleAr) && <H className={`mt-2 font-extrabold tracking-tight text-heading ${h1 ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}><Bi en={s.title} ar={s.titleAr} /></H>}
    </>
  );
}

function Para({ s }: { s: HomeSection }) {
  if (!s.text && !s.textAr) return null;
  return <p className="mt-3 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-muted" dir="auto"><Bi en={s.text} ar={s.textAr} /></p>;
}

function Btn({ s, primary = true }: { s: HomeSection; primary?: boolean }) {
  if (!s.button?.href) return null;
  const ext = /^https?:/i.test(s.button.href);
  const cls = `${primary ? "btn-cta" : "btn-glass"} inline-flex px-5 py-2.5 text-sm`;
  return ext ? <a href={s.button.href} target="_blank" rel="noopener" className={cls}><Bi en={s.button.label} ar={s.button.labelAr} /></a> : <Link href={s.button.href} className={cls}><Bi en={s.button.label} ar={s.button.labelAr} /></Link>;
}

/** Admin-made sections: text, image + text, call-to-action, YouTube, cards grid. */
export function CustomSection({ s }: { s: HomeSection }) {
  const wrap = "mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8";
  if (s.kind === "cta") return (
    <section className={wrap} data-testid="home-custom" data-kind="cta">
      <div className="relative overflow-hidden rounded-[24px] bg-header px-6 py-10 text-white shadow-lg sm:px-10">
        <div aria-hidden className="absolute -end-10 -top-10 h-48 w-48 rounded-full bg-sun/30 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1 [&_h2]:!text-white [&_p]:!text-white/80"><Heading s={s} /><Para s={s} /></div>
          <Btn s={s} />
        </div>
      </div>
    </section>
  );
  if (s.kind === "imageText") return (
    <section className={wrap} data-testid="home-custom" data-kind="imageText">
      <div className={`glass flex flex-col items-center gap-8 rounded-[20px] p-6 sm:p-10 md:flex-row ${s.imageSide === "end" ? "md:flex-row-reverse" : ""}`}>
        {s.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.image} alt="" className="w-full max-w-md rounded-2xl object-cover shadow-md md:w-2/5" />
        )}
        <div className="min-w-0 flex-1"><Heading s={s} /><Para s={s} /><div className="mt-5"><Btn s={s} /></div></div>
      </div>
    </section>
  );
  if (s.kind === "youtube") {
    const id = youtubeId(s.youtube);
    return (
      <section className={wrap} data-testid="home-custom" data-kind="youtube">
        <Heading s={s} /><Para s={s} />
        {id && <div className="mt-6 aspect-video overflow-hidden rounded-[20px] shadow-lg"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${id}`} title={s.title || "Video"} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" /></div>}
      </section>
    );
  }
  if (s.kind === "cards") return (
    <section className={wrap} data-testid="home-custom" data-kind="cards">
      <Heading s={s} /><Para s={s} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(s.cards || []).map((c, i) => {
          const body = (
            <div className="glass h-full overflow-hidden rounded-[20px] transition hover:-translate-y-0.5">
              {c.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" className="aspect-video w-full object-cover" />
              )}
              <div className="p-5"><h3 className="text-lg font-bold text-heading"><Bi en={c.title} ar={c.titleAr} /></h3>{(c.text || c.textAr) && <p className="mt-2 text-sm leading-relaxed text-muted"><Bi en={c.text} ar={c.textAr} /></p>}</div>
            </div>
          );
          return c.href ? <a key={i} href={c.href} className="block">{body}</a> : <div key={i}>{body}</div>;
        })}
      </div>
    </section>
  );
  return (
    <section className={wrap} data-testid="home-custom" data-kind="text">
      <div className="glass rounded-[20px] px-6 py-8 sm:px-10"><Heading s={s} /><Para s={s} /><div className="mt-5"><Btn s={s} /></div></div>
    </section>
  );
}

/** Built-in intro block with optional overrides from the builder. */
export function IntroBlock({ s, name, tagline }: { s: HomeSection; name: string; tagline: string }) {
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <div className="glass glass-emph flex flex-col gap-5 rounded-[20px] px-6 py-10 sm:px-10 sm:py-12">
          <p className="eyebrow"><Bi en={s.eyebrow} ar={s.eyebrowAr} fallback={`For students of ${name}`} /></p>
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-heading sm:text-5xl"><Bi en={s.title} ar={s.titleAr} fallback="Welcome to your learning home" /></h1>
          <p className="max-w-xl whitespace-pre-line text-lg leading-relaxed text-muted"><Bi en={s.text} ar={s.textAr} fallback={`${tagline}. Find Quran and Hadith encyclopedias, written lessons, video classes, and assessments — all in one calm place.`} /></p>
          <div className="flex flex-wrap gap-3 pt-2">
            {s.button?.href ? <Btn s={s} /> : <a href="#libraries" className="btn-cta px-5 py-2.5 text-sm">Open learning libraries</a>}
            <Link href="/videos" className="btn-glass px-5 py-2.5 text-sm">Watch video lessons</Link>
            <Link href="/assessments" className="btn-glass px-5 py-2.5 text-sm">Take an assessment</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Small heading used by the built-in libraries/videos/lessons blocks when overridden. */
export function BlockHeading({ s, eyebrow, title, text }: { s: HomeSection; eyebrow: string; title: string; text?: string }) {
  return (
    <div>
      <p className="eyebrow"><Bi en={s.eyebrow} ar={s.eyebrowAr} fallback={eyebrow} /></p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl"><Bi en={s.title} ar={s.titleAr} fallback={title} /></h2>
      {(text || s.text) && <p className="mt-2 max-w-2xl text-muted max-sm:hidden"><Bi en={s.text} ar={s.textAr} fallback={text} /></p>}
    </div>
  );
}
