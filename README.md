# Shaiq Muhammad — Student Learning Platform

Educational learning site for **students of Shaiq Muhammad**. Built with Next.js (App Router), TypeScript, and Tailwind CSS. Static HTML export for Cloudflare Pages.

Focus: encyclopedias (in-site), written lessons, video classes, kids forum, teacher profile, and contact.

## Live URLs

| Page | URL |
|---|---|
| Home | https://www.shaiqmuhammad.com |
| Encyclopedia of Quran | https://www.shaiqmuhammad.com/encyclopedia/quran |
| Encyclopedia of Hadith | https://www.shaiqmuhammad.com/encyclopedia/hadith |
| Lessons / Videos / Forum | `/lessons` · `/videos` · `/forum` |
| Contact | `/contact` |
| **Admin login** | **https://www.shaiqmuhammad.com/admin/login** |

### Admin password

Set `NEXT_PUBLIC_ADMIN_PASSWORD` (see `.env.example`).

- **Local default:** `ShaiqAdmin2026!`
- Must also be set in **Cloudflare Pages → Environment variables** for production builds (static export bakes it in at build time).

## Learning libraries (integrated)

| Resource | In-site page | Source embed |
|---|---|---|
| **Encyclopedia of Quran** | `/encyclopedia/quran` | https://quranenc.com/en/home#transes |
| **Encyclopedia of Hadith** | `/encyclopedia/hadith` | https://hadeethenc.com/en/home/about |

Homepage + nav link to in-site pages (iframe under site header). Each page has **Open in new tab** if embeds are blocked.

## Stack

- Next.js App Router + TypeScript — **static export** (`output: "export"`)
- Tailwind CSS 4 + `next-themes`
- CMS: `public/content/data.json` (pages, videos, teacher)
- Forum: `public/content/forum.json`
- Admin at `/admin` (client-side; GitHub Contents API publish)

## Setup

```bash
cd shaiqmuhammad-school-site
cp .env.example .env.local
npm install
npm run dev
```

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Admin CMS password (required) |
| `NEXT_PUBLIC_PORTAL_URL` | Student portal link |
| `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` | Optional Formspree (or similar) URL; else mailto |
| `NEXT_PUBLIC_TAWK_PROPERTY_ID` | Optional Tawk.to property ID |
| `NEXT_PUBLIC_TAWK_WIDGET_ID` | Optional Tawk.to widget ID |
| `NEXT_PUBLIC_SITE_URL` | Optional absolute origin |

## Admin CMS (`/admin`)

1. Visit `/admin/login` and sign in with `NEXT_PUBLIC_ADMIN_PASSWORD`.
2. **Pages** — rich body: headings, lists, bold, links, `![alt](image-url)` (https or `data:image/…;base64,…`), `:::youtube VIDEO_ID`.
3. **Videos** — YouTube URL/ID gallery entries.
4. **Teacher** — name, photo URL, bio, subjects, Dubai location (Home + About).
5. **Forum** — moderate kids forum threads/replies; hide/delete; import local student posts from this browser; publish `forum.json`.
6. **Publish** — GitHub PAT (Contents R/W) or download JSON and push manually.

## Kids forum

- Public `/forum` with rules banner, display-name posts (no accounts).
- Published content from `forum.json`; device-local posts until teacher imports + publishes.
- Safe for MVP on static hosting.

## Contact & chat

- `/contact` — name, email, message. Uses Formspree when `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` is set; otherwise mailto fallback.
- Live chat — Tawk.to when both Tawk env vars are set; otherwise discreet "Chat coming soon" + Contact link.

## Deploy (Cloudflare Pages)

1. Push to `shaiqmuhammad/shaiqmuhammad-school-site` (`main`).
2. Build: `npm run build` · Output: `out` · Node 20+.
3. Set env vars (especially `NEXT_PUBLIC_ADMIN_PASSWORD`).

## Brand

- **Shaiq Muhammad** — student learning platform · **shaiqmuhammad.com** · Dubai, UAE
