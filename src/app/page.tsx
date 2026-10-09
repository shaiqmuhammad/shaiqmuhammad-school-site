import Link from "next/link";
import { AssessmentCards, HomeAssessmentsHeading } from "@/components/assessment/AssessmentCards";
import { BannerCarousel } from "@/components/BannerCarousel";
import { Card } from "@/components/Card";
import { CardCarousel } from "@/components/CardCarousel";
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
import { listPublishedBanners } from "@/lib/banners";
import { loadBannersSync } from "@/lib/bannersServer";
import { listPublishedQuizzes } from "@/lib/quiz";
import { loadQuizzesSync } from "@/lib/quizServer";

export default function HomePage() {
  const data = loadContentDataSync();
  const videos = listPublishedVideos(data).slice(0, 9);
  const pages = listPublishedPages(data).slice(0, 9);
  const banners = listPublishedBanners(loadBannersSync());
  const quizzes = listPublishedQuizzes(loadQuizzesSync());

  return (
    <>
      <BannerCarousel banners={banners} />

      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="glass glass-emph flex flex-col gap-5 rounded-[20px] px-6 py-10 sm:px-10 sm:py-12">
          <p className="eyebrow">
            For students of {siteConfig.name}
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-heading sm:text-5xl">
            Welcome to your learning home
          </h1>
          <p className="max-w-xl text-lg text-muted leading-relaxed">
            {siteConfig.tagline}. Find Quran and Hadith encyclopedias, written
            lessons, video classes, and assessments — all in one calm place.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="#libraries"
              className="btn-cta px-5 py-2.5 text-sm"
            >
              Open learning libraries
            </a>
            <Link
              href="/videos"
              className="btn-glass px-5 py-2.5 text-sm"
            >
              Watch video lessons
            </Link>
            <Link
              href="/assessments"
              className="btn-glass px-5 py-2.5 text-sm"
            >
              Take an assessment
            </Link>
          </div>
        </div>
        </div>
      </section>

      {quizzes.length > 0 && (
        <Section id="assessments">
          {/* Slider of the most recent visible assessments (inactive ones stay locked as before). */}
          <AssessmentCards quizzes={quizzes.slice(0, 9)} carousel heading={<HomeAssessmentsHeading />} moreHref="/assessments" />
        </Section>
      )}

      <Section id="libraries">
        <EncyclopediaCards
          carousel
          heading={
            <div>
              <p className="eyebrow">Learning libraries</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Trusted encyclopedias</h2>
              <p className="mt-2 max-w-2xl text-muted max-sm:hidden">
                Open these on this site while you study — encyclopedias stay embedded on the page.
              </p>
            </div>
          }
        />
      </Section>

      <Section className="pt-0">
        <TeacherProfileCard teacher={data.teacher} />
      </Section>

      <section className="band-cream border-y border-sun-border/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          {videos.length === 0 ? (
            <>
              <div className="mb-8">
                <p className="eyebrow">Video lessons</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Latest from your teacher</h2>
              </div>
              <p className="text-sm text-muted">No published videos yet. Check back soon.</p>
            </>
          ) : (
            <CardCarousel
              label="Video lessons"
              labelAr="دروس الفيديو"
              testId="home-videos-carousel"
              moreHref="/videos"
              moreTestId="home-videos-more"
              heading={
                <div>
                  <p className="eyebrow">Video lessons</p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Latest from your teacher</h2>
                </div>
              }
            >
              {videos.map((video) => (
                <Link key={video.id} href={`/videos#${video.id}`} className="group">
                  <Card className="h-full overflow-hidden p-0! transition group-hover:-translate-y-0.5 group-hover:border-sun-border">
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
            </CardCarousel>
          )}
        </div>
      </section>

      <Section>
        {pages.length === 0 ? (
          <>
            <div className="mb-8">
              <p className="eyebrow">Resources</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Learning pages</h2>
            </div>
            <p className="text-sm text-muted">No published lessons yet.</p>
          </>
        ) : (
          <CardCarousel
            label="Learning pages"
            labelAr="صفحات التعلّم"
            testId="home-lessons-carousel"
            moreHref="/lessons"
            moreTestId="home-lessons-more"
            heading={
              <div>
                <p className="eyebrow">Resources</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Learning pages</h2>
              </div>
            }
          >
            {pages.map((page) => (
              <Link key={page.id} href={`/lessons/${page.slug}`} className="group">
                <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-sun-border">
                  <h3 className="text-lg font-semibold group-hover:text-primary">{page.title}</h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{page.excerpt}</p>
                  <p className="mt-4 text-sm font-medium text-primary">Read lesson →</p>
                </Card>
              </Link>
            ))}
          </CardCarousel>
        )}
      </Section>

    </>
  );
}
