import {
  GITHUB_BRANCH,
  GITHUB_CONTENT_PATH,
  GITHUB_FORUM_PATH,
  GITHUB_REPO,
  type ContentData,
} from "@/lib/content";
import type { ForumData } from "@/lib/forum";

import { getServerSession, serverPublish } from "@/lib/adminServer";

/** Key name used by older builds that kept a GitHub key in the browser (now removed on load). */
const LEGACY_TOKEN_KEY = "sm_admin_github_token";
/** "Advanced: use my own key" fallback, only offered when the publishing server is unreachable. Tab only. */
const FALLBACK_TOKEN_KEY = "sm_admin_github_fallback_key";
/** Returned by getStoredGithubToken() when publishing goes through the server (no key in the browser). */
export const SERVER_PUBLISH_TOKEN = "server-session";

/** Remove any GitHub key an older build saved in this browser. */
export function clearLegacyGithubToken(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY + "_tab_only");
  } catch {
    // storage unavailable
  }
}

/**
 * What the Publish buttons use. Normally SERVER_PUBLISH_TOKEN (signed-in device, the Worker commits);
 * otherwise the tab-only fallback key if the admin entered one; otherwise null (not connected).
 */
export function getStoredGithubToken(): string | null {
  if (typeof window === "undefined") return null;
  clearLegacyGithubToken();
  if (getServerSession()) return SERVER_PUBLISH_TOKEN;
  try {
    return sessionStorage.getItem(FALLBACK_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isServerPublishing(): boolean {
  return Boolean(getServerSession());
}

/** Fallback only: keep a key for this tab (never in localStorage, never published). */
export function setStoredGithubToken(token: string): void {
  clearStoredGithubToken();
  sessionStorage.setItem(FALLBACK_TOKEN_KEY, token.trim());
}

export function clearStoredGithubToken(): void {
  clearLegacyGithubToken();
  try {
    sessionStorage.removeItem(FALLBACK_TOKEN_KEY);
  } catch {
    // storage unavailable
  }
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
  return putGithubBase64(path, btoa(unescape(encodeURIComponent(contentText))), token, message);
}

/**
 * Commit a binary file (image etc.) through the Contents API. `base64` is the raw file
 * encoded as base64 (no data: prefix). Creates or replaces the file on the branch.
 */
export async function publishBinaryToGithub(
  path: string,
  base64: string,
  token: string,
  message: string,
): Promise<PublishResult> {
  return putGithubBase64(path, base64.replace(/^data:[^,]*,/, ""), token, message);
}

async function putGithubBase64(
  path: string,
  content: string,
  token: string,
  message: string,
): Promise<PublishResult> {
  if (token === SERVER_PUBLISH_TOKEN) {
    const r = await serverPublish([{ path, content, encoding: "base64" }], message);
    return r.ok ? { ok: true, commitSha: r.commitSha, htmlUrl: r.htmlUrl } : { ok: false, error: r.error };
  }
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

/** Publish any JSON file under public/content (quizzes, results, certificate). */
export async function publishJsonToGithub(
  path: string,
  data: unknown,
  token: string,
  message: string,
): Promise<PublishResult> {
  return putGithubFile(path, JSON.stringify(data, null, 2) + "\n", token, message);
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
