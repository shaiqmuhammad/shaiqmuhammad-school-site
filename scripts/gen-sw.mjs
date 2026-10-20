// Writes public/sw.js with a unique version per build so each deploy activates a fresh cache.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = `${(process.env.CF_PAGES_COMMIT_SHA || "").slice(0, 8) || "dev"}-${Date.now().toString(36)}`;
writeFileSync(join(root, "public", "sw.js"), readFileSync(join(root, "scripts", "sw-src.js"), "utf8").replace("__SW_VERSION__", version));
console.log(`gen-sw: public/sw.js version ${version}`);
