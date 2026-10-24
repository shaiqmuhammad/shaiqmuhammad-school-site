import type { Metadata } from "next";
import { listPublishedPages } from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";
import { LessonRedirect } from "@/components/LessonPages";

type PageProps = { params: Promise<{ slug: string }> };
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return listPublishedPages(loadContentDataSync()).map((p) => ({ slug: p.slug }));
}

export default async function LessonDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <LessonRedirect slug={slug} />;
}
