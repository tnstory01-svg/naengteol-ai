---
title: API Reference Summary
slug: api-reference-summary
category: backend
summary: Current server routes and their high-level responsibilities.
source: server.js, README.md, public/app.js, public/tools.js
updated: 2026-06-21
tags: [api, routes, backend, auth]
---

# API Reference Summary

The Node server serves static files and handles all `/api/*` routes. API routes
apply origin checks, rate limits, session resolution, and IP block checks where
appropriate. Treat `server.js` as the source of truth for exact request and
response details.

## Health

`GET /health`

Returns runtime capability flags such as AI configuration, database provider,
Supabase configuration, and auth availability.

## Authentication

`POST /api/auth/register`

Creates a user account after email and password validation.

`POST /api/auth/login`

Verifies credentials, creates a server-side session, and sets the session
cookie.

`POST /api/auth/logout`

Clears the current session.

`GET /api/auth/session`

Returns the current session state, user identity, and CSRF token when logged in.

## Pantry

`GET /api/pantry`

Returns pantry items for the logged-in user.

`POST /api/pantry`

Creates a pantry item.

`PATCH /api/pantry/:id`

Updates a pantry item owned by the logged-in user.

`DELETE /api/pantry/:id`

Deletes a pantry item owned by the logged-in user.

## Recommendations

`POST /api/recommend`

Accepts ingredient input and recommendation preferences. The server calls Groq
when `GROQ_API_KEY` and `GROQ_MODEL` are configured, validates and normalizes the
structured response, and otherwise returns deterministic fallback
recommendations. It also logs recommendation and savings data when a persistent
database is active.

Expected recommendation concepts:

- Three recipe cards.
- Owned ingredients.
- Missing ingredients.
- Cook time and difficulty.
- Three to six cooking steps.
- Estimated savings.
- Priority ingredients.
- Summary text.

`GET /api/recommendations`

Returns saved recommendation history for the logged-in user. The frontend calls
this with a `limit` query parameter.

## Support chatbot

`POST /api/support/chat`

Accepts a support question and returns an answer with optional suggestions and
links. The chatbot UI is available from `public/chatbot.html` and the floating
support widget.

## Admin

`GET /api/admin/overview`

Returns admin overview data for admin users.

`PATCH /api/admin/users/:id`

Updates supported account controls such as user role or status.

`POST /api/admin/users/:id/block-ip`

Creates an IP block based on the selected user's recent session metadata.

`DELETE /api/admin/ip-blocks/:id`

Removes an existing IP block.

## API safety rules

- Frontend code must not receive secret keys.
- Groq calls belong on the server.
- Supabase service-role access belongs on the server.
- Authenticated state depends on server-managed cookies and CSRF tokens.
- Admin routes must remain unavailable to non-admin users.
