import { readFileSync } from "fs";
import { join } from "path";
import { defaultHomepage, normalizeHomepage, type HomepageData } from "@/lib/homepage";

export function loadHomepageSync(): HomepageData {
  try {
    return normalizeHomepage(JSON.parse(readFileSync(join(process.cwd(), "public", "content", "homepage.json"), "utf8")));
  } catch {
    return defaultHomepage();
  }
}
