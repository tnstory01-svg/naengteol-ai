# Limited Feature Recovery Plan

## Goal

Make the public GitHub Pages site usable by other people while keeping admin
and secret-backed operations private.

The current GitHub Pages deployment is static. It can run browser-only features,
but it cannot run `server.js`, read `.env`, call Groq securely, or use the
Supabase service role key. To unlock login, pantry DB, AI recommendations,
recommendation history, and chatbot responses, the static frontend must call a
separately deployed Node backend.

## Current Public Site

URL:

```text
https://tnstory01-svg.github.io/naengteol-ai/
```

Works now:

- Notes stored in each visitor's browser localStorage.
- Living-alone shopping checklist.
- Checked shopping items exported to notes.
- Category explorer.
- Client-side demo recommendations.

Limited now:

- Login and signup.
- Pantry DB save/load.
- Recommendation history.
- Groq AI recommendations.
- Support chatbot API responses.
- Admin controls.

## Target Architecture

```text
Visitor browser
  -> GitHub Pages static frontend
  -> Public HTTPS Node API backend
  -> Supabase database
  -> Groq API
```

The browser must never receive these secrets:

- `GROQ_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `.env`
- `data/app.db.json`

## Feature Recovery Matrix

| Feature | Required action | Notes |
| --- | --- | --- |
| Login/signup | Deploy `server.js` as HTTPS backend | Needs cross-site cookies or same-domain hosting. |
| Pantry DB | Use Supabase as primary DB | Run `supabase/schema.sql`; keep service role key server-side only. |
| Recommendation history | Use Supabase-backed server routes | Requires authenticated session and `/api/recommendations`. |
| Groq AI recommendation | Set Groq env vars on backend | Browser calls `/api/recommend`; backend calls Groq. |
| Support chatbot | Point Pages to backend `/api/support/chat` | Could also add a client fallback later. |
| Admin controls | Keep owner/admin-only | Do not expose service role key or admin data to the browser. |

## Implementation Plan

### Phase 1: Backend Deployment

Deploy the existing Node server to one backend host.

Recommended path:

1. Use Render or Railway because the repo already includes `Dockerfile`,
   `render.yaml`, and `railway.toml`.
2. Set start command to `node server.js`.
3. Set health check to `/health`.
4. Configure environment variables on the backend host, not in Git:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<platform-provided>
SESSION_COOKIE_SECURE=true
GROQ_API_KEY=<real secret>
GROQ_MODEL=qwen/qwen3-32b
GROQ_API_BASE_URL=https://api.groq.com/openai/v1
GROQ_MAX_TOKENS=2200
SUPABASE_DB_ENABLED=true
SUPABASE_URL=<project URL>
SUPABASE_SERVICE_ROLE_KEY=<real secret>
SUPABASE_SCHEMA=public
SUPABASE_MAX_ROWS=5000
```

Acceptance check:

```text
GET https://<backend-domain>/health
```

returns `ok: true`, `groqConfigured: true`, and
`supabaseDatabaseConfigured: true`.

### Phase 2: Supabase Setup

1. Create or select a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Store only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the backend
   host's secret settings.
4. Do not put service role keys in `public/`, GitHub Pages, README, or browser
   config.

Acceptance check:

- Create an account through the backend site.
- Add a pantry item.
- Confirm the item remains after refresh and another login.

### Phase 3: Cross-Origin Frontend to Backend Wiring

GitHub Pages and the backend will be different origins, for example:

```text
https://tnstory01-svg.github.io
https://naengteol-ai.onrender.com
```

Required code changes:

1. Add backend CORS support for the Pages origin.
2. Add `Access-Control-Allow-Credentials: true` for authenticated routes.
3. Support `OPTIONS` preflight requests.
4. Update CSRF/origin checks to allow the configured Pages origin.
5. For cross-site login cookies, use `SameSite=None; Secure` in production.
   `SameSite=Lax` is not enough when the frontend is on `github.io` and the API
   is on another domain.
6. Add a public frontend config file or inline config before `app.js`:

```html
<script>
  window.NAENGTEOL_API_BASE_URL = "https://<backend-domain>";
</script>
```

The current `public/app.js` already reads `window.NAENGTEOL_API_BASE_URL`, so
the main missing work is shipping that value in the Pages build and making the
backend accept the Pages origin safely.

Acceptance check:

- Open the GitHub Pages URL on another device.
- Register/login.
- Add pantry item.
- Request AI recommendation.
- Refresh and confirm session/history still work.

### Phase 4: Admin Boundary

Admin should stay private even after public release.

Required actions:

1. Keep admin routes behind session auth and `role === "admin"`.
2. Do not show admin data to non-admin accounts.
3. Keep initial admin credentials only in backend environment variables.
4. Avoid documenting real admin email/password in public files.
5. Consider hiding the admin panel entirely unless `/api/auth/session` confirms
   an admin user.

Acceptance check:

- Normal user cannot see user list, blocked IPs, or role controls.
- Direct calls to `/api/admin/*` return 401 or 403 for non-admin users.

### Phase 5: GitHub Pages Redeploy

After frontend config and backend CORS/cookie changes:

1. Commit changes to `main`.
2. Push `main`.
3. Recreate the `gh-pages` branch from `public/`.
4. Verify:

```text
https://tnstory01-svg.github.io/naengteol-ai/
```

Expected result:

- Browser-only features still work.
- Server-backed features work through the backend API.
- Admin remains restricted.

## Next.js Decision

Do not migrate to Next.js just to solve this deployment issue.

Reasons:

- GitHub Pages can only serve static files.
- A Next.js GitHub Pages deployment still needs static export.
- Static export cannot securely run Groq calls or hold Supabase service role
  secrets.
- The current app already has static files and a separate Node server, which is
  the simpler architecture for this project.

Consider Next.js later only if the UI grows enough to need routing, components,
or a larger frontend build system. It is not required for making other people's
devices use the app.

## Safety Checklist Before Each Public Push

- `.env` is ignored.
- `data/` is ignored.
- No real API keys in tracked files.
- No real admin password in tracked files.
- `SUPABASE_SERVICE_ROLE_KEY` appears only as a placeholder in docs/examples.
- `GROQ_API_KEY` appears only as a placeholder in docs/examples.
- `public/` contains no secrets.

