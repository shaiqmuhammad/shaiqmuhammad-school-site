import Link from "next/link";
import { AssessmentCards, HomeAssessmentsHeading } from "@/components/assessment/AssessmentCards";
import { BannerCarousel } from "@/components/BannerCarousel";
import { Card } from "@/components/Card";
import { CardCarousel } from "@/components/CardCarousel";
import { EncyclopediaCards } from "@/components/EncyclopediaCards";
import { TeacherProfileCard } from "@/components/TeacherProfileCard";
import { Section } from "@/components/Section";
import { LmsHomeCard } from "@/components/lms/LmsEntry";
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
import { loadHomepageSync } from "@/lib/homepageServer";
import type { HomeSection } from "@/lib/homepage";
import { BlockHeading, CustomSection, IntroBlock } from "@/components/home/HomeBlocks";

export default function HomePage() {
  const data = loadContentDataSync();
  const videos = listPublishedVideos(data).slice(0, 24);
  const pages = listPublishedPages(data).slice(0, 24);
  const banners = listPublishedBanners(loadBannersSync());
  const quizzes = listPublishedQuizzes(loadQuizzesSync());
  const layout = loadHomepageSync();

  // Each built-in block, rendered with the builder's overrides (titles, item counts…).
  const block = (sec: HomeSection) => {
    switch (sec.kind) {
      case "banners": return (
      <BannerCarousel banners={banners} />
      );
      case "intro": return <IntroBlock s={sec} name={siteConfig.name} tagline={siteConfig.tagline} />;
      case "lms": return (
      <Section className="pt-0">
        <LmsHomeCard />
      </Section>

      );
      case "assessments": return (<>
      {quizzes.length > 0 && (
        <Section id="assessments">
          {/* Slider of the most recent visible assessments (inactive ones stay locked as before). */}
          <AssessmentCards quizzes={quizzes.slice(0, sec.count || 9)} carousel heading={<HomeAssessmentsHeading />} moreHref="/assessments" />
        </Section>
      )}

      </>);
      case "libraries": return (
      <Section id="libraries">
        <EncyclopediaCards
          carousel
          heading={<BlockHeading s={sec} eyebrow="Learning libraries" title="Trusted encyclopedias" text="Open these on this site while you study — encyclopedias stay embedded on the page." />}
        />
      </Section>

      );
      case "teacher": return (
      <Section className="pt-0">
        <TeacherProfileCard teacher={data.teacher} />
      </Section>

      );
      case "videos": return (
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
              heading={<BlockHeading s={sec} eyebrow="Video lessons" title="Latest from your teacher" />}
            >
              {videos.slice(0, sec.count || 9).map((video) => (
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

      );
      case "lessons": return (
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
            heading={<BlockHeading s={sec} eyebrow="Resources" title="Learning pages" />}
          >
            {pages.slice(0, sec.count || 9).map((page) => (
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

      );
      default: return <CustomSection s={sec} />;
    }
  };

  return (
    <>
      {layout.sections.filter((x) => !x.hidden).map((sec) => <div key={sec.id} data-home-section={sec.kind}>{block(sec)}</div>)}
    </>
  );
}
