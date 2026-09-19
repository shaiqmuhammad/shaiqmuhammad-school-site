# Shaiq Muhammad — Public School Website

Public-facing website for **Shaiq Muhammad**, an independent day school brand based in Dubai, UAE. Built with Next.js (App Router), TypeScript, and Tailwind CSS. British English (en-GB).

This site does **not** implement Admin / SLT / Teacher / Student / Parent dashboards — those live in a separate Login Portal (e.g. Gibbon). The `/login` page links to that portal.

## Stack

- Next.js (App Router) + TypeScript — **static HTML export** (`output: "export"`)
- Tailwind CSS
- `next-themes` (light / dark / system)
- Local content under `src/content/` (TS modules — no CMS or paid services)

## Setup

```bash
cd shaiqmuhammad-school-site
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_PORTAL_URL` | Absolute URL of the Login Portal | `http://localhost:8080` |

See `.env.example`. Do not commit secrets.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production static export (writes to `out/`) |
| `npm run start` | Serve production build (Node server; not used for Cloudflare static) |
| `npm run lint` | ESLint |

## Editing content

All copy lives in `src/content/`:

| File | Content |
|---|---|
| `site.ts` | Brand name, contact details, nav links |
| `announcements.ts` | Header ticker items |
| `home.ts` | Stats (sample) & testimonials |
| `about.ts` | Mission, vision, history, accreditation |
| `academics.ts` | Programmes & curriculum pillars |
| `admissions.ts` | Process, eligibility, sample fees |
| `faculty.ts` | Sample staff directory |
| `facilities.ts` | Labs, library, sports, transport |
| `news.ts` | News list & article bodies |
| `gallery.ts` | Gallery image seeds |
| `login.ts` | Portal role descriptions & URL helper |

Images use `picsum.photos` seeds via `next/image` (unoptimised for static export). Replace seeds or URLs when you have real photography.

## Routes

- `/` — Home
- `/about` — Mission, vision, history, accreditation
- `/academics` — Programmes & curriculum
- `/admissions` — Process, fees (sample), enquiry form
- `/faculty` — Staff directory (sample)
- `/facilities` — Campus facilities
- `/news` — News list
- `/news/[slug]` — News article
- `/gallery` — Image grid
- `/contact` — Contact form & map placeholder
- `/login` — Login Portal explanation + CTA

## Deploy (Cloudflare Pages — free static)

The site is configured for **static HTML export**. Cloudflare Pages can host it on the free tier with no Workers or paid services.

1. Push the repo to GitHub.
2. In [Cloudflare Pages](https://dash.cloudflare.com/) → **Create** → connect the GitHub repo `shaiqmuhammad/shaiqmuhammad-school-site`.
3. Build settings:
   - **Framework preset:** Next.js (Static HTML Export) **or** None
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Node version:** `20` or `22` (set via Environment variable `NODE_VERSION=20` or `22`, or the Pages UI)
4. Optional environment variable:
   - `NEXT_PUBLIC_PORTAL_URL` — absolute URL of the Login Portal (baked in at build time)
5. Save and deploy. Pages will serve the contents of `out/`.

Local preview of the static build:

```bash
npm run build
npx serve out
```

## Brand notes

- School / brand: **Shaiq Muhammad**
- Domain: **shaiqmuhammad.com**
- Location: Dubai, UAE
- Do **not** invent affiliation with Raffles International School or any other real school.

## Licence

Private project content. Framework packages retain their own licences.
