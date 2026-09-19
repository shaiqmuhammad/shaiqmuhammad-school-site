import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { accreditation, history, mission, vision } from "@/content/about";

export const metadata: Metadata = {
  title: "About",
  description: "Mission, vision, history, and quality assurance at Shaiq Muhammad.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title="Who we are"
        subtitle="An independent Dubai school built on curiosity, character, and community — with no affiliation to any other institution."
      />
      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="text-xl font-semibold">Mission</h2>
            <p className="mt-3 text-muted leading-relaxed">{mission}</p>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Vision</h2>
            <p className="mt-3 text-muted leading-relaxed">{vision}</p>
          </Card>
        </div>
      </Section>
      <Section className="pt-0">
        <h2 className="text-2xl font-semibold tracking-tight">Our history</h2>
        <ol className="mt-8 space-y-6 border-l border-card-border pl-6">
          {history.map((item) => (
            <li key={item.year} className="relative">
              <span className="absolute -left-[1.7rem] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary" />
              <p className="text-sm font-semibold text-primary">{item.year}</p>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section className="pt-0">
        <h2 className="text-2xl font-semibold tracking-tight">Accreditation &amp; quality</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Statements below describe our approach. They are illustrative and do not claim
          affiliation with any named board or real Dubai school brand.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {accreditation.map((item) => (
            <Card key={item.title}>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{item.body}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
