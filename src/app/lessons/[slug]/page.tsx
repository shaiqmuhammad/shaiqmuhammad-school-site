import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import {
  getPageBySlug,
  listPublishedPages,
} from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";
import { renderMarkdownLite } from "@/lib/markdownLite";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listPublishedPages(loadContentDataSync()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPageBySlug(loadContentDataSync(), slug);
  if (!page) return { title: "Lesson" };
  return { title: page.title, description: page.excerpt };
}

export default async function LessonDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPageBySlug(loadContentDataSync(), slug);
  if (!page) notFound();

  const html = renderMarkdownLite(page.body);

  return (
    <>
      <PageHero eyebrow="Lesson" title={page.title} subtitle={page.excerpt} />
      <Section className="pt-8">
        <Link href="/lessons" className="text-sm font-medium text-primary hover:underline">
          ← All lessons
        </Link>
        <article
          className="prose-lesson mt-8 max-w-3xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="mt-10 text-xs text-muted">
          Updated{" "}
          {new Date(page.updatedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </Section>
    </>
  );
}
