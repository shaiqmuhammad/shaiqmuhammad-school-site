/** Homepage builder: ordered list of sections (built-ins can be hidden/restored; custom ones added/deleted). */
export type BuiltinKind = "banners" | "intro" | "lms" | "assessments" | "libraries" | "teacher" | "videos" | "lessons";
export type CustomKind = "text" | "imageText" | "cta" | "youtube" | "cards";
export type HomeCard = { title: string; titleAr?: string; text?: string; textAr?: string; image?: string; href?: string };
export type HomeSection = {
  id: string;
  kind: BuiltinKind | CustomKind;
  hidden?: boolean;
  eyebrow?: string; eyebrowAr?: string;
  title?: string; titleAr?: string;
  text?: string; textAr?: string;
  image?: string;
  imageSide?: "start" | "end";
  button?: { label: string; labelAr?: string; href: string };
  count?: number;
  youtube?: string;
  cards?: HomeCard[];
};
export type HomepageData = { sections: HomeSection[]; updated?: string };

export const HOMEPAGE_PATH = "/content/homepage.json";
export const GITHUB_HOMEPAGE_PATH = "public/content/homepage.json";
export const BUILTINS: BuiltinKind[] = ["banners", "intro", "lms", "assessments", "libraries", "teacher", "videos", "lessons"];
export const CUSTOM_KINDS: CustomKind[] = ["text", "imageText", "cta", "youtube", "cards"];
export const isBuiltin = (k: string): k is BuiltinKind => (BUILTINS as string[]).includes(k);
/** Which fields each built-in section supports in the editor. */
export const BUILTIN_FIELDS: Record<BuiltinKind, ("eyebrow" | "title" | "text" | "count" | "button" | "image")[]> = {
  banners: [],
  intro: ["eyebrow", "title", "text", "button"],
  lms: [],
  assessments: ["count"],
  libraries: ["eyebrow", "title", "text"],
  teacher: [],
  videos: ["eyebrow", "title", "count"],
  lessons: ["eyebrow", "title", "count"],
};

export const defaultHomepage = (): HomepageData => ({ sections: BUILTINS.map((k) => ({ id: k, kind: k })) });

const s = (v: unknown, n = 4000) => (typeof v === "string" ? v.slice(0, n) : undefined);
export function normalizeHomepage(raw: unknown): HomepageData {
  const r = (raw && typeof raw === "object" ? raw : {}) as { sections?: unknown[] };
  const seen = new Set<string>();
  const out: HomeSection[] = [];
  for (const x of Array.isArray(r.sections) ? r.sections : []) {
    const o = (x || {}) as Record<string, unknown>;
    const kind = String(o.kind || "");
    if (!isBuiltin(kind) && !(CUSTOM_KINDS as string[]).includes(kind)) continue;
    const id = isBuiltin(kind) ? kind : s(o.id, 60) || `s_${Math.random().toString(36).slice(2, 9)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const b = o.button as Record<string, unknown> | undefined;
    out.push({
      id, kind: kind as HomeSection["kind"], hidden: o.hidden === true,
      eyebrow: s(o.eyebrow, 120), eyebrowAr: s(o.eyebrowAr, 120), title: s(o.title, 200), titleAr: s(o.titleAr, 200), text: s(o.text), textAr: s(o.textAr),
      image: s(o.image, 1000), imageSide: o.imageSide === "end" ? "end" : o.imageSide === "start" ? "start" : undefined,
      button: b && s(b.href, 500) ? { label: s(b.label, 80) || "", labelAr: s(b.labelAr, 80), href: s(b.href, 500)! } : undefined,
      count: typeof o.count === "number" && o.count > 0 ? Math.min(24, Math.round(o.count)) : undefined,
      youtube: s(o.youtube, 200),
      cards: Array.isArray(o.cards) ? (o.cards as Record<string, unknown>[]).slice(0, 24).map((c) => ({ title: s(c.title, 200) || "", titleAr: s(c.titleAr, 200), text: s(c.text, 1000), textAr: s(c.textAr, 1000), image: s(c.image, 1000), href: s(c.href, 500) })) : undefined,
    });
  }
  // Built-ins that are missing (older file) are appended so nothing disappears silently.
  for (const k of BUILTINS) if (!seen.has(k)) out.push({ id: k, kind: k });
  return { sections: out };
}

export async function loadHomepageData(): Promise<HomepageData> {
  try {
    const res = await fetch(HOMEPAGE_PATH, { cache: "no-store" });
    if (!res.ok) return defaultHomepage();
    return normalizeHomepage(await res.json());
  } catch {
    return defaultHomepage();
  }
}

/** youtu.be / watch?v= / embed / shorts / bare id → 11-char id. */
export function youtubeId(v = ""): string {
  const m = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || v.match(/^([\w-]{11})$/);
  return m ? m[1] : "";
}
