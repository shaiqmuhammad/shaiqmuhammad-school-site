import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { listPublishedPages } from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";

export const metadata: Metadata = {
  title: "Lessons",
  description: "Written learning pages and resources for students of Shaiq Muhammad.",
};

export default function LessonsPage() {
  const pages = listPublishedPages(loadContentDataSync());

  return (
    <>
      <PageHero
        eyebrow="Lessons"
        title="Learning pages"
        subtitle="Notes, summaries, and guidance from your teacher — read at your own pace."
      />
      <Section>
        {pages.length === 0 ? (
          <p className="text-muted">No published lessons yet. Please check back soon.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {pages.map((page) => (
              <Link key={page.id} href={`/lessons/${page.slug}`} className="group">
                <Card className="h-full transition group-hover:border-primary/40">
                  <h2 className="text-lg font-semibold group-hover:text-primary">
                    {page.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{page.excerpt}</p>
                  <p className="mt-4 text-xs text-muted">
                    Updated{" "}
                    {new Date(page.updatedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
