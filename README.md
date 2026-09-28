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
| Quizzes | `/quizzes` |

### Admin password

Admin is private (not linked anywhere on the public site). Only a **SHA-256 hash** of the password is stored — never the plaintext.

- Set `ADMIN_PASSWORD_SHA256` in `src/lib/adminAuth.ts`, or `NEXT_PUBLIC_ADMIN_PASSWORD_HASH` at build time (overrides).
- Generate: `printf %s 'your-password' | sha256sum | cut -d' ' -f1`
- Empty hash = admin sign-in disabled.

## Learning libraries (integrated)

| Resource | In-site page | Source embed |
|---|---|---|
| **Encyclopedia of Quran** | `/encyclopedia/quran` | https://quranenc.com/en/home#transes |
| **Encyclopedia of Hadith** | `/encyclopedia/hadith` | https://hadeethenc.com/en/home/about |

Homepage + nav link to in-site pages (iframe under site header, no external "open in new tab" link).

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
| `NEXT_PUBLIC_ADMIN_PASSWORD_HASH` | Optional SHA-256 hex of admin password (overrides constant in `adminAuth.ts`) |
| `NEXT_PUBLIC_PORTAL_URL` | Student portal link |
| `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` | Optional Formspree (or similar) URL; else mailto |
| `NEXT_PUBLIC_TAWK_PROPERTY_ID` | Optional Tawk.to property ID |
| `NEXT_PUBLIC_TAWK_WIDGET_ID` | Optional Tawk.to widget ID (or set both in Admin → Settings → `settings.json`) |
| `NEXT_PUBLIC_SITE_URL` | Optional absolute origin |

## Admin CMS (`/admin`)

1. Open the private admin login URL and sign in (password verified by SHA-256 hash).
2. **Pages** — rich body: headings, lists, bold, links, `![alt](image-url)` (https or `data:image/…;base64,…`), `:::youtube VIDEO_ID`.
3. **Videos** — YouTube URL/ID gallery entries.
4. **Teacher** — name, photo URL, bio, subjects, Dubai location (Home + About).
5. **Forum** — moderate kids forum threads/replies; hide/delete; import local student posts from this browser; publish `forum.json`.
6. **Quizzes** — timed quizzes (multiple choice, true/false, short answer, multi-select) with optional picture/audio/video/YouTube per question and a card image; results import/publish for class positions.
7. **Certificate** — title, subtitle, school name, border colour, footer, logo URL, show position; PDF preview.
8. **Banners** — home page auto-sliding carousel (image, title, subtitle, button, publish, reorder).
9. **Settings** — GitHub PAT; Tawk.to IDs (`settings.json`).
10. **Publish all** — writes data.json, forum.json, quizzes.json, quiz-results.json, certificate.json, banners.json, settings.json via GitHub PAT (Contents R/W).

## Kids forum

- Public `/forum` with rules banner, display-name posts (no accounts).
- Published content from `forum.json`; device-local posts until teacher imports + publishes.
- Safe for MVP on static hosting.

## Contact & chat

- `/contact` — name, email, message. Uses Formspree when `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` is set; otherwise mailto fallback.
- Live chat — Tawk.to when IDs are set (env vars, or Admin → Settings → `settings.json`); otherwise “Chat coming soon” + Contact link.

## Deploy (Cloudflare Pages)

1. Push to `shaiqmuhammad/shaiqmuhammad-school-site` (`main`).
2. Build: `npm run build` · Output: `out` · Node 20+.
3. Optional env vars (see table). Admin password hash lives in code, so no Cloudflare env is required.

## Brand

- **Shaiq Muhammad** — student learning platform · **shaiqmuhammad.com** · Dubai, UAE
