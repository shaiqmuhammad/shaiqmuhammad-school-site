import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import {
  extractYouTubeId,
  listPublishedVideos,
  youtubeEmbedUrl,
} from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";
import { VideosEmpty, WatchOnYouTube } from "@/components/VideosEmpty";

export const metadata: Metadata = {
  title: "Videos",
  description: "YouTube video lessons from Shaiq Muhammad for students.",
};

export default function VideosPage() {
  const videos = listPublishedVideos(loadContentDataSync())
    .map((video) => {
      const id = extractYouTubeId(video.youtubeId) || video.youtubeId.trim();
      return { ...video, youtubeId: id };
    })
    .filter((video) => Boolean(video.youtubeId));

  return (
    <>
      <PageHero
        eyebrow="Videos"
        title="Video lessons"
        subtitle="Watch explanations from your teacher. You can pause, rewind, and revisit anytime."
      />
      <Section>
        {videos.length === 0 ? (
          <VideosEmpty />
        ) : (
          <div className="space-y-10">
            {videos.map((video) => (
              <Card key={video.id} className="overflow-hidden p-0" id={video.id}>
                <div className="aspect-video w-full bg-accent-soft">
                  <iframe
                    title={video.title}
                    src={youtubeEmbedUrl(video.youtubeId)}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
                <div className="p-6">
                  <h2 className="text-xl font-semibold">{video.title}</h2>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{video.description}</p>
                  <WatchOnYouTube youtubeId={video.youtubeId} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
