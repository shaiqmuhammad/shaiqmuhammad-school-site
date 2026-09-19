import { newId } from "@/lib/content";

export type ForumReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  hidden: boolean;
};

export type ForumThread = {
  id: string;
  title: string;
  author: string;
  body: string;
  createdAt: string;
  hidden: boolean;
  replies: ForumReply[];
};

export type ForumData = {
  threads: ForumThread[];
};

export const FORUM_LOCAL_KEY = "sm_forum_local_v1";

export const emptyForum: ForumData = { threads: [] };

export function normalizeForum(data: Partial<ForumData> | null | undefined): ForumData {
  const threads = Array.isArray(data?.threads) ? data!.threads! : [];
  return {
    threads: threads.map((t) => ({
      id: t.id || newId("thread"),
      title: String(t.title || "Untitled"),
      author: String(t.author || "Student"),
      body: String(t.body || ""),
      createdAt: t.createdAt || new Date().toISOString(),
      hidden: Boolean(t.hidden),
      replies: Array.isArray(t.replies)
        ? t.replies.map((r) => ({
            id: r.id || newId("reply"),
            author: String(r.author || "Student"),
            body: String(r.body || ""),
            createdAt: r.createdAt || new Date().toISOString(),
            hidden: Boolean(r.hidden),
          }))
        : [],
    })),
  };
}

export function listVisibleThreads(data: ForumData): ForumThread[] {
  return data.threads
    .filter((t) => !t.hidden)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getThread(data: ForumData, id: string): ForumThread | undefined {
  return data.threads.find((t) => t.id === id);
}

export function mergeForumLocal(published: ForumData, local: ForumData): ForumData {
  const byId = new Map<string, ForumThread>();
  for (const t of published.threads) byId.set(t.id, { ...t, replies: [...t.replies] });
  for (const t of local.threads) {
    const existing = byId.get(t.id);
    if (!existing) {
      byId.set(t.id, t);
      continue;
    }
    const replyIds = new Set(existing.replies.map((r) => r.id));
    for (const r of t.replies) {
      if (!replyIds.has(r.id)) existing.replies.push(r);
    }
  }
  return { threads: Array.from(byId.values()) };
}

export function loadForumLocal(): ForumData {
  if (typeof window === "undefined") return emptyForum;
  try {
    const raw = localStorage.getItem(FORUM_LOCAL_KEY);
    if (!raw) return emptyForum;
    return normalizeForum(JSON.parse(raw) as ForumData);
  } catch {
    return emptyForum;
  }
}

export function saveForumLocal(data: ForumData): void {
  localStorage.setItem(FORUM_LOCAL_KEY, JSON.stringify(normalizeForum(data)));
}

export async function loadForumData(): Promise<ForumData> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  const res = await fetch(`${base}/content/forum.json`, { cache: "no-store" });
  if (!res.ok) return emptyForum;
  return normalizeForum((await res.json()) as ForumData);
}
