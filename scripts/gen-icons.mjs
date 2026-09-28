// Generates PNG/ICO favicons into public/ from the raster images already embedded in
// public/favicon.svg (64px PNG) and public/logo.svg (192px JPEG). Binary files can't be
// committed through the GitHub text API used by the admin/agents, so they are built here.
// Runs automatically before `npm run build` (prebuild) and `npm run dev`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function embedded(svgFile, mime) {
  const svg = readFileSync(join(pub, svgFile), "utf8");
  const m = svg.match(new RegExp(`data:image/${mime};base64,([A-Za-z0-9+/=]+)`));
  if (!m) throw new Error(`no embedded ${mime} in ${svgFile}`);
  return Buffer.from(m[1], "base64");
}

/** Area-average resize of RGBA pixels. */
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx, y0 = y * fy, y1 = (y + 1) * fy;
      const acc = [0, 0, 0, 0];
      let wsum = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const i = (Math.min(sh - 1, sy) * sw + Math.min(sw - 1, sx)) * 4;
          for (let c = 0; c < 4; c++) acc[c] += src[i + c] * w;
          wsum += w;
        }
      }
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c] / wsum);
    }
  }
  return out;
}

function encodePng(data, w, h) {
  const png = new PNG({ width: w, height: h });
  data.copy(png.data);
  return PNG.sync.write(png);
}

/** ICO container holding PNG images (supported by all modern browsers incl. Safari). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ png, size }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// 64px favicon artwork (PNG) → 64 + 32 px
const fav = PNG.sync.read(embedded("favicon.svg", "png"));
const png64 = encodePng(fav.data, fav.width, fav.height);
const png32 = encodePng(resize(fav.data, fav.width, fav.height, 32, 32), 32, 32);

// 192px teacher photo (JPEG) → 180 px apple-touch-icon, 192 px PWA-style icon
const photo = jpeg.decode(embedded("logo.svg", "jpeg"), { useTArray: true, formatAsRGBA: true });
const photoData = Buffer.from(photo.data);
const png180 = encodePng(resize(photoData, photo.width, photo.height, 180, 180), 180, 180);
const png192 = encodePng(photoData, photo.width, photo.height);

writeFileSync(join(pub, "favicon.ico"), ico([{ png: png32, size: 32 }, { png: png64, size: 64 }]));
writeFileSync(join(pub, "icon-32.png"), png32);
writeFileSync(join(pub, "apple-touch-icon.png"), png180);
writeFileSync(join(pub, "icon-192.png"), png192);
console.log("gen-icons: wrote favicon.ico (32+64), icon-32.png, apple-touch-icon.png (180), icon-192.png");
