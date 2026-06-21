---
title: Data Model
slug: data-model
category: backend
summary: Storage concepts for local JSON and Supabase-backed modes.
source: lib/local-db.js, lib/supabase-db.js, supabase/schema.sql
updated: 2026-06-21
tags: [data, local-db, supabase, schema]
---

# Data Model

The app supports two persistence modes behind a common database adapter shape:
local JSON storage and Supabase REST storage.

## Local JSON mode

When Supabase is not enabled, the server uses `LocalDatabase` with
`data/app.db.json` by default. The `data/` directory is ignored by Git.

Collections:

- `users`
- `sessions`
- `ipBlocks`
- `pantryItems`
- `recommendationLogs`
- `savingsLogs`

The local adapter serializes writes through a queue and writes a full JSON file
atomically through a temporary file followed by rename.

## Supabase mode

Supabase is used when `SUPABASE_DB_ENABLED=true` and server-side Supabase
settings are configured. The schema file defines these tables:

- `app_users`
- `app_user_sessions`
- `ip_blocks`
- `anonymous_users`
- `pantry_items`
- `recommendation_logs`
- `savings_logs`

The service role key must stay server-side. Browser code must not access it.

## Core data concepts

Users:

- Store email, password hash metadata, display name, role, status, and timestamps.
- Roles are limited by the server to supported values.
- Status controls whether a user is active or suspended.

Sessions:

- Store hashed session tokens, CSRF tokens, expiry, and client metadata.
- Browser receives an HttpOnly session cookie, not the raw database record.

Pantry items:

- Store ingredient name, quantity, optional expiration date, and owner.
- Used by the frontend to fill recommendation input.

Recommendation logs:

- Store ingredient input, normalized AI or fallback response, and timestamps.
- Used for account recommendation history.

Savings logs:

- Store recipe-level estimated savings for reporting and totals.

IP blocks:

- Store hashed client network identifiers used by the server to deny API access
  unless the current user is an admin.

## Source of truth

Use `supabase/schema.sql` for exact Supabase columns and constraints. Use
`lib/local-db.js` and `lib/supabase-db.js` for exact adapter behavior.
