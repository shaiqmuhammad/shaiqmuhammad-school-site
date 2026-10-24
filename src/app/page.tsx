import { AssessmentCards, HomeAssessmentsHeading } from "@/components/assessment/AssessmentCards";
import { BannerCarousel } from "@/components/BannerCarousel";
import { EncyclopediaCards } from "@/components/EncyclopediaCards";
import { TeacherProfileCard } from "@/components/TeacherProfileCard";
import { Section } from "@/components/Section";
import { LmsHomeCard } from "@/components/lms/LmsEntry";
import { siteConfig } from "@/content/site";
import {
} from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";
import { listPublishedBanners } from "@/lib/banners";
import { loadBannersSync } from "@/lib/bannersServer";
import { listPublishedQuizzes } from "@/lib/quiz";
import { loadQuizzesSync } from "@/lib/quizServer";
import { loadHomepageSync } from "@/lib/homepageServer";
import type { HomeSection } from "@/lib/homepage";
import { HomeVideos } from "@/components/home/HomeVideos";
import { BlockHeading, CustomSection, IntroBlock } from "@/components/home/HomeBlocks";

export default function HomePage() {
  const data = loadContentDataSync();
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
        <HomeVideos count={sec.count || 9} heading={<BlockHeading s={sec} eyebrow="Video lessons" title="Latest from your teacher" />} />
      );
      case "lessons": return null; // t320: Learning Material is account-only
      default: return <CustomSection s={sec} />;
    }
  };

  return (
    <>
      {layout.sections.filter((x) => !x.hidden).map((sec) => <div key={sec.id} data-home-section={sec.kind}>{block(sec)}</div>)}
    </>
  );
}
