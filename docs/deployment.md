# Deployment

냉장고 재료는 dependency-free Node 서버라서 패키지 설치 없이 배포할 수 있습니다.

## Required Runtime

- Node.js 18 or newer
- Start command: `node server.js`
- Health check path: `/health`
- Public port: platform-provided `PORT`
- Bind host: `0.0.0.0`

## Environment Variables

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<platform-provided>
GROQ_API_KEY=<optional>
GROQ_MODEL=qwen/qwen3-32b
GROQ_API_BASE_URL=https://api.groq.com/openai/v1
GROQ_MAX_TOKENS=2200
SESSION_TTL_DAYS=7
SESSION_COOKIE_SECURE=true
LOCAL_DB_PATH=<optional server-writable path>
SUPABASE_DB_ENABLED=true
SUPABASE_URL=<optional Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<optional Supabase service role key>
SUPABASE_SCHEMA=public
SUPABASE_MAX_ROWS=5000
```

If `GROQ_API_KEY` is empty, the app uses deterministic fallback recommendations.
If Supabase URL and service role key are set, server-side auth, pantry, sessions,
recommendation history, and savings logs use Supabase as the primary database.
Run `supabase/schema.sql` in the Supabase SQL editor before enabling it.
If Supabase variables are empty, the app uses the local JSON DB at
`LOCAL_DB_PATH` or `./data/app.db.json`.
Do not expose `SUPABASE_SERVICE_ROLE_KEY` or local DB files to the browser.

## Render

Use the included `render.yaml` Blueprint. Render will build from `Dockerfile`,
run the web service, and check `/health`.

Set these secrets in Render:

```text
GROQ_API_KEY
SESSION_COOKIE_SECURE=true
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## Railway

Use the included `railway.toml`. Railway will build from `Dockerfile`, run
`node server.js`, and use `/health` as the health check.

## GitHub Pages

GitHub Pages serves the static files in `public/` from the `gh-pages` branch.
No npm install step is required.

The Pages URL is expected to be:

```text
https://tnstory01-svg.github.io/naengteol-ai/
```

Static Pages mode supports the browser-only screens such as notes, shopping
checklist, and client-side demo recommendations. Server-only features such as
secure login, pantry DB sync, admin controls, Groq calls, Supabase service-role
access, recommendation history, and `/api/*` routes still require the Node
server on Render, Railway, Docker, or another backend host.

## Docker

Build:

```bash
docker build -t fridge-ingredients .
```

Run:

```bash
docker run --rm -p 3000:3000 --env-file .env fridge-ingredients
```
