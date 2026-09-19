import {
  GITHUB_BRANCH,
  GITHUB_CONTENT_PATH,
  GITHUB_FORUM_PATH,
  GITHUB_REPO,
  type ContentData,
} from "@/lib/content";
import type { ForumData } from "@/lib/forum";

const STORAGE_TOKEN_KEY = "sm_admin_github_token";

export function getStoredGithubToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_TOKEN_KEY);
}

export function setStoredGithubToken(token: string): void {
  sessionStorage.setItem(STORAGE_TOKEN_KEY, token.trim());
}

export function clearStoredGithubToken(): void {
  sessionStorage.removeItem(STORAGE_TOKEN_KEY);
}

export type PublishResult =
  | { ok: true; commitSha: string; htmlUrl?: string }
  | { ok: false; error: string };

async function putGithubFile(
  path: string,
  contentText: string,
  token: string,
  message: string,
): Promise<PublishResult> {
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  let sha: string | undefined;
  const getRes = await fetch(`${apiBase}?ref=${GITHUB_BRANCH}`, { headers });
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha?: string };
    sha = existing.sha;
  } else if (getRes.status !== 404) {
    const err = await getRes.text();
    return {
      ok: false,
      error: `Could not read current file (${getRes.status}): ${err.slice(0, 200)}`,
    };
  }

  const content = btoa(unescape(encodeURIComponent(contentText)));

  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    return {
      ok: false,
      error: `Publish failed (${putRes.status}): ${err.slice(0, 300)}`,
    };
  }

  const result = (await putRes.json()) as {
    commit?: { sha?: string; html_url?: string };
    content?: { html_url?: string };
  };

  return {
    ok: true,
    commitSha: result.commit?.sha || "ok",
    htmlUrl: result.commit?.html_url || result.content?.html_url,
  };
}

/** Update public/content/data.json on GitHub via Contents API. */
export async function publishContentToGithub(
  data: ContentData,
  token: string,
  message?: string,
): Promise<PublishResult> {
  return putGithubFile(
    GITHUB_CONTENT_PATH,
    JSON.stringify(data, null, 2) + "\n",
    token,
    message || `chore(content): update CMS data.json via admin`,
  );
}

export async function publishForumToGithub(
  data: ForumData,
  token: string,
  message?: string,
): Promise<PublishResult> {
  return putGithubFile(
    GITHUB_FORUM_PATH,
    JSON.stringify(data, null, 2) + "\n",
    token,
    message || `chore(forum): update forum.json via admin`,
  );
}

export function downloadContentJson(data: ContentData): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadForumJson(data: ForumData): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "forum.json";
  a.click();
  URL.revokeObjectURL(url);
}
