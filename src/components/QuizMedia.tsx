import { youtubeEmbedUrl } from "@/lib/content";
import { type QuestionMedia, youtubeIdFromMedia } from "@/lib/quiz";

export function QuizMedia({ media }: { media?: QuestionMedia }) {
  if (!media) return null;
  const yt = youtubeIdFromMedia(media);
  return (
    <div className="mt-3 space-y-3">
      {media.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.imageUrl} alt="Question illustration" className="max-h-80 w-auto rounded-xl border border-card-border" />
      )}
      {media.audioUrl && (
        <audio controls src={media.audioUrl} className="w-full max-w-md">
          Your browser does not support audio.
        </audio>
      )}
      {media.videoUrl && (
        <video controls src={media.videoUrl} className="w-full max-w-2xl rounded-xl border border-card-border">
          Your browser does not support video.
        </video>
      )}
      {yt && (
        <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-card-border">
          <iframe
            title="Question video"
            src={youtubeEmbedUrl(yt)}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
