import Link from "next/link";
import { Card } from "@/components/Card";
import { EncyclopediaCards } from "@/components/EncyclopediaCards";
import { TeacherProfileCard } from "@/components/TeacherProfileCard";
import { Section } from "@/components/Section";
import { siteConfig } from "@/content/site";
import {
  listPublishedPages,
  listPublishedVideos,
  youtubeThumbUrl,
} from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";

export default function HomePage() {
  const data = loadContentDataSync();
  const videos = listPublishedVideos(data).slice(0, 3);
  const pages = listPublishedPages(data).slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden border-b border-card-border bg-gradient-to-br from-accent-soft via-background to-gold-soft/40">
        <div className="absolute inset-0 opacity-30" aria-hidden>
          <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-gold/30 blur-3xl" />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            For students of {siteConfig.name}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Welcome to your learning home
          </h1>
          <p className="max-w-xl text-lg text-muted leading-relaxed">
            {siteConfig.tagline}. Find Quran and Hadith encyclopedias, written
            lessons, and video classes — all in one calm place.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="#libraries"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
            >
              Open learning libraries
            </a>
            <Link
              href="/videos"
              className="rounded-full border border-primary/30 bg-card px-5 py-2.5 text-sm font-medium text-primary transition hover:bg-accent-soft"
            >
              Watch video lessons
            </Link>
          </div>
        </div>
      </section>

      <Section id="libraries">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">
            Learning libraries
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Trusted encyclopedias
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Open these on this site while you study — or use Open in new tab inside each encyclopedia page.
          </p>
        </div>
        <EncyclopediaCards />
      </Section>

      <Section className="pt-0">
        <TeacherProfileCard teacher={data.teacher} />
      </Section>

      <section className="border-y border-card-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Video lessons
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Latest from your teacher
              </h2>
            </div>
            <Link href="/videos" className="text-sm font-medium text-primary hover:underline">
              All videos →
            </Link>
          </div>
          {videos.length === 0 ? (
            <p className="text-sm text-muted">No published videos yet. Check back soon.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {videos.map((video) => (
                <Link key={video.id} href={`/videos#${video.id}`} className="group">
                  <Card className="h-full overflow-hidden p-0 transition group-hover:border-primary/40">
                    <div className="relative aspect-video overflow-hidden bg-accent-soft">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={youtubeThumbUrl(video.youtubeId)}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="p-5">
                      <h3 className="font-semibold group-hover:text-primary">{video.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm text-muted">{video.description}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Section>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Resources
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Learning pages
            </h2>
          </div>
          <Link href="/lessons" className="text-sm font-medium text-primary hover:underline">
            All lessons →
          </Link>
        </div>
        {pages.length === 0 ? (
          <p className="text-sm text-muted">No published lessons yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {pages.map((page) => (
              <Link key={page.id} href={`/lessons/${page.slug}`} className="group">
                <Card className="h-full transition group-hover:border-primary/40">
                  <h3 className="text-lg font-semibold group-hover:text-primary">{page.title}</h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{page.excerpt}</p>
                  <p className="mt-4 text-sm font-medium text-primary">Read lesson →</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <section className="border-t border-card-border bg-gradient-to-r from-primary to-primary/85 text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Need the student portal?
            </h2>
            <p className="mt-2 max-w-xl text-sm text-primary-foreground/85">
              Use Login for class communications, timetables, and school materials.
              This learning site stays open for encyclopedias, lessons, and videos.
            </p>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-foreground shadow transition hover:opacity-90"
          >
            Portal Login
          </Link>
        </div>
      </section>
    </>
  );
}
