import { newId } from "@/lib/content";

export type Banner = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  buttonText: string;
  buttonHref: string;
  published: boolean;
  order: number;
  /** Hidden from the site (Admin → Announcements → Hide). Optional so older banners.json keeps working. */
  hidden?: boolean;
  /** Optional Arabic text (falls back to the English fields). */
  titleAr?: string;
  subtitleAr?: string;
  buttonTextAr?: string;
};

export type BannersData = { banners: Banner[] };

export const BANNERS_PATH = "/content/banners.json";
export const GITHUB_BANNERS_PATH = "public/content/banners.json";
export const emptyBanners: BannersData = { banners: [] };

export function normalizeBanner(raw: Partial<Banner>, index = 0): Banner {
  const titleAr = String(raw.titleAr ?? "").trim();
  const subtitleAr = String(raw.subtitleAr ?? "").trim();
  const buttonTextAr = String(raw.buttonTextAr ?? "").trim();
  return {
    id: raw.id || newId("banner"),
    title: String(raw.title || ""),
    subtitle: String(raw.subtitle || ""),
    imageUrl: String(raw.imageUrl || "").trim(),
    buttonText: String(raw.buttonText || "").trim(),
    buttonHref: String(raw.buttonHref || "").trim(),
    published: Boolean(raw.published),
    order: typeof raw.order === "number" ? raw.order : index,
    ...(raw.hidden ? { hidden: true } : {}),
    ...(titleAr ? { titleAr } : {}),
    ...(subtitleAr ? { subtitleAr } : {}),
    ...(buttonTextAr ? { buttonTextAr } : {}),
  };
}

/** Shown on the site: not hidden (and not an old unpublished draft). */
export function isBannerVisible(b: Banner): boolean {
  return b.published && !b.hidden;
}

export function normalizeBanners(data: Partial<BannersData> | null | undefined): BannersData {
  const banners = Array.isArray(data?.banners) ? data!.banners! : [];
  return { banners: banners.map((b, i) => normalizeBanner(b, i)) };
}

export function listPublishedBanners(data: BannersData): Banner[] {
  return data.banners
    .filter(isBannerVisible)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function emptyBanner(): Banner {
  return {
    id: newId("banner"),
    title: "",
    subtitle: "",
    imageUrl: "",
    buttonText: "",
    buttonHref: "",
    published: true,
    order: 0,
  };
}

export async function loadBannersData(): Promise<BannersData> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  try {
    const res = await fetch(`${base}${BANNERS_PATH}`, { cache: "no-store" });
    if (!res.ok) return emptyBanners;
    return normalizeBanners(await res.json());
  } catch {
    return emptyBanners;
  }
}
