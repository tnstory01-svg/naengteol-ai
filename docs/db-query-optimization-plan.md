# DB and Query Optimization Plan

## Confirmed Decisions

- Supabase is the operating database target.
- Anonymous recommendation data should be retained long term.
- Admin overview can move to pagination instead of returning every user in one response.
- Start execution with query optimization before broader UI or framework restructuring.
- Do not place API keys, Supabase service role keys, DB passwords, or other secrets in code.
- Do not create or edit `.env` files as part of this work.

## Current Bottleneck Proof

- `lib/supabase-db.js` previously loaded every dataset with `select=*` and `limit=SUPABASE_MAX_ROWS` for each `db.get()` and `db.mutate()`.
- `server.js` calls session resolution and IP block checks before most API handlers, which made small API calls depend on broad DB reads.
- Pantry and recommendation history handlers only need one user's rows, but the snapshot adapter loaded all tables first.
- Recommendation logging only needs inserts plus authenticated-user trimming, but the previous path reloaded and diffed all datasets.

## Phase 2 Scope Started

The query optimization passes add direct Supabase access methods for high-frequency paths while preserving the local JSON DB fallback:

- user lookup by email
- active session lookup by token hash
- session insert/delete
- IP block lookup by IP hash
- pantry list/create/update/delete by user
- recommendation history list by user and limit
- recommendation and savings log insert

- admin overview user pagination and page-level admin counts
- admin user status/role update
- admin IP block/unblock
- registration user insert
- admin bootstrap direct upsert

The fallback snapshot methods remain available for local JSON DB compatibility and any lower-frequency paths not yet split into repository methods.

## Remaining Work

### Next Work Order

Start with measurement, not another refactor. The next session should first prove whether the two query-optimization commits actually reduced Supabase traffic and then decide if caching can be added without hiding stale auth/admin data.

Use this command prompt for the next coding session:

```txt
Continue from commit 6d75a8e on main.

Goal: close the query-optimization measurement gap and begin Phase 3 caching only after evidence is collected.

Constraints:
- Do not edit or create .env files.
- Do not add secrets to code or docs.
- Do not run npm install/delete.
- Keep Supabase as the operating DB target and local JSON DB as fallback.
- Preserve current multi-page HTML structure; do not introduce React/Vue/Svelte/Vite yet.

First task:
1. Add a lightweight measurement plan or debug-only instrumentation for these paths:
   - initial page load health/session/protected-data requests
   - /api/admin/overview?userPage=1&userPageSize=25
   - /api/pantry
   - /api/recommendations?limit=8
   - /api/recommend anonymous and authenticated flows
2. Capture before/after-style evidence using local mock Supabase or Supabase REST logs without exposing secrets.
3. Record request count, duplicate request count, row count, and any select=* usage.

Then do:
4. Remove or fold the legacy standalone `logRecommendationToSupabase` helper into the Supabase database adapter if it is redundant.
5. Design and implement the smallest safe Phase 3 client memory cache:
   - cache /health briefly
   - cache /api/auth/session only during one page lifecycle
   - cache /api/pantry and /api/recommendations per logged-in user
   - invalidate pantry after create/update/delete
   - invalidate recommendations after successful recommend
   - clear all user-scoped cache on logout or any 401
6. Do not use localStorage for sensitive authenticated data in this phase.

Validation:
- node --check server.js
- node --check lib/supabase-db.js
- node --check public/app.js
- local server smoke for anonymous recommend
- local admin login + /api/admin/overview smoke
- mock Supabase probe proving no startup select=* and expected targeted request counts
- git diff --check

Commit and push the completed phase to origin/main.
```

### Phase 2 Follow-up

- Add Supabase query timing evidence from REST logs before and after the change.
- Consider an RPC/view for admin overview if page-level fan-out still costs too much after measuring.
- Move the remaining legacy standalone recommendation logging helper into the Supabase database adapter or remove it if redundant.

### Phase 3 Cache Design

- Add short-lived client memory cache for health/session/pantry/history.
- Invalidate pantry cache after create/update/delete.
- Invalidate or update history after recommendation success.
- Clear all user-scoped cache on logout or 401.

### Phase 4 DB/Index Work

- Keep existing indexes for user/date access paths.
- Add views/RPC only after measuring admin and history query cost.
- Decide whether `anonymous_users` should become a real parent table for anonymous recommendation rows.

### Phase 5 Structure Work

Recommended structure, without framework migration:

```txt
src/
  pages/
  services/
  repositories/
  cache/
  lib/
  utils/
  config/
```

Do not introduce React/Vue/Svelte/Vite until request volume and maintainability issues remain after services/repositories/cache separation.

## Verification Checklist

- `node --check server.js`
- `node --check lib/supabase-db.js`
- Local server smoke through `/health`
- Auth session route returns JSON
- Recommendation route still works in fallback mode
- `git diff -- . ':!.env'` confirms no secret or `.env` changes
