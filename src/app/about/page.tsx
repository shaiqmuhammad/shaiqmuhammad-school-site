import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { EncyclopediaCards } from "@/components/EncyclopediaCards";
import { TeacherProfileCard } from "@/components/TeacherProfileCard";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { history, mission, values, vision } from "@/content/about";
import { siteConfig } from "@/content/site";
import { loadContentDataSync } from "@/lib/contentServer";

export const metadata: Metadata = {
  title: "About",
  description: `About the ${siteConfig.name} student learning platform.`,
};

export default function AboutPage() {
  const { teacher } = loadContentDataSync();
  return (
    <>
      <PageHero
        eyebrow="About"
        title={`Learning with ${siteConfig.name}`}
        subtitle="An educational platform for students — encyclopedias, lessons, and video classes in one calm place."
      />
      <Section>
        <div className="mb-10">
          <TeacherProfileCard teacher={teacher} />
        </div>
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
        <h2 className="text-2xl font-semibold tracking-tight">How this platform works</h2>
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
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">Our values</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {values.map((item) => (
            <Card key={item.title}>
              <h3 className="font-semibold text-primary">{item.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{item.body}</p>
            </Card>
          ))}
        </div>
      </Section>
      <Section className="pt-0">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight">Learning libraries</h2>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          Primary study companions — open on this site anytime.
        </p>
        <EncyclopediaCards compact />
      </Section>
    </>
  );
}
