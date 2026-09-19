import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { curriculumOverview, programmes } from "@/content/academics";

export const metadata: Metadata = {
  title: "Academics",
  description: "Programmes and curriculum overview from Early Years to Sixth Form.",
};

export default function AcademicsPage() {
  return (
    <>
      <PageHero
        eyebrow="Learning"
        title="Academics"
        subtitle="A continuous pathway from Foundation Stage to Sixth Form, rooted in enquiry and high expectations."
      />
      <Section>
        <h2 className="text-2xl font-semibold tracking-tight">Programmes</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {programmes.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {p.ages}
              </p>
              <h3 className="mt-2 text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{p.summary}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-foreground">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="text-primary" aria-hidden>
                      ✓
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>
      <Section className="pt-0">
        <h2 className="text-2xl font-semibold tracking-tight">Curriculum overview</h2>
        <p className="mt-3 max-w-3xl text-muted leading-relaxed">
          {curriculumOverview.intro}
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {curriculumOverview.pillars.map((pillar) => (
            <Card key={pillar.title}>
              <h3 className="font-semibold">{pillar.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{pillar.body}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
