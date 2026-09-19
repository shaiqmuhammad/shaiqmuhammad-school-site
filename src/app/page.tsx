import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Section } from "@/components/Section";
import { homeStats, testimonials } from "@/content/home";
import { newsPosts } from "@/content/news";
import { siteConfig } from "@/content/site";

export default function HomePage() {
  const latestNews = newsPosts.slice(0, 3);

  return (
    <>
      <section className="relative overflow-hidden border-b border-card-border">
        <div className="absolute inset-0">
          <Image
            src="https://picsum.photos/seed/sm-hero/1600/900"
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/80 via-stone-950/55 to-stone-950/25" />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-24 sm:px-6 sm:py-32">
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-200">
            {siteConfig.location}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {siteConfig.name}
          </h1>
          <p className="max-w-xl text-lg text-stone-200">{siteConfig.tagline}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/admissions"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
            >
              Apply / Enquire
            </Link>
            <Link
              href="/about"
              className="rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
            >
              About the school
            </Link>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              About snapshot
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              A warm, ambitious community in Dubai
            </h2>
            <p className="mt-4 text-muted leading-relaxed">
              {siteConfig.description} We are an independent day school — not
              affiliated with any other Dubai institution — serving families who
              value academic stretch, pastoral care, and a genuinely inclusive culture.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Read our mission &amp; history →
            </Link>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-card-border shadow-sm">
            <Image
              src="https://picsum.photos/seed/sm-campus/800/600"
              alt="Campus courtyard"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </Section>

      <section className="border-y border-card-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {homeStats.map((stat) => (
            <div key={stat.label} className="text-center sm:text-left">
              <p className="text-3xl font-semibold text-primary">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{stat.label}</p>
              <p className="text-xs text-muted">({stat.note})</p>
            </div>
          ))}
        </div>
      </section>

      <Section>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Voices
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              What families say
            </h2>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.id}>
              <p className="text-sm leading-relaxed text-foreground">&ldquo;{t.quote}&rdquo;</p>
              <p className="mt-4 text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-muted">{t.role}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Latest
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              News &amp; announcements
            </h2>
          </div>
          <Link href="/news" className="text-sm font-medium text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {latestNews.map((post) => (
            <Link key={post.slug} href={`/news/${post.slug}`} className="group">
              <Card className="h-full transition group-hover:border-primary/40">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {post.category}
                </p>
                <h3 className="mt-2 text-lg font-semibold group-hover:text-primary">
                  {post.title}
                </h3>
                <p className="mt-2 text-sm text-muted">{post.excerpt}</p>
                <p className="mt-4 text-xs text-muted">
                  {new Date(post.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
