/* Service worker for shaiqmuhammad.com (public site + admin app). Generated into public/sw.js by scripts/gen-sw.mjs.
 * Safe by design:
 *  - Only same-origin GET requests are ever touched. The Worker API (workers.dev / /api), auth and any request with an
 *    Authorization header are NEVER cached (the SW does not even intercept them).
 *  - /admin and site data (/content/*.json) are network-only.
 *  - Pages are network-first and are not stored; when offline, /offline.html is shown.
 *  - Hashed build assets (/_next/static) are cache-first; icons/fonts stale-while-revalidate.
 *  - Every deploy produces a new VERSION → new cache name; old caches are deleted on activate, so new pushes show up. */
const VERSION = "__SW_VERSION__";
const STATIC = `sm-static-${VERSION}`;
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });

const neverCache = (url, req) =>
  url.origin !== self.location.origin ||
  req.headers.has("Authorization") ||
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/cdn-cgi/") ||
  url.pathname === "/admin" || url.pathname.startsWith("/admin/") ||
  url.pathname.startsWith("/content/") ||
  url.pathname === "/sw.js" || url.pathname.endsWith(".webmanifest") ||
  url.search.includes("_rsc=");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    // Network-first for every page (admin included); nothing is stored. Offline → friendly page.
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (neverCache(url, req)) return; // network-only, untouched

  if (url.pathname.startsWith("/_next/static/")) {
    // Content-hashed and immutable: cache-first.
    event.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (/\.(?:png|jpe?g|webp|svg|ico|woff2?|ttf)$/i.test(url.pathname) && !url.pathname.startsWith("/uploads/")) {
    // Icons, logo, fonts: stale-while-revalidate.
    event.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok && res.type === "basic") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Everything else: default browser behaviour (network).
});
