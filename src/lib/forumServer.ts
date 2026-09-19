import { readFileSync } from "fs";
import { join } from "path";
import { normalizeForum, type ForumData } from "@/lib/forum";

export function loadForumDataSync(): ForumData {
  try {
    const filePath = join(process.cwd(), "public", "content", "forum.json");
    const raw = readFileSync(filePath, "utf8");
    return normalizeForum(JSON.parse(raw) as ForumData);
  } catch {
    return { threads: [] };
  }
}
