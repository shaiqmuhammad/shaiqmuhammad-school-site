"use client";

import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

/** Classroom activities (see workers/assessment-session/src/activity.ts). Join codes have 5 characters. */
export type ActivityType = "wall" | "wordcloud" | "poll" | "survey" | "tps" | "vote";

export const ACTIVITY_CODE_LENGTH = 5;
export const isActivityCode = (code: string) => code.length === ACTIVITY_CODE_LENGTH;

export type ActivitySettings = {
  moderation: "live" | "approve";
  hideNames: boolean;
  likes: boolean;
  allowImages: boolean;
  allowLinks: boolean;
  timerEnd: number | null;
  locked: boolean;
  options: Record<string, unknown>;
};

export type ActivityInfo = {
  code: string;
  type: ActivityType;
  title: string;
  prompt: string;
  settings: ActivitySettings;
  ended: boolean;
  createdAt: number;
  expiresAt: number;
  now: number;
  participantCount: number;
};

export type ActivityItem = {
  id: string;
  pid: string;
  mine: boolean;
  author: string;
  kind: string;
  data: { text?: string; link?: string; youtube?: string; stage?: string; word?: string; picks?: number[]; answers?: unknown[] };
  status: "approved" | "pending";
  created: number;
  pinned: number;
  color: string;
  highlight: boolean;
  img: string | null;
  likes: number;
  liked: boolean;
  comments: { id: string; text: string; created: number }[];
};

export type ActivityState = ActivityInfo & {
  rev: number;
  me: { id: string; name: string };
  participants: { id: string; name: string; joined: number; removed: boolean }[];
  items: ActivityItem[];
  summary: null | { counts?: number[]; voters?: number; respondents?: number; questions?: { counts?: number[]; avg?: number; texts?: string[] }[] };
  responseCount: number;
};

export type Who = { pid: string; token: string } | { hostKey: string };

