"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { AboutData, AboutItem, AboutSection } from "@/lib/about";

const pick = (ar: boolean, en?: string, a?: string) => (ar && a ? a : en || "");

function Logo({ it, size = 52 }: { it: AboutItem; size?: number }) {
  const [bad, setBad] = useState(false);
  const mono = it.monogram || (it.org || it.title).split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 3).join("").toUpperCase();
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/15" style={{ width: size, height: size }} aria-hidden>
      {it.logo && !bad
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={it.logo} alt="" className="h-[70%] w-[70%] object-contain" loading="lazy" onError={() => setBad(true)} />
        : <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#13283d] to-[#1f4466] text-[13px] font-extrabold tracking-wide text-sun">{mono}</span>}
    </span>
  );
}

function SectionTitle({ s, ar }: { s: AboutSection; ar: boolean }) {
  return (
    <h2 className="mb-6 flex items-center gap-3 text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sun/20 text-xl" aria-hidden>{s.icon || "•"}</span>
      {pick(ar, s.title, s.titleAr)}
    </h2>
  );
}

export function AboutView({ data }: { data: AboutData }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const h = data.hero;
  return (
    <div className="pb-16" data-testid="about-page">
      <section className="relative overflow-hidden bg-header text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 end-[-6rem] h-80 w-80 rounded-full bg-sun/25 blur-3xl" />
          <div className="absolute -bottom-24 start-[-4rem] h-72 w-72 rounded-full bg-teal-brand/25 blur-3xl" />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-14 sm:px-6 md:flex-row md:py-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={h.photo} alt={pick(ar, h.name, h.nameAr)} className="h-40 w-40 shrink-0 rounded-full border-4 border-sun bg-white object-cover shadow-2xl sm:h-48 sm:w-48" data-testid="about-photo" />
          <div className="min-w-0 text-center md:text-start">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-sun">{ar ? "نبذة عني" : "About me"}</p>
            <h1 className="mt-2 font-serif text-4xl font-bold tracking-tight !text-white sm:text-5xl" data-testid="about-name">{pick(ar, h.name, h.nameAr)}</h1>
            <p className="mt-2 text-lg font-semibold text-white/85">{pick(ar, h.title, h.titleAr)}{h.location ? <span className="text-white/60"> · {pick(ar, h.location, h.locationAr)}</span> : null}</p>
            <p className="mt-5 max-w-2xl whitespace-pre-line text-[17px] leading-relaxed text-white/80">{pick(ar, h.bio, h.bioAr)}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
              <a href={`mailto:${h.email}`} className="btn-cta inline-flex items-center gap-2 px-5 py-2.5 text-sm" data-testid="about-email">✉️ {h.email}</a>
              <a href="/contact" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">{ar ? "تواصل معي" : "Get in touch"}</a>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 pt-14 sm:px-6">
        {data.sections.filter((s) => !s.hidden && (s.items.length || s.text)).map((s) => (
          <section key={s.id} data-testid="about-section" data-kind={s.kind}>
            <SectionTitle s={s} ar={ar} />
            {(s.text || s.textAr) && <p className="mb-6 max-w-3xl whitespace-pre-line leading-relaxed text-muted">{pick(ar, s.text, s.textAr)}</p>}
            {s.kind === "timeline" && (
              <ol className="relative space-y-5 border-s-2 border-sun/50 ps-6 sm:ps-8">
                {s.items.map((it) => (
                  <li key={it.id} className="relative">
                    <span className="absolute -start-[33px] top-6 h-4 w-4 rounded-full border-4 border-white bg-sun shadow sm:-start-[41px] dark:border-[#0d1b2a]" aria-hidden />
                    <div className="glass flex gap-4 rounded-[20px] p-5 transition hover:-translate-y-0.5">
                      <Logo it={it} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <h3 className="text-lg font-bold text-heading">{pick(ar, it.title, it.titleAr)}</h3>
                          {it.period && <span className="rounded-full bg-sun/20 px-3 py-0.5 text-xs font-bold text-heading">{pick(ar, it.period, it.periodAr)}</span>}
                        </div>
                        {(it.org || it.location) && (
                          <p className="mt-1 text-sm font-semibold text-muted">
                            {it.url && it.org ? <a href={it.url} target="_blank" rel="noopener" className="hover:text-primary hover:underline">{pick(ar, it.org, it.orgAr)}</a> : pick(ar, it.org, it.orgAr)}
                            {it.location ? `${it.org ? " · " : ""}${pick(ar, it.location, it.locationAr)}` : ""}
                          </p>
                        )}
                        {(it.text || it.textAr) && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{pick(ar, it.text, it.textAr)}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {s.kind === "cards" && (
              <div className="grid gap-4 md:grid-cols-2">
                {s.items.map((it) => (
                  <div key={it.id} className="glass flex gap-4 rounded-[20px] p-5">
                    <Logo it={it} />
                    <div className="min-w-0">
                      <h3 className="font-bold text-heading">{pick(ar, it.title, it.titleAr)}</h3>
                      {(it.org || it.location) && <p className="mt-1 text-sm font-semibold text-muted">{it.url && it.org ? <a href={it.url} target="_blank" rel="noopener" className="hover:text-primary hover:underline">{pick(ar, it.org, it.orgAr)}</a> : pick(ar, it.org, it.orgAr)}{it.location ? ` · ${pick(ar, it.location, it.locationAr)}` : ""}</p>}
                      {it.period && <p className="mt-1 text-xs font-bold opacity-70">{pick(ar, it.period, it.periodAr)}</p>}
                      {(it.text || it.textAr) && <p className="mt-2 text-sm text-muted">{pick(ar, it.text, it.textAr)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {s.kind === "chips" && (
              <ul className="flex flex-wrap gap-2.5">
                {s.items.map((it) => <li key={it.id} className="glass rounded-full px-4 py-2 text-sm font-semibold text-heading">{pick(ar, it.title, it.titleAr)}</li>)}
              </ul>
            )}
            {s.kind === "links" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {s.items.map((it) => (
                  <a key={it.id} href={it.url} target="_blank" rel="noopener" className="glass flex items-center gap-4 rounded-[20px] p-5 transition hover:-translate-y-0.5 hover:border-sun-border">
                    <Logo it={it} size={44} />
                    <span className="min-w-0"><span className="block font-bold text-heading">{pick(ar, it.title, it.titleAr)}</span>{(it.text || it.textAr) && <span className="block text-sm text-muted">{pick(ar, it.text, it.textAr)}</span>}</span>
                    <span className="ms-auto text-lg opacity-50" aria-hidden>↗</span>
                  </a>
                ))}
              </div>
            )}
            {s.kind === "text" && null}
          </section>
        ))}
      </div>
    </div>
  );
}
