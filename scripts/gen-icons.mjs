// Generates PNG/ICO favicons into public/ from the raster images already embedded in
// public/favicon.svg (64px PNG) and public/logo.svg (192px JPEG). Binary files can't be
// committed through the GitHub text API used by the admin/agents, so they are built here.
// If Admin → Settings → Branding has an uploaded favicon (settings.json brand.faviconPngPath,
// a 512px PNG rendered in the browser; or brand.faviconPath when it is a PNG/JPG), every icon
// (favicon.ico, icon-32, icon-192, apple-touch-icon) is generated from that instead.
// Runs automatically before `npm run build` (prebuild) and `npm run dev`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/** Decodes a PNG/JPEG file to RGBA { data, width, height }. */
function decodeRaster(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { data: Buffer.from(img.data), width: img.width, height: img.height };
  }
  throw new Error(`${file} is not a PNG or JPEG`);
}

/** Centre-crops to a square. */
function square({ data, width, height }) {
  const s = Math.min(width, height);
  if (width === height) return { data, size: s };
  const x0 = Math.floor((width - s) / 2), y0 = Math.floor((height - s) / 2);
  const out = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) data.copy(out, y * s * 4, ((y + y0) * width + x0) * 4, ((y + y0) * width + x0 + s) * 4);
  return { data: out, size: s };
}

/** Flattens transparency onto white (iOS renders transparent touch icons on black). */
function onWhite(data) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(out[i + c] * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

/** Uploaded favicon source from settings.json, or null for the built-in artwork. */
function brandFavicon() {
  try {
    const settings = JSON.parse(readFileSync(join(pub, "content", "settings.json"), "utf8"));
    const b = settings?.brand || {};
    const candidates = [b.faviconPngPath, b.faviconPath].filter(
      (p) => typeof p === "string" && /^\/brand\/[A-Za-z0-9._-]+\.(png|jpe?g)$/i.test(p),
    );
    for (const p of candidates) {
      const file = join(pub, p.slice(1));
      if (!existsSync(file)) {
        console.warn(`gen-icons: ${p} is set in settings.json but missing — skipping`);
        continue;
      }
      const sq = square(decodeRaster(file));
      return { ...sq, path: p };
    }
  } catch (e) {
    console.warn(`gen-icons: could not use uploaded favicon (${e.message}) — using defaults`);
  }
  return null;
}

const brand = brandFavicon();
let png32, png64, png180, png192;
if (brand) {
  const { data, size } = brand;
  const at = (n) => encodePng(size === n ? data : resize(data, size, size, n, n), n, n);
  png32 = at(32);
  png64 = at(64);
  png192 = at(192);
  const white = onWhite(data);
  png180 = encodePng(resize(white, size, size, 180, 180), 180, 180);
} else {
  // 64px favicon artwork (PNG) → 64 + 32 px
  const fav = PNG.sync.read(embedded("favicon.svg", "png"));
  png64 = encodePng(fav.data, fav.width, fav.height);
  png32 = encodePng(resize(fav.data, fav.width, fav.height, 32, 32), 32, 32);

  // 192px teacher photo (JPEG) → 180 px apple-touch-icon, 192 px PWA-style icon
  const photo = jpeg.decode(embedded("logo.svg", "jpeg"), { useTArray: true, formatAsRGBA: true });
  const photoData = Buffer.from(photo.data);
  png180 = encodePng(resize(photoData, photo.width, photo.height, 180, 180), 180, 180);
  png192 = encodePng(photoData, photo.width, photo.height);
}

writeFileSync(join(pub, "favicon.ico"), ico([{ png: png32, size: 32 }, { png: png64, size: 64 }]));
writeFileSync(join(pub, "icon-32.png"), png32);
writeFileSync(join(pub, "apple-touch-icon.png"), png180);
writeFileSync(join(pub, "icon-192.png"), png192);
console.log(
  `gen-icons: wrote favicon.ico (32+64), icon-32.png, apple-touch-icon.png (180), icon-192.png from ${brand ? brand.path : "built-in artwork"}`,
);
