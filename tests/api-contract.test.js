import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { flattenCatalog } from "../public/food-catalog.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 3217;
const origin = `http://127.0.0.1:${port}`;
let server;
let databaseDirectory;

async function request(pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function bootstrapGuest() {
  const result = await request("/api/guest/session", { method: "POST", body: "{}" });
  assert.equal(result.response.status, 200);
  const cookie = (result.response.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^fi_guest=/);
  assert.equal(typeof result.body.csrfToken, "string");
  assert.equal(Object.hasOwn(result.body, "guestToken"), false);
  return { cookie, csrfToken: result.body.csrfToken };
}

async function recommend(guest, body = {}) {
  return request("/api/recommend", {
    method: "POST",
    headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken },
    body: JSON.stringify({ ingredients: ["계란", "김치", "밥"], preferences: { goal: "save_money" }, ...body })
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await request("/health")).response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server.js did not become ready");
}

before(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "naengteol-api-contract-"));
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), FRONTEND_ORIGIN: "https://frontend.example", LOCAL_DB_PATH: path.join(databaseDirectory, "app.db.json"), GROQ_API_KEY: "", SUPABASE_DB_ENABLED: "false", ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "AdminStrong!234", ADMIN_DISPLAY_NAME: "검증 관리자" },
    stdio: ["ignore", "ignore", "inherit"]
  });
  await waitForServer();
});

