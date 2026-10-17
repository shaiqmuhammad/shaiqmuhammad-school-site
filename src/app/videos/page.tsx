import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import {
  extractYouTubeId,
  listPublishedVideos,
} from "@/lib/content";
import { loadContentDataSync } from "@/lib/contentServer";
import { YtPlayer } from "@/components/YtPlayer";
import { VideosEmpty } from "@/components/VideosEmpty";
import { YoutubeLibrary } from "@/components/YoutubeLibrary";

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
        <YoutubeLibrary
          fallback={<>
        {videos.length === 0 ? (
          <VideosEmpty />
        ) : (
          <div className="space-y-10">
            {videos.map((video) => (
              <Card key={video.id} className="overflow-hidden p-0" id={video.id}>
                <YtPlayer id={video.youtubeId} title={video.title} />
                <div className="p-6">
                  <h2 className="text-xl font-semibold">{video.title}</h2>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{video.description}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
</>}
        />
      </Section>
    </>
  );
}
