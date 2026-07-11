import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseDatabase } from "../lib/supabase-db.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function withMockFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => { globalThis.fetch = original; });
}

function database() {
  return new SupabaseDatabase({ url: "https://example.supabase.co", serviceRoleKey: "test-service-role" });
}

test("selection uses one transaction-backed RPC and maps immutable snapshot", async () => {
  const calls = [];
  await withMockFetch(async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ outcome: "created", selection: { id: "s1", guest_session_id: "g1", recommendation_id: "r1", recipe_id: "recipe-1", idempotency_key: "key-1", recipe_snapshot: { id: "recipe-1", estimatedSavings: 8200 }, estimated_savings: 8200, selected_at: "2026-07-11T00:00:00Z" } });
  }, async () => {
    const result = await database().recordMenuSelection({ guestSessionId: "g1", recommendationId: "r1", recipeId: "recipe-1", idempotencyKey: "key-1" });
    assert.equal(result.realizedSavings, 8200);
    assert.equal(result.recipeId, "recipe-1");
    assert.equal(result.outcome, "created");
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/record_menu_selection$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_owner_user_id: null, p_guest_session_id: "g1", p_recommendation_id: "r1", p_recipe_id: "recipe-1", p_idempotency_key: "key-1" });
});

test("realized total queries menu selections and never savings logs", async () => {
  const urls = [];
  const total = await withMockFetch(async (url) => {
    urls.push(String(url));
    return jsonResponse([{ estimated_savings: 5000 }, { estimated_savings: 3000 }]);
  }, () => database().getRealizedSavingsTotal({ guestSessionId: "g1" }));
  assert.equal(total, 8000);
  assert.equal(urls.some((url) => url.includes("savings_logs")), false);
});

test("merge sends one idempotent RPC and reads stored step summary", async () => {
  const calls = [];
  const result = await withMockFetch(async (url, options) => {
    calls.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith("rpc/merge_guest_into_account")) return jsonResponse("tx1");
    return jsonResponse([{ id: "tx1", guest_session_id: "g1", user_id: "u1", idempotency_key: "merge-1", status: "succeeded", created_at: "2026-07-11T00:00:00Z", completed_at: "2026-07-11T00:00:01Z", merge_transaction_steps: [{ id: "step1", category: "pantry_items", status: "succeeded", attempts: 1, added_count: 2, account_kept_count: 1, skipped_count: 0, failed_count: 0 }] }]);
  }, () => database().mergeGuestIntoAccount({ guestSessionId: "g1", userId: "u1", idempotencyKey: "merge-1" }));
  assert.equal(result.id, "tx1");
  assert.equal(result.steps[0].accountKeptCount, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("rpc/merge_guest_into_account")).length, 1);
  assert.equal(calls[0].body.p_idempotency_key, "merge-1");
});

test("owner and selection identifiers are mandatory", async () => {
  await assert.rejects(() => database().recordMenuSelection({ guestSessionId: "g1", recommendationId: "r1", idempotencyKey: "key" }), /recipeId/);
  await assert.rejects(() => database().recordMenuSelection({ userId: "u1", guestSessionId: "g1", recommendationId: "r1", recipeId: "recipe-1", idempotencyKey: "key" }), /exactly one owner/);
});

test("exposure lookup scopes recommendation IDs to the durable owner", async () => {
  const urls = [];
  const exposure = await withMockFetch(async (url) => {
    urls.push(String(url));
    return jsonResponse([{ id: "r1", user_id: null, anonymous_id: "guest:g1", input_ingredients: ["계란"], preferences: {}, ai_response: { recipes: [{ id: "recipe-1" }], source: "fallback" }, created_at: "2026-07-11T00:00:00Z" }]);
  }, () => database().getRecommendationExposure({ guestSessionId: "g1", recommendationId: "r1" }));
  assert.equal(exposure.id, "r1");
  assert.equal(exposure.recommendation.recipes[0].id, "recipe-1");
  assert.match(urls[0], /id=eq\.r1/);
  assert.match(urls[0], /anonymous_id=eq\.guest%3Ag1/);
});

test("pantry rows preserve guest owner and stable ID columns", async () => {
  let body;
  const item = await withMockFetch(async (_url, options) => {
    body = JSON.parse(options.body);
    return jsonResponse([{ id: "p1", user_id: null, guest_session_id: "g1", stable_id: "egg", anonymous_id: null, name: "계란", quantity: "1팩", expires_at: null, created_at: "2026-07-11T00:00:00Z", updated_at: "2026-07-11T00:00:00Z" }]);
  }, () => database().insertPantryItem({ id: "p1", guestSessionId: "g1", stableId: "egg", name: "계란", quantity: "1팩" }));
  assert.equal(body.guest_session_id, "g1");
  assert.equal(body.stable_id, "egg");
  assert.equal(item.guestSessionId, "g1");
  assert.equal(item.stableId, "egg");
});

test("selection RPC maps replay and conflict outcomes without generic errors", async () => {
  for (const outcome of ["replayed", "conflict"]) {
    const result = await withMockFetch(async () => jsonResponse({ outcome, selection: { id: "s1", guest_session_id: "g1", recommendation_id: "r1", recipe_id: "recipe-1", idempotency_key: "key-1", recipe_snapshot: { id: "recipe-1" }, estimated_savings: 10, selected_at: "2026-07-11T00:00:00Z" } }), () => database().recordMenuSelection({ guestSessionId: "g1", recommendationId: "r1", recipeId: "recipe-1", idempotencyKey: "key-1" }));
    assert.equal(result.outcome, outcome);
    assert.equal(result.id, "s1");
  }
});

test("selection lookup is owner scoped for post-merge replay", async () => {
  let requested;
  const selection = await withMockFetch(async (url) => { requested = String(url); return jsonResponse([{ id: "s1", user_id: "u1", recommendation_id: "r1", recipe_id: "recipe-1", idempotency_key: "key-1", recipe_snapshot: { id: "recipe-1" }, estimated_savings: 10, selected_at: "2026-07-11T00:00:00Z" }]); }, () => database().findMenuSelection({ userId: "u1", idempotencyKey: "key-1" }));
  assert.equal(selection.id, "s1");
  assert.match(requested, /user_id=eq\.u1/);
  assert.match(requested, /idempotency_key=eq\.key-1/);
});
