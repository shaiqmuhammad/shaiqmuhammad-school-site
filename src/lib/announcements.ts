import { newId } from "@/lib/content";
import published from "../../public/content/announcements.json";

/** One message in the scrolling "Announcement" strip at the top of the site (Admin → Announcements). */
export type TickerItem = {
  id: string;
  text: string;
  /** Optional Arabic text (falls back to the English text). */
  textAr?: string;
  /** Optional link (site path like /lessons or a full https:// URL). */
  href?: string;
  hidden?: boolean;
  order: number;
};

export type AnnouncementsData = {
  /** Master switch: false hides the whole strip. */
  enabled: boolean;
  items: TickerItem[];
};

export const ANNOUNCEMENTS_PATH = "/content/announcements.json";
export const GITHUB_ANNOUNCEMENTS_PATH = "public/content/announcements.json";

export function normalizeTickerItem(raw: Partial<TickerItem>, index = 0): TickerItem {
  const textAr = String(raw.textAr ?? "").trim();
  const href = String(raw.href ?? "").trim();
  return {
    id: raw.id || newId("ann"),
    text: String(raw.text ?? "").trim(),
    ...(textAr ? { textAr } : {}),
    ...(href ? { href } : {}),
    hidden: Boolean(raw.hidden),
    order: typeof raw.order === "number" ? raw.order : index,
  };
}

export function normalizeAnnouncements(data: Partial<AnnouncementsData> | null | undefined): AnnouncementsData {
  const items = Array.isArray(data?.items) ? data!.items! : [];
  return {
    enabled: data?.enabled !== false,
    items: items
      .map((it, i) => normalizeTickerItem(it, i))
      .sort((a, b) => a.order - b.order)
      .map((it, order) => ({ ...it, order })),
  };
}

/** Messages that should scroll right now (empty when the strip is switched off). */
export function visibleTickerItems(data: AnnouncementsData): TickerItem[] {
  if (!data.enabled) return [];
  return data.items.filter((it) => !it.hidden && (it.text || it.textAr));
}

/** What was published when the site was built (the strip then re-checks the live file). */
export const builtAnnouncements: AnnouncementsData = normalizeAnnouncements(published as Partial<AnnouncementsData>);

export async function loadAnnouncementsData(): Promise<AnnouncementsData> {
  const res = await fetch(`${ANNOUNCEMENTS_PATH}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`announcements.json ${res.status}`);
  return normalizeAnnouncements(await res.json());
}
