// Per-deployment build step (runs first in `npm run build` / `npm run dev`). See README → "One codebase, two sites".
//  - NEXT_PUBLIC_SITE_ID   → written to public/site-id.txt (the server's "does this address serve THIS site?" check)
//  - SITE_VARIANT=<name>   → files in variants/<name>/public/ replace the same files in public/ (logo, favicon,
//                            starter content). Unset for the school site, which then builds exactly as before.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = (process.env.NEXT_PUBLIC_SITE_ID || "shaiqmuhammad-school-site").trim();
if (!/^[a-z0-9-]{3,80}$/.test(id)) throw new Error(`NEXT_PUBLIC_SITE_ID must be lowercase letters, digits and dashes (got "${id}")`);
const idFile = join(root, "public", "site-id.txt");
if (!existsSync(idFile) || readFileSync(idFile, "utf8").trim() !== id) writeFileSync(idFile, `${id}\n`);

const variant = (process.env.SITE_VARIANT || "").trim();
if (variant) {
  if (!/^[a-z0-9-]{2,40}$/.test(variant)) throw new Error(`bad SITE_VARIANT "${variant}"`);
  const src = join(root, "variants", variant, "public");
  if (!existsSync(src)) throw new Error(`variants/${variant}/public not found`);
  cpSync(src, join(root, "public"), { recursive: true, force: true });
  console.log(`deploy-variant: applied variants/${variant} (site id ${id})`);
}
