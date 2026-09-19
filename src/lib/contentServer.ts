import { readFileSync } from "fs";
import { join } from "path";
import { normalizeContentData, type ContentData } from "@/lib/content";

/** Sync load for build-time (generateStaticParams / server components only). */
export function loadContentDataSync(): ContentData {
  const filePath = join(process.cwd(), "public", "content", "data.json");
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as ContentData;
  return normalizeContentData(data);
}
