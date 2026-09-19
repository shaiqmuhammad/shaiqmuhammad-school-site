# Shaiq Muhammad — Public School Website

Public-facing website for **Shaiq Muhammad**, an independent day school brand based in Dubai, UAE. Built with Next.js (App Router), TypeScript, and Tailwind CSS. British English (en-GB).

This site does **not** implement Admin / SLT / Teacher / Student / Parent dashboards — those live in a separate Login Portal (e.g. Gibbon). The `/login` page links to that portal.

## Stack

- Next.js (App Router) + TypeScript
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
| `npm run build` | Production build |
| `npm run start` | Serve production build |
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

Images use `picsum.photos` seeds via `next/image`. Replace seeds or URLs when you have real photography.

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

## Deploy (Vercel — free tier)

1. Push the repo to GitHub / GitLab / Bitbucket.
2. Import the project in [Vercel](https://vercel.com).
3. Set `NEXT_PUBLIC_PORTAL_URL` in Project → Settings → Environment Variables.
4. Deploy. No paid add-ons required.

Alternatively:

```bash
npx vercel
```

## Brand notes

- School / brand: **Shaiq Muhammad**
- Domain: **shaiqmuhammad.com**
- Location: Dubai, UAE
- Do **not** invent affiliation with Raffles International School or any other real school.

## Licence

Private project content. Framework packages retain their own licences.
