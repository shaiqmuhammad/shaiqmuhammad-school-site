# assessment-session (Cloudflare Worker + Durable Object)

Live **group assessments** for the static site: teacher creates a session, students join with a
short code or QR, everyone shares one start time and timer, each student gets a shuffled question
order, and the class results table (name, score, correct, wrong, %) is computed on the server.

- One Durable Object per session (`idFromName(code)`), SQLite storage backend (Workers **Free** plan OK).
- Scoring imports `../../src/lib/quiz.ts`, so group scores match the individual player exactly.
- Students never receive the answer key during the attempt (`correct`, `blanks`, explanations stripped).
- Sessions self-delete 24 h after creation (DO alarm).

Live URL: `https://assessment-session.hidden-wildflower-498c.workers.dev`
(the site uses it by default; override with `NEXT_PUBLIC_ASSESSMENT_API_URL` at build time).

## Deploy / update

```bash
cd workers/assessment-session
npm install
npx wrangler login      # once per machine
npx wrangler deploy     # wrangler 3.x works on Node 20; wrangler 4 needs Node 22+
```

Optional teacher secret (then anyone creating a session must enter it on the host screen):

```bash
npx wrangler secret put HOST_SECRET
```

## API (JSON, CORS `*`)

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| POST | `/api/session/create` | `{quiz, durationSec?, teacherSecret?}` | returns `code`, `hostKey` |
| GET | `/api/session/:code` | | join info, status, `startAt`, `endAt`, server `now`, participants |
| POST | `/api/session/:code/join` | `{name}` | returns `participantId`, `token` |
| GET | `/api/session/:code/me` | `?pid=&token=` | state + shuffled questions once started |
| POST | `/api/session/:code/answer` | `{pid, token, questionId, answer}` | saved server-side |
| POST | `/api/session/:code/submit` | `{pid, token, answers?}` | final sync + finish |
| POST | `/api/session/:code/start` | `{hostKey, countdownSec?}` | sets shared `startAt`/`endAt` |
| POST | `/api/session/:code/end` | `{hostKey}` | ends for everyone |
| GET | `/api/session/:code/results` | `?hostKey=` | host any time; everyone after the end |

Status flow: `lobby` → (`start`) → `countdown` → `running` → (`endAt` reached or `end`) → `ended`.

Local dev: `npx wrangler dev` then point the site at it with
`NEXT_PUBLIC_ASSESSMENT_API_URL=http://127.0.0.1:8787 npm run dev`.