after(async () => {
  if (server) server.kill();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("guest recommendation, selection, and merge contracts", () => {
  test("split-origin CORS allows only the configured credentialed frontend", async () => {
    const preflight = await request("/api/guest/session", {
      method: "OPTIONS",
      headers: {
        origin: "https://frontend.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-csrf-token"
      }
    });
    assert.equal(preflight.response.status, 204);
    assert.equal(preflight.response.headers.get("access-control-allow-origin"), "https://frontend.example");
    assert.equal(preflight.response.headers.get("access-control-allow-credentials"), "true");
    assert.match(preflight.response.headers.get("access-control-allow-methods"), /POST/);
    assert.match(preflight.response.headers.get("access-control-allow-headers"), /x-csrf-token/);

    const health = await request("/health", { headers: { origin: "https://frontend.example" } });
    assert.equal(health.response.status, 200);
    assert.equal(health.response.headers.get("access-control-allow-origin"), "https://frontend.example");
    assert.equal(health.response.headers.get("access-control-allow-credentials"), "true");

    const hostileHealth = await request("/health", { headers: { origin: "https://attacker.example" } });
    assert.equal(hostileHealth.response.status, 403);
    assert.equal(hostileHealth.response.headers.get("access-control-allow-origin"), null);

    const allowed = await request("/api/guest/session", {
      method: "POST",
      headers: { origin: "https://frontend.example", "sec-fetch-site": "cross-site" },
      body: "{}"
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.response.headers.get("access-control-allow-origin"), "https://frontend.example");
    assert.equal(allowed.response.headers.get("access-control-allow-credentials"), "true");
    assert.notEqual(allowed.response.headers.get("access-control-allow-origin"), "*");

    const rejected = await request("/api/guest/session", {
      method: "POST",
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      body: "{}"
    });
    assert.equal(rejected.response.status, 403);
    assert.equal(rejected.response.headers.get("access-control-allow-origin"), null);

    const forwardedHostSpoof = await request("/api/guest/session", {
      method: "POST",
      headers: {
        origin: "https://spoofed.example",
        "x-forwarded-host": "spoofed.example",
        "x-forwarded-proto": "https"
      },
      body: "{}"
    });
    assert.equal(forwardedHostSpoof.response.status, 403);
    assert.equal(forwardedHostSpoof.response.headers.get("access-control-allow-origin"), null);
  });

  test("secure deployment cookies support split-origin credentials while local cookies remain lax", async () => {
    const secureGuest = await request("/api/guest/session", {
      method: "POST",
      headers: { origin: "https://frontend.example", "x-forwarded-proto": "https" },
      body: "{}"
    });
    const secureCookie = secureGuest.response.headers.get("set-cookie") || "";
    assert.match(secureCookie, /SameSite=None/);
    assert.match(secureCookie, /;\s*Secure(?:;|$)/);
    const secureGuestCredential = secureCookie.split(";")[0];
    const secureRegistration = await request("/api/auth/register", {
      method: "POST",
      headers: {
        cookie: secureGuestCredential,
        origin: "https://frontend.example",
        "sec-fetch-site": "cross-site",
        "x-csrf-token": secureGuest.body.csrfToken,
        "x-forwarded-proto": "https"
      },
      body: JSON.stringify({
        email: "secure-cookie@example.com",
        displayName: "보안 쿠키",
        password: "StrongPass!234",
        guestMergeIdempotencyKey: "secure-cookie-registration"
      })
    });
    assert.equal(secureRegistration.response.status, 201);
    const secureSessionCookie = secureRegistration.response.headers.get("set-cookie") || "";
    assert.match(secureSessionCookie, /fi_session=/);
    assert.match(secureSessionCookie, /SameSite=None/);
    assert.match(secureSessionCookie, /;\s*Secure(?:;|$)/);

    const localGuest = await request("/api/guest/session", { method: "POST", body: "{}" });
    const localCookie = localGuest.response.headers.get("set-cookie") || "";
    assert.match(localCookie, /SameSite=Lax/);
    assert.doesNotMatch(localCookie, /;\s*Secure(?:;|$)/);
  });

  test("health and anonymous account session remain public", async () => {
    assert.equal((await request("/health")).body.ok, true);
    assert.deepEqual((await request("/api/auth/session")).body, { authenticated: false });
  });

  test("guest bootstrap uses HttpOnly cookie and reuses a valid credential", async () => {
    const guest = await bootstrapGuest();
    const reused = await request("/api/guest/session", { method: "POST", headers: { cookie: guest.cookie }, body: "{}" });
    assert.equal(reused.response.status, 200);
    assert.equal(reused.body.csrfToken, guest.csrfToken);
    assert.equal(reused.response.headers.get("set-cookie"), null);
  });

  test("recommendation requires owned guest session and CSRF", async () => {
    assert.equal((await request("/api/recommend", { method: "POST", body: JSON.stringify({ ingredients: ["계란"] }) })).response.status, 401);
    const guest = await bootstrapGuest();
    assert.equal((await request("/api/recommend", { method: "POST", headers: { cookie: guest.cookie }, body: JSON.stringify({ ingredients: ["계란"] }) })).response.status, 403);
    assert.equal((await request("/api/recommend", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": "forged-csrf" }, body: JSON.stringify({ ingredients: ["계란"] }) })).response.status, 403);
    assert.equal((await request("/api/recommend", { method: "POST", headers: { cookie: `fi_guest=${"a".repeat(64)}`, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ ingredients: ["계란"] }) })).response.status, 401);
  });

  test("guest recommendation returns stable IDs and ignores caller anonymousId authority", async () => {
    const guest = await bootstrapGuest();
    const result = await recommend(guest, { anonymousId: "forged-other-guest" });
    assert.equal(result.response.status, 200);
    assert.equal(typeof result.body.recommendationId, "string");
    assert.equal(result.body.recipes.length, 3);
    for (const recipe of result.body.recipes) {
      assert.equal(typeof recipe.id, "string");
      assert.equal(typeof recipe.reason, "string");
      assert.equal(Number.isFinite(recipe.estimatedSavings), true);
    }
  });

  test("fallback distinguishes stored aliases, submitted ingredients, and missing requirements", async () => {
    const guest = await bootstrapGuest();
    const saved = await request("/api/pantry", {
      method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken },
      body: JSON.stringify({ stableId: "content-egg", name: "달걀", quantity: "2개" })
    });
    assert.equal(saved.response.status, 201);
    const result = await recommend(guest, { ingredients: ["계란", "김치", "밥"], preferences: { maxCookTimeMinutes: 5 } });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.meta.source, "fallback");
    assert.equal(result.body.meta.logging.stored, true);
    const persisted = JSON.parse(await readFile(path.join(databaseDirectory, "app.db.json"), "utf8"));
    const exposure = persisted.recommendationLogs.find((row) => row.recommendationId === result.body.recommendationId);
    assert.ok(exposure, "recommendation exposure must exist in the temporary DB file");
    assert.deepEqual(exposure.snapshot.recipes, result.body.recipes);
    assert.deepEqual(result.body.ingredientCheck.verifiedIngredients, ["달걀"]);
    assert.deepEqual(result.body.ingredientCheck.unverifiedInputIngredients, ["김치", "밥"]);
    const equivalent = (name) => ({ "달걀": "계란", "배추김치": "김치", "즉석밥": "밥" }[name] || name);
    let ownedCount = 0;
    let inputCount = 0;
    let missingCount = 0;
    for (const recipe of result.body.recipes) {
      assert.ok(recipe.requiredIngredients.length > 0);
      const required = recipe.requiredIngredients.map((entry) => entry.name);
      assert.deepEqual(recipe.ownedIngredients, required.filter((name) => equivalent(name) === "계란"));
      assert.deepEqual(recipe.inputIngredients, required.filter((name) => ["김치", "밥"].includes(equivalent(name))));
      assert.deepEqual(recipe.missingIngredients, required.filter((name) => !["계란", "김치", "밥"].includes(equivalent(name))));
      ownedCount += recipe.ownedIngredients.length;
      inputCount += recipe.inputIngredients.length;
      missingCount += recipe.missingIngredients.length;
      assert.ok(recipe.sourceRefs.length > 0);
      assert.ok(recipe.steps.length >= 3);
      assert.ok(recipe.doneness);
      assert.match(recipe.adaptationNote, /1인분/);
      const specification = flattenCatalog().flatMap((item) => item.recipes).find((candidate) => candidate.name === recipe.name && JSON.stringify(candidate.steps) === JSON.stringify(recipe.steps));
      assert.ok(specification, "response must retain an explicit catalog method");
      assert.equal(recipe.cookTimeMinutes, specification.cookTimeMinutes, "requested time must not rewrite the recipe duration");
    }
    assert.ok(ownedCount > 0, "must exercise a stored ingredient");
    assert.ok(inputCount > 0, "must exercise a submitted-only ingredient");
    assert.ok(missingCount > 0, "must exercise a genuinely missing ingredient");
  });

  test("pantry entries beyond the prompt limit remain owned and never missing", async () => {
    const guest = await bootstrapGuest();
    const headers = { cookie: guest.cookie, "x-csrf-token": guest.csrfToken };
    for (let index = 0; index < 22; index += 1) {
      const result = await request("/api/pantry", { method: "POST", headers,
        body: JSON.stringify({ stableId: `large-pantry-${index}`, name: index === 0 ? "요거트" : `검사용재료${index}`, quantity: "1개" }) });
      assert.equal(result.response.status, 201);
    }
    const pantry = (await request("/api/pantry", { headers })).body.items;
    assert.ok(pantry.findIndex((item) => item.name === "요거트") >= 20, "fixture must exercise the truncated part of the pantry");
    const result = await recommend(guest, { ingredients: ["바나나"], preferences: { maxCookTimeMinutes: 5 } });
    assert.equal(result.response.status, 200);
    const recipe = result.body.recipes.find((item) => item.name === "바나나요거트");
    assert.ok(recipe);
    assert.deepEqual(recipe.ownedIngredients, ["요거트"]);
    assert.deepEqual(recipe.inputIngredients, ["바나나"]);
    assert.deepEqual(recipe.missingIngredients, []);
    assert.equal(result.body.ingredientCheck.databaseIngredients.length, 22);
  });

  test("selection snapshots server value, is idempotent, and rejects a second key", async () => {
    const guest = await bootstrapGuest();
    const recommendation = await recommend(guest);
    const recipe = recommendation.body.recipes[0];
    const payload = { recommendationId: recommendation.body.recommendationId, recipeId: recipe.id, idempotencyKey: "select-1", estimatedSavings: 99999999 };
    const first = await request("/api/menu-selections", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify(payload) });
    assert.equal(first.response.status, 201);
    assert.equal(first.body.recipeSnapshot.estimatedSavings, recipe.estimatedSavings);
    for (const field of ["requiredIngredients", "optionalIngredients", "ownedIngredients", "inputIngredients", "missingIngredients", "steps", "doneness", "sourceRefs", "cookTimeMinutes"]) {
      assert.deepEqual(first.body.recipeSnapshot[field], recipe[field], `saved snapshot lost ${field}`);
    }
    const repeated = await request("/api/menu-selections", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify(payload) });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.body.selectionId, first.body.selectionId);
    assert.deepEqual(repeated.body.recipeSnapshot, first.body.recipeSnapshot, "replay must read the same stored recipe");
    const conflict = await request("/api/menu-selections", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ ...payload, idempotencyKey: "select-2" }) });
    assert.equal(conflict.response.status, 409);
  });

  test("registration merges the current guest and returns a durable summary", async () => {
    const guest = await bootstrapGuest();
    await request("/api/pantry", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ stableId: "pantry-kimchi", name: "김치", quantity: "1통" }) });
    await request("/api/shortcuts", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ shortcutId: "quick-kimchi", shortcutSnapshot: { label: "김치 추천" } }) });
    const recommendation = await recommend(guest);
    const recipe = recommendation.body.recipes[0];
    await request("/api/menu-selections", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ recommendationId: recommendation.body.recommendationId, recipeId: recipe.id, idempotencyKey: "before-register" }) });
    const registered = await request("/api/auth/register", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ email: "guest@example.com", displayName: "게스트", password: "StrongPass!234", guestMergeIdempotencyKey: "merge-register-1" }) });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.authenticated, true);
    assert.equal(registered.body.merge.status, "completed");
    assert.equal(Array.isArray(registered.body.merge.steps), true);
    assert.equal(registered.body.merge.steps.find((step) => ["pantry_items", "pantryItems"].includes(step.category || step.entity)).addedCount, 1);
    assert.equal(registered.body.merge.steps.find((step) => ["shortcuts", "userShortcuts"].includes(step.category || step.entity)).addedCount, 1);
    const sessionToken = /(?:^|,\s*)fi_session=([^;,]+)/.exec(registered.response.headers.get("set-cookie") || "")?.[1];
    assert.ok(sessionToken);
    const replay = await request("/api/menu-selections", { method: "POST", headers: { cookie: `fi_session=${sessionToken}`, "x-csrf-token": registered.body.csrfToken }, body: JSON.stringify({ recommendationId: recommendation.body.recommendationId, recipeId: recipe.id, idempotencyKey: "before-register" }) });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.selection.outcome, "replayed");
  });

  test("guest pantry and shortcuts enforce CSRF, ownership, and CRUD", async () => {
    const guest = await bootstrapGuest();
    const other = await bootstrapGuest();
    const created = await request("/api/pantry", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ stableId: "egg", name: "계란", quantity: "1팩" }) });
    assert.equal(created.response.status, 201);
    assert.equal((await request("/api/pantry", { headers: { cookie: guest.cookie } })).body.items.length, 1);
    assert.equal((await request(`/api/pantry/${created.body.item.id}`, { method: "PATCH", headers: { cookie: other.cookie, "x-csrf-token": other.csrfToken }, body: JSON.stringify({ quantity: "9팩" }) })).response.status, 404);
    assert.equal((await request(`/api/pantry/${created.body.item.id}`, { method: "PATCH", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ quantity: "2팩" }) })).body.item.quantity, "2팩");
    const shortcut = await request("/api/shortcuts", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ shortcutId: "quick-egg", shortcutSnapshot: { label: "계란" } }) });
    assert.equal(shortcut.response.status, 201);
    assert.equal((await request("/api/shortcuts", { headers: { cookie: guest.cookie } })).body.shortcuts.length, 1);
    assert.equal((await request("/api/shortcuts/quick-egg", { method: "DELETE", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: "{}" })).response.status, 200);
    assert.equal((await request(`/api/pantry/${created.body.item.id}`, { method: "DELETE", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: "{}" })).response.status, 200);
  });

  test("missing guest merge key has no registration side effects", async () => {
    const guest = await bootstrapGuest();
    const email = "prevalidate@example.com";
    const malformed = await request("/api/auth/register", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ email, displayName: "사전 검증", password: "StrongPass!234" }) });
    assert.equal(malformed.response.status, 400);
    const valid = await request("/api/auth/register", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ email, displayName: "사전 검증", password: "StrongPass!234", guestMergeIdempotencyKey: "prevalidated" }) });
    assert.equal(valid.response.status, 201);
  });

  test("protected account history still rejects anonymous callers", async () => {
    assert.equal((await request("/api/recommendations")).response.status, 401);
  });

  test("cross-guest recommendation references are rejected", async () => {
    const owner = await bootstrapGuest();
    const attacker = await bootstrapGuest();
    const recommendation = await recommend(owner);
    const forged = await request("/api/menu-selections", {
      method: "POST",
      headers: { cookie: attacker.cookie, "x-csrf-token": attacker.csrfToken },
      body: JSON.stringify({ recommendationId: recommendation.body.recommendationId, recipeId: recommendation.body.recipes[0].id, idempotencyKey: "cross-guest" })
    });
    assert.equal(forged.response.status, 404);
  });

  test("login never merges a guest until the authenticated merge endpoint is called", async () => {
    const initialGuest = await bootstrapGuest();
    const email = "explicit-merge@example.com";
    const registered = await request("/api/auth/register", {
      method: "POST",
      headers: { cookie: initialGuest.cookie, "x-csrf-token": initialGuest.csrfToken },
      body: JSON.stringify({ email, displayName: "명시 병합", password: "StrongPass!234", guestMergeIdempotencyKey: "initial-register-merge" })
    });
    assert.equal(registered.response.status, 201);
    const firstSession = /(?:^|,\s*)fi_session=([^;,]+)/.exec(registered.response.headers.get("set-cookie") || "")?.[1];
    assert.ok(firstSession);
    await request("/api/auth/logout", { method: "POST", headers: { cookie: `fi_session=${firstSession}`, "x-csrf-token": registered.body.csrfToken }, body: "{}" });

    const guest = await bootstrapGuest();
    const recommendation = await recommend(guest);
    await request("/api/menu-selections", { method: "POST", headers: { cookie: guest.cookie, "x-csrf-token": guest.csrfToken }, body: JSON.stringify({ recommendationId: recommendation.body.recommendationId, recipeId: recommendation.body.recipes[0].id, idempotencyKey: "pending-explicit-merge" }) });
    const loggedIn = await request("/api/auth/login", { method: "POST", headers: { cookie: guest.cookie }, body: JSON.stringify({ email, password: "StrongPass!234" }) });
    assert.equal(loggedIn.response.status, 200);
    assert.equal(Object.hasOwn(loggedIn.body, "merge"), false);
    const sessionToken = /(?:^|,\s*)fi_session=([^;,]+)/.exec(loggedIn.response.headers.get("set-cookie") || "")?.[1];
    assert.ok(sessionToken);
    const combinedCookies = `${guest.cookie}; fi_session=${sessionToken}`;
    const before = await request("/api/recommendations", { headers: { cookie: combinedCookies } });
    assert.equal(before.body.selections.length, 0);
    const merged = await request("/api/guest/merge", { method: "POST", headers: { cookie: combinedCookies, "x-csrf-token": loggedIn.body.csrfToken }, body: JSON.stringify({ idempotencyKey: "explicit-login-merge" }) });
    assert.equal(merged.response.status, 200);
    assert.equal(merged.body.merge.status, "completed");
    const after = await request("/api/recommendations", { headers: { cookie: `fi_session=${sessionToken}` } });
    assert.equal(after.body.selections.length, 1);
  });

  test("legacy pages redirect permanently and unknown pages return hub guidance", async () => {
    const redirects = new Map([
      ["/index.html", "/"],
      ["/shopping.html", "/tools.html#shopping"],
      ["/notes.html", "/tools.html#notes"],
      ["/places.html", "/tools.html#places"],
      ["/tips.html", "/tools.html#tips"],
      ["/chatbot.html", "/tools.html#chatbot"],
      ["/login.html", "/me.html#login"],
      ["/register.html", "/me.html#register"]
    ]);

    for (const [source, destination] of redirects) {
      const response = await fetch(`${origin}${source}?from=legacy`, { redirect: "manual" });
      assert.equal(response.status, 308, source);
      const expected = destination.includes("#")
        ? destination.replace("#", "?from=legacy#")
        : `${destination}?from=legacy`;
      assert.equal(response.headers.get("location"), expected, source);
    }

    for (const [source, destination] of redirects) {
      const head = await fetch(`${origin}${source}?from=head`, { method: "HEAD", redirect: "manual" });
      assert.equal(head.status, 308, `HEAD ${source}`);
      const expected = destination.includes("#")
        ? destination.replace("#", "?from=head#")
        : `${destination}?from=head`;
      assert.equal(head.headers.get("location"), expected, `HEAD ${source}`);
    }

    const apiMissing = await fetch(`${origin}/api/does-not-exist`);
    assert.equal(apiMissing.status, 404);
    assert.match(apiMissing.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(await apiMissing.json(), { error: "Not found" });

    const missing = await fetch(`${origin}/does-not-exist`);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type") || "", /text\/html/);
    const body = await missing.text();
    assert.match(body, /냉장고 털기/);
    assert.match(body, /생활도구/);
    assert.match(body, /내 정보/);
  });
  test("admin suspension and IP blocking revoke user access", async () => {
    const userIp = "198.51.100.41";
    const adminIp = "198.51.100.42";
    const guestBoot = await request("/api/guest/session", { method: "POST", headers: { "x-forwarded-for": userIp }, body: "{}" });
    const guestCookie = (guestBoot.response.headers.get("set-cookie") || "").split(";")[0];
    const email = "security-controls@example.com";
    const registered = await request("/api/auth/register", { method: "POST", headers: { cookie: guestCookie, "x-csrf-token": guestBoot.body.csrfToken, "x-forwarded-for": userIp }, body: JSON.stringify({ email, displayName: "보안 검증", password: "StrongPass!234", guestMergeIdempotencyKey: "security-register" }) });
    assert.equal(registered.response.status, 201);

    const admin = await request("/api/auth/login", { method: "POST", headers: { "x-forwarded-for": adminIp }, body: JSON.stringify({ email: "admin@example.com", password: "AdminStrong!234" }) });
    assert.equal(admin.response.status, 200);
    const adminToken = /(?:^|,\s*)fi_session=([^;,]+)/.exec(admin.response.headers.get("set-cookie") || "")?.[1];
    assert.ok(adminToken);
    const adminHeaders = { cookie: `fi_session=${adminToken}`, "x-csrf-token": admin.body.csrfToken, "x-forwarded-for": adminIp };
    const overview = await request("/api/admin/overview", { headers: adminHeaders });
    const user = overview.body.users.find((row) => row.email === email);
    assert.ok(user);

    const blocked = await request(`/api/admin/users/${user.id}/block-ip`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ reason: "contract test" }) });
    assert.equal(blocked.response.status, 200);
    assert.equal(blocked.body.blockedCount, 1);
    assert.equal((await request("/api/auth/session", { headers: { "x-forwarded-for": userIp } })).response.status, 403);
    const blockId = blocked.body.blocks[0].id;
    assert.equal((await request(`/api/admin/ip-blocks/${blockId}`, { method: "DELETE", headers: adminHeaders, body: "{}" })).response.status, 200);

    const relogin = await request("/api/auth/login", { method: "POST", headers: { "x-forwarded-for": userIp }, body: JSON.stringify({ email, password: "StrongPass!234" }) });
    const userToken = /(?:^|,\s*)fi_session=([^;,]+)/.exec(relogin.response.headers.get("set-cookie") || "")?.[1];
    assert.ok(userToken);
    const suspended = await request(`/api/admin/users/${user.id}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ status: "suspended" }) });
    assert.equal(suspended.response.status, 200);
    const sessionAfterSuspend = await request("/api/auth/session", { headers: { cookie: `fi_session=${userToken}`, "x-forwarded-for": userIp } });
    assert.deepEqual(sessionAfterSuspend.body, { authenticated: false });
  });

  test("guest bootstrap is bounded by the API rate limit", async () => {
    const headers = { "x-forwarded-for": "203.0.113.77", "content-type": "application/json" };
    for (let index = 0; index < 120; index += 1) {
      const result = await request("/api/guest/session", { method: "POST", headers, body: "{}" });
      assert.equal(result.response.status, 200, `request ${index + 1}`);
    }
    const limited = await request("/api/guest/session", { method: "POST", headers, body: "{}" });
    assert.equal(limited.response.status, 429);
  });

  test("static assets preserve content types and cache policy", async () => {
    const manifest = await fetch(`${origin}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get("content-type") || "", /^application\/manifest\+json(?:;|$)/);
    assert.equal(manifest.headers.get("cache-control"), "public, max-age=300");
    assert.equal(manifest.headers.get("x-content-type-options"), "nosniff");

    const html = await fetch(`${origin}/`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type") || "", /^text\/html(?:;|$)/);
    assert.equal(html.headers.get("cache-control"), "no-cache");

    const traversal = await fetch(`${origin}/../server.js`);
    assert.equal(traversal.status, 404);
    assert.equal(traversal.headers.get("cache-control"), "no-store");
  });
});
