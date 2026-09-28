import { readFileSync } from "fs";
import { join } from "path";
import { emptyBanners, normalizeBanners, type BannersData } from "@/lib/banners";

export function loadBannersSync(): BannersData {
  try {
    const raw = readFileSync(join(process.cwd(), "public", "content", "banners.json"), "utf8");
    return normalizeBanners(JSON.parse(raw));
  } catch {
    return emptyBanners;
  }
}
