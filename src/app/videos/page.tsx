import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import {
  listPublishedVideos,
  youtubeEmbedUrl,
} from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";

export const metadata: Metadata = {
  title: "Videos",
  description: "YouTube video lessons from Shaiq Muhammad for students.",
};

export default function VideosPage() {
  const videos = listPublishedVideos(loadContentDataSync());

  return (
    <>
      <PageHero
        eyebrow="Videos"
        title="Video lessons"
        subtitle="Watch explanations from your teacher. You can pause, rewind, and revisit anytime."
      />
      <Section>
        {videos.length === 0 ? (
          <p className="text-muted">No published videos yet. Please check back soon.</p>
        ) : (
          <div className="space-y-10">
            {videos.map((video) => (
              <Card key={video.id} className="overflow-hidden p-0" id={video.id}>
                <div className="aspect-video w-full bg-accent-soft">
                  <iframe
                    title={video.title}
                    src={youtubeEmbedUrl(video.youtubeId)}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
                <div className="p-6">
                  <h2 className="text-xl font-semibold">{video.title}</h2>
                  <p className="mt-2 text-sm text-muted leading-relaxed">
                    {video.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