export class ActivityError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function call<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ASSESSMENT_API_BASE}/api/activity/${path}`, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ActivityError("network", 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ActivityError(data.error || "error", res.status);
  return data;
}

const q = (o: Record<string, string | number | undefined>) =>
  "?" + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

export const activityApi = {
  create: (input: { type: ActivityType; title: string; prompt?: string; settings?: Partial<ActivitySettings> }) => {
    const s = getServerSession();
    if (!s) return Promise.reject(new ActivityError("unauthorized", 401));
    return call<ActivityInfo & { hostKey: string }>("create", input, { Authorization: `Bearer ${s.token}` });
  },
  info: (code: string) => call<ActivityInfo>(code),
  join: (code: string, name: string, deviceId: string) => call<ActivityInfo & { pid: string; token: string; name: string }>(`${code}/join`, { name, deviceId }),
  state: (code: string, who: Who, since?: number) => call<ActivityState | { same: true; rev: number; now: number }>(`${code}/state${q({ ...who, since })}`),
  post: (code: string, who: Who, p: { text?: string; link?: string; youtube?: string; image?: string; kind?: string; stage?: string }) =>
    call<{ ok: true; id: string; status: string }>(`${code}/post`, { ...who, ...p }),
  respond: (code: string, who: Who, data: unknown) => call<{ ok: true }>(`${code}/respond`, { ...who, data }),
  like: (code: string, who: Who, id: string) => call<{ ok: true; liked: boolean }>(`${code}/like`, { ...who, id }),
  comment: (code: string, hostKey: string, id: string, text: string) => call<{ ok: true }>(`${code}/comment`, { hostKey, id, text }),
  moderate: (code: string, hostKey: string, action: string, extra: Record<string, unknown> = {}) => call<{ ok: true }>(`${code}/moderate`, { hostKey, action, ...extra }),
  settings: (code: string, hostKey: string, patch: { title?: string; prompt?: string; settings?: Partial<ActivitySettings>; reopen?: boolean }) =>
    call<ActivityInfo>(`${code}/settings`, { hostKey, ...patch }),
  remove: (code: string, hostKey: string, pid: string, opts: { deleteItems?: boolean; restore?: boolean; forget?: boolean } = {}) =>
    call<{ ok: true }>(`${code}/remove`, { hostKey, pid, ...opts }),
  end: (code: string, hostKey: string) => call<{ ok: true }>(`${code}/end`, { hostKey }),
  destroy: (code: string, hostKey: string) => call<{ ok: true }>(`${code}/destroy`, { hostKey }),
  imgUrl: (code: string, id: string) => `${ASSESSMENT_API_BASE}/api/activity/${code}/img?id=${encodeURIComponent(id)}`,
};

/* ---------- teacher's activities on this device (code + hostKey) ---------- */
const HOSTED_KEY = "sm_activities_hosted_v1";
export type HostedActivity = { code: string; hostKey: string; type: ActivityType; title: string; createdAt: number; expiresAt: number };

export function loadHosted(): HostedActivity[] {
  try {
    const list = JSON.parse(localStorage.getItem(HOSTED_KEY) || "[]") as HostedActivity[];
    return list.filter((a) => a.expiresAt > Date.now());
  } catch {
    return [];
  }
}
export function saveHosted(a: HostedActivity) {
  const list = [a, ...loadHosted().filter((x) => x.code !== a.code)].slice(0, 50);
  localStorage.setItem(HOSTED_KEY, JSON.stringify(list));
}
export function forgetHosted(code: string) {
  localStorage.setItem(HOSTED_KEY, JSON.stringify(loadHosted().filter((x) => x.code !== code)));
}
export function hostedFor(code: string): HostedActivity | undefined {
  return loadHosted().find((a) => a.code === code);
}

/* ---------- student's seat in an activity on this device ---------- */
const SEAT_KEY = (code: string) => `sm_activity_seat_${code}`;
export type Seat = { code: string; pid: string; token: string; name: string };
export function loadSeat(code: string): Seat | null {
  try {
    return JSON.parse(localStorage.getItem(SEAT_KEY(code)) || "null") as Seat | null;
  } catch {
    return null;
  }
}
export function saveSeat(s: Seat) {
  try {
    localStorage.setItem(SEAT_KEY(s.code), JSON.stringify(s));
  } catch {
    // ignore
  }
}
export function clearSeat(code: string) {
  try {
    localStorage.removeItem(SEAT_KEY(code));
  } catch {
    // ignore
  }
}

/** Shrinks a picture in the browser to a JPEG/WebP data URL of at most `maxBytes` (default 200 KB). */
export async function compressImage(file: File, maxBytes = 195 * 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width;
  let h = bitmap.height;
  const maxSide = 1280;
  if (Math.max(w, h) > maxSide) {
    const k = maxSide / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  const canvas = document.createElement("canvas");
  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if ((url.length - url.indexOf(",") - 1) * 0.75 <= maxBytes) return url;
    }
    w = Math.round(w * 0.75);
    h = Math.round(h * 0.75);
  }
  throw new Error("too_large");
}

export const ACTIVITY_LABELS: Record<ActivityType, { en: string; ar: string; icon: string; hintEn: string; hintAr: string }> = {
  wall: { en: "Shared Wall", ar: "الجدار المشترك", icon: "🧱", hintEn: "Students post ideas, pictures, links or YouTube to one live wall.", hintAr: "ينشر الطلاب أفكارًا وصورًا وروابط أو فيديو يوتيوب على جدار مباشر واحد." },
  wordcloud: { en: "Word Cloud", ar: "سحابة الكلمات", icon: "☁️", hintEn: "1–3 words each; popular words grow bigger.", hintAr: "من كلمة إلى ثلاث كلمات لكل طالب؛ الكلمات المتكررة تكبر." },
  poll: { en: "Poll", ar: "استطلاع", icon: "📊", hintEn: "Single or multiple choice with a live bar chart.", hintAr: "اختيار واحد أو متعدد مع رسم بياني مباشر." },
  survey: { en: "Survey", ar: "استبيان", icon: "📝", hintEn: "Choice, 1–5 rating, emoji scale and short text; Excel export.", hintAr: "اختيار، تقييم ١–٥، مقياس وجوه ونص قصير؛ تصدير إكسل." },
  tps: { en: "Think · Pair · Share", ar: "فكّر · زاوج · شارك", icon: "🤝", hintEn: "Timed stages, random pairs and a share wall.", hintAr: "مراحل بمؤقت، أزواج عشوائية وجدار للمشاركة." },
  vote: { en: "Vote", ar: "تصويت", icon: "🗳️", hintEn: "Options with pictures, live results and a winner celebration.", hintAr: "خيارات بصور، نتائج مباشرة واحتفال بالفائز." },
};
