import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseDatabase } from "../lib/supabase-db.js";
import { LocalDatabase } from "../lib/local-db.js";

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

test("both adapters reject missing or ambiguous CRUD owners before accessing storage", async () => {
  for (const db of [new LocalDatabase("unused-invalid-owner.json"), database()]) {
    for (const owner of [{}, { userId: "u1", guestSessionId: "g1" }]) {
      for (const run of [
        () => db.listPantryItems(owner),
        () => db.insertPantryItem({ ...owner, name: "egg" }),
        () => db.updateOwnedPantryItem(owner, "p1", { quantity: "2" }),
        () => db.deleteOwnedPantryItem(owner, "p1"),
        () => db.listShortcuts(owner),
        () => db.recordShortcut({ ...owner, shortcutId: "quick" }),
        () => db.deleteShortcut({ ...owner, shortcutId: "quick" })
      ]) await assert.rejects(run, /exactly one owner/);
    }
  }
});

test("Supabase owned CRUD sends scoped queries and maps missing rows consistently", async () => {
  for (const owner of [{ userId: "u1" }, { guestSessionId: "g1" }]) {
    const column = owner.userId ? "user_id" : "guest_session_id";
    const value = owner.userId || owner.guestSessionId;
    const calls = [];
    const db = database();
    await withMockFetch(async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get(column), `eq.${value}`);
      assert.equal(parsed.searchParams.has(owner.userId ? "guest_session_id" : "user_id"), false);
      calls.push({ query: parsed.searchParams, method: options.method, body: options.body });
      return jsonResponse([]);
    }, async () => {
      assert.deepEqual(await db.listPantryItems(owner), []);
      assert.equal(calls.at(-1).query.get("order"), "expires_at.asc.nullslast,created_at.desc");
      assert.equal(await db.updateOwnedPantryItem(owner, "p1", { quantity: "2" }), null);
      assert.equal(calls.at(-1).method, "PATCH");
      assert.equal(calls.at(-1).query.get("id"), "eq.p1");
      assert.deepEqual(JSON.parse(calls.at(-1).body), { quantity: "2" });
      assert.equal(await db.deleteOwnedPantryItem(owner, "p1"), false);
      assert.equal(calls.at(-1).method, "DELETE");
      assert.equal(calls.at(-1).query.get("id"), "eq.p1");
      assert.deepEqual(await db.listShortcuts(owner), []);
      assert.equal(calls.at(-1).query.get("order"), "created_at.asc");
      assert.equal(await db.deleteShortcut({ ...owner, shortcutId: "quick" }), false);
      assert.equal(calls.at(-1).query.get("shortcut_id"), "eq.quick");
      assert.equal(calls.at(-1).query.has("id"), false);
    });
  }
});

test("pantry patches preserve omitted fields and allow explicit clearing", async () => {
  const db = database();
  for (const update of [
    (patch) => db.updateOwnedPantryItem({ guestSessionId: "g1" }, "p1", patch),
    (patch) => db.updatePantryItem("u1", "p1", patch)
  ]) {
    let body;
    await withMockFetch(async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse([{ id: "p1", name: "egg", quantity: "", expires_at: null }]);
    }, async () => {
      await update({ quantity: "", expiresAt: null });
      assert.deepEqual(body, { quantity: "", expires_at: null });
      await update({ name: "egg", userId: "other", guestSessionId: "other", id: "other" });
      assert.deepEqual(body, { name: "egg" });
    });
  }
});

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

test("duplicate insert retains only its safe SQLSTATE for conflict handling", async () => {
  const privateDetail = "sensitive-email-and-SQL-must-not-leak";
  await withMockFetch(async () => jsonResponse({ code: "23505", message: privateDetail, details: privateDetail }, 409), async () => {
    await assert.rejects(database().insertUser({ id: "u1", email: "test@example.invalid" }), (error) => {
      assert.equal(error.databaseCode, "23505");
      assert.equal(error.upstreamStatus, 409);
      assert.equal(error.message.includes(privateDetail), false);
      assert.equal(JSON.stringify(error).includes(privateDetail), false);
      return true;
    });
  });
});
