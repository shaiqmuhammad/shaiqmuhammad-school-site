import { readFileSync } from "fs";
import { join } from "path";
import { defaultAbout, normalizeAbout, type AboutData } from "@/lib/about";

export function loadAboutSync(): AboutData {
  try {
    return normalizeAbout(JSON.parse(readFileSync(join(process.cwd(), "public", "content", "about.json"), "utf8")));
  } catch {
    return defaultAbout();
  }
}
