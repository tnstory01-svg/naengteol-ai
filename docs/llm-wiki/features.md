---
title: Feature Map
slug: feature-map
category: product
summary: User-facing features and where each feature lives in the repository.
source: README.md, public/, server.js
updated: 2026-06-21
tags: [features, frontend, backend]
---

# Feature Map

## 냉장고 재료 털기

The main screen accepts ingredients, goal, serving count, maximum cook time, and
priority notes. It renders three recipe cards, missing ingredients, priority
ingredients, and savings metrics.

Primary files:

- `public/index.html`
- `public/app.js`
- `server.js`

Backend dependency:

- `POST /api/recommend` for server-backed recommendations.
- Browser fallback data when the server or AI path is unavailable.

## Account, pantry, and history

Users can register, log in, save pantry items, reuse pantry ingredients, and see
recent recommendation history. Sessions use an HttpOnly cookie and CSRF token.

Primary files:

- `public/login.html`
- `public/register.html`
- `public/auth.js`
- `public/app.js`
- `server.js`
- `lib/local-db.js`
- `lib/supabase-db.js`

## Admin controls

Admin users can review accounts, change role/status, block user IP hashes, and
remove IP blocks. Admin routes require a logged-in admin session.

Primary routes:

- `GET /api/admin/overview`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/block-ip`
- `DELETE /api/admin/ip-blocks/:id`

## Notes

The notes page stores local browser notes for shopping plans, fridge cleanup,
and living-alone tasks. This is a browser tool, not a server-backed document
database.

Primary files:

- `public/notes.html`
- `public/tools.js`

## Shopping, places, and tips

The app includes helper screens for living-alone shopping checklists, place
recommendations, and tips. These screens are part of the public static app and
can work on GitHub Pages when they do not need backend APIs.

Primary files:

- `public/shopping.html`
- `public/places.html`
- `public/places.js`
- `public/tips.html`
- `public/tips.js`
- `public/tools.js`

## Support chatbot

The chatbot UI sends user questions to `POST /api/support/chat`. On a static
GitHub Pages deployment without a backend, this server-backed path is limited.

Primary files:

- `public/chatbot.html`
- `public/tools.js`
- `server.js`
