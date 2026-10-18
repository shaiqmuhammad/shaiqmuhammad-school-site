import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { YoutubeLibrary } from "@/components/YoutubeLibrary";

export const metadata: Metadata = {
  title: "Videos",
  description: "Video lessons from Shaiq Muhammad for students.",
};

/** The only video page: every visible upload and playlist of the YouTube channel, played in-page. */
export default function VideosPage() {
  return (
    <>
      <PageHero
        eyebrow="Videos"
        title="Video lessons"
        subtitle="Watch explanations from your teacher. You can pause, rewind, and revisit anytime."
      />
      <Section>
        <Suspense fallback={null}><YoutubeLibrary /></Suspense>
      </Section>
    </>
  );
}
