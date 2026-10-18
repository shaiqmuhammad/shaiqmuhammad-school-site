import { encode } from "@/lib/uqr";

/** QR codes are drawn locally (never via a third-party image service), because login QR codes carry a secret. */
export function qrMatrix(text: string): boolean[][] {
  return (encode(text, { ecc: "M", border: 0 }) as { data: boolean[][] }).data;
}

/** Inline SVG markup (with a 4-module quiet zone) — crisp at any size and in print. */
export function qrSvg(text: string, px = 256): string {
  const m = qrMatrix(text);
  const n = m.length;
  const q = 4;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
  const t = n + q * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
