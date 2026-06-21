---
title: Deployment Model
slug: deployment-model
category: operations
summary: How static hosting, Node backend, AI, and database deployment fit together.
source: README.md, docs/deployment.md, docs/limited-feature-recovery-plan.md
updated: 2026-06-21
tags: [deployment, github-pages, backend, secrets]
---

# Deployment Model

The repository can serve both a static browser app and a Node backend, but those
deployment targets have different capabilities.

## Local development

Run the app with:

```bash
node server.js
```

The project is intentionally dependency-free for local startup. Do not run
`npm install` or `npm uninstall` for this wiki work.

Local defaults:

- Port: `3000`
- Static files: `public/`
- Local database: `data/app.db.json`
- AI: Groq when configured, deterministic fallback otherwise

## Static GitHub Pages

GitHub Pages can host the files in `public/` at:

```text
https://tnstory01-svg.github.io/naengteol-ai/
```

Static hosting can support browser-only tools, but it cannot run `server.js`,
read `.env`, call Groq securely, use the Supabase service role key, or manage
HttpOnly backend sessions by itself.

Works best on static hosting:

- Static navigation.
- Notes stored in each visitor's browser.
- Shopping checklist.
- Places and tips pages.
- Client-side demo-style interactions.

Requires a backend:

- Login and signup.
- Pantry DB.
- Recommendation history.
- Groq AI recommendations.
- Support chatbot API responses.
- Admin controls.

## Node backend

The backend can run on a host such as Render or Railway. The repo already
contains deployment files such as `Dockerfile`, `render.yaml`, `railway.toml`,
and `Procfile`.

Important backend environment variables:

- `HOST`
- `PORT`
- `NODE_ENV`
- `SESSION_COOKIE_SECURE`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_API_BASE_URL`
- `SUPABASE_DB_ENABLED`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA`

Do not commit real values for these settings.

## Static frontend plus backend API

When GitHub Pages and the backend are on different origins, the frontend must be
configured with the backend base URL and the backend must safely allow that
origin. Existing frontend code reads `window.NAENGTEOL_API_BASE_URL`.

For authenticated cross-origin usage, backend CORS, credentials, CSRF origin
checks, and cookie `SameSite=None; Secure` behavior must be handled together.

## Verification anchors

- `GET /health` should return `ok: true`.
- `databaseProvider` should show `local` or `supabase`.
- `aiProvider` should show `groq` only when Groq env vars are configured.
- A public static deployment without backend configuration should not claim that
  secret-backed features are available.
