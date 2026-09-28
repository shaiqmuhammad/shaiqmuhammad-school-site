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
};

export type BannersData = { banners: Banner[] };

export const BANNERS_PATH = "/content/banners.json";
export const GITHUB_BANNERS_PATH = "public/content/banners.json";
export const emptyBanners: BannersData = { banners: [] };

export function normalizeBanner(raw: Partial<Banner>, index = 0): Banner {
  return {
    id: raw.id || newId("banner"),
    title: String(raw.title || ""),
    subtitle: String(raw.subtitle || ""),
    imageUrl: String(raw.imageUrl || "").trim(),
    buttonText: String(raw.buttonText || "").trim(),
    buttonHref: String(raw.buttonHref || "").trim(),
    published: Boolean(raw.published),
    order: typeof raw.order === "number" ? raw.order : index,
  };
}

export function normalizeBanners(data: Partial<BannersData> | null | undefined): BannersData {
  const banners = Array.isArray(data?.banners) ? data!.banners! : [];
  return { banners: banners.map((b, i) => normalizeBanner(b, i)) };
}

export function listPublishedBanners(data: BannersData): Banner[] {
  return data.banners
    .filter((b) => b.published && b.imageUrl)
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
