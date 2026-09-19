export type ContentPage = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  published: boolean;
  updatedAt: string;
};

export type ContentVideo = {
  id: string;
  title: string;
  youtubeId: string;
  description: string;
  published: boolean;
  updatedAt: string;
};

export type TeacherProfile = {
  name: string;
  title: string;
  bio: string;
  photoUrl: string;
  subjects: string[];
  location: string;
};

export type ContentData = {
  pages: ContentPage[];
  videos: ContentVideo[];
  teacher: TeacherProfile;
};

export const CONTENT_PATH = "/content/data.json";
export const FORUM_PATH = "/content/forum.json";
export const GITHUB_REPO = "shaiqmuhammad/shaiqmuhammad-school-site";
export const GITHUB_CONTENT_PATH = "public/content/data.json";
export const GITHUB_FORUM_PATH = "public/content/forum.json";
export const GITHUB_BRANCH = "main";

export const defaultTeacher: TeacherProfile = {
  name: "Shaiq Muhammad",
  title: "Teacher & guide",
  bio: "Assalamu alaikum. I teach students in Dubai with a focus on Quran, Hadith, and sincere character. This platform is our calm learning home — encyclopedias, lessons, and video classes in one place.",
  photoUrl: "/content/teacher-placeholder.svg",
  subjects: ["Quran", "Hadith", "Islamic studies", "Character"],
  location: "Dubai, UAE",
};

export const emptyContent: ContentData = {
  pages: [],
  videos: [],
  teacher: defaultTeacher,
};

function normalizeTeacher(raw: Partial<TeacherProfile> | undefined): TeacherProfile {
  return {
    name: raw?.name?.trim() || defaultTeacher.name,
    title: raw?.title?.trim() || defaultTeacher.title,
    bio: raw?.bio?.trim() || defaultTeacher.bio,
    photoUrl: raw?.photoUrl?.trim() || defaultTeacher.photoUrl,
    subjects:
      Array.isArray(raw?.subjects) && raw.subjects.length
        ? raw.subjects.map(String)
        : [...defaultTeacher.subjects],
    location: raw?.location?.trim() || defaultTeacher.location,
  };
}

export function normalizeContentData(data: Partial<ContentData> | null | undefined): ContentData {
  return {
    pages: Array.isArray(data?.pages) ? data!.pages! : [],
    videos: Array.isArray(data?.videos) ? data!.videos! : [],
    teacher: normalizeTeacher(data?.teacher),
  };
}

/** Extract a YouTube video ID from a full URL or bare ID. */
export function extractYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^[\w-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;

      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") &&
        parts[1] &&
        /^[\w-]{11}$/.test(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    // not a URL
  }

  const match = raw.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([\w-]{11})/);
  return match?.[1] ?? null;
}

export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube.com/embed/${youtubeId}`;
}

export function youtubeThumbUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export async function loadContentData(): Promise<ContentData> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";

  const res = await fetch(`${base}${CONTENT_PATH}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to load content (${res.status})`);
  }

  const data = (await res.json()) as ContentData;
  return normalizeContentData(data);
}

export function listPublishedPages(data: ContentData): ContentPage[] {
  return data.pages
    .filter((p) => p.published)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listPublishedVideos(data: ContentData): ContentVideo[] {
  return data.videos
    .filter((v) => v.published)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPageBySlug(
  data: ContentData,
  slug: string,
  opts?: { includeDrafts?: boolean },
): ContentPage | undefined {
  return data.pages.find(
    (p) => p.slug === slug && (opts?.includeDrafts || p.published),
  );
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
