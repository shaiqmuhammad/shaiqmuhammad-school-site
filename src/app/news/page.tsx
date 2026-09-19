import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { newsPosts } from "@/content/news";

export const metadata: Metadata = {
  title: "News",
  description: "School news and announcements from Shaiq Muhammad.",
};

export default function NewsPage() {
  return (
    <>
      <PageHero
        eyebrow="Updates"
        title="News & announcements"
        subtitle="Stories from campus life, admissions dates, and community events."
      />
      <Section>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {newsPosts.map((post) => (
            <Link key={post.slug} href={`/news/${post.slug}`} className="group">
              <Card className="h-full overflow-hidden p-0 transition group-hover:border-primary/40">
                <div className="relative aspect-[16/10] bg-accent-soft">
                  <Image
                    src={`https://picsum.photos/seed/${post.imageSeed}/800/500`}
                    alt=""
                    fill
                    className="object-cover transition group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {post.category}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted">{post.excerpt}</p>
                  <p className="mt-3 text-xs text-muted">
                    {new Date(post.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
