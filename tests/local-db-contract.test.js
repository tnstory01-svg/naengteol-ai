import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalDatabase } from "../lib/local-db.js";

async function dbWith(value) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "local-db-"));
  const file = path.join(dir, "app.db.json");
  await writeFile(file, JSON.stringify(value));
  return { db: new LocalDatabase(file), dir };
}

test("migrates legacy data losslessly and adds v2 collections", async () => {
  const legacy = { users: [{ id: "u1" }], sessions: [], ipBlocks: [], pantryItems: [], recommendationLogs: [], savingsLogs: [{ userId: "u1", amount: "4" }] };
  const { db, dir } = await dbWith(legacy);
  try {
    await db.init();
    const data = await db.get((value) => value);
    assert.equal(data.schemaVersion, 2);
    assert.deepEqual(data.users, legacy.users);
    assert.deepEqual(data.guestSessions, []);
    assert.equal(data.savingsLogs[0].estimatedSavings, 4);
    assert.equal(data.savingsLogs[0].source, "legacy_exposure");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("selection idempotency and duplicate recommendation rejection are deterministic", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "local-db-"));
  const db = new LocalDatabase(path.join(dir, "db.json"));
  try {
    const first = await db.recordMenuSelection({ ownerId: "g", recommendationId: "r", idempotencyKey: "k", realizedSavings: 7, snapshot: { title: "menu" } });
    assert.equal(first.outcome, "created");
    const replayed = await db.recordMenuSelection({ ownerId: "g", recommendationId: "r", idempotencyKey: "k" });
    assert.equal(replayed.id, first.id);
    assert.equal(replayed.outcome, "replayed");
    await assert.rejects(() => db.recordMenuSelection({ ownerId: "g", recommendationId: "r", idempotencyKey: "other" }), (error) => error.code === "DUPLICATE_SELECTION");
    assert.equal(await db.getRealizedSavingsTotal("g"), 7);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("merge is account-first stable-id union and retry preserves completed steps", async () => {
  const { db, dir } = await dbWith({ schemaVersion: 2, users: [], sessions: [], ipBlocks: [], pantryItems: [], recommendationLogs: [], savingsLogs: [], pantryItems: [{ id: "pantry-account", stableId: "egg", userId: "u", quantity: "account" }, { id: "pantry-guest", stableId: "egg", guestSessionId: "g", quantity: "guest" }, { id: "pantry-new", stableId: "kimchi", guestSessionId: "g" }], userShortcuts: [{ id: "same", ownerId: "u", value: "account" }], menuSelections: [], guestSessions: [], mergeTransactions: [], mergeTransactionSteps: [] });
  try {
    await db.mutate((data) => data.userShortcuts.push({ id: "same", ownerId: "g", value: "guest" }, { id: "new", ownerId: "g", value: "new" }));
    const tx = await db.mergeGuestIntoAccount({ guestSessionId: "g", accountId: "u", idempotencyKey: "m" });
    assert.equal(tx.status, "completed");
    const rows = await db.get((data) => data.userShortcuts);
    const pantry = await db.get((data) => data.pantryItems);
    assert.equal(pantry.find((row) => row.stableId === "egg").quantity, "account");
    assert.equal(pantry.find((row) => row.stableId === "kimchi").userId, "u");
    assert.deepEqual(rows.find((row) => row.id === "same"), { id: "same", ownerId: "u", value: "account" });
    assert.equal(rows.find((row) => row.id === "new").ownerId, "u");
    assert.deepEqual(await db.mergeGuestIntoAccount({ guestSessionId: "g", accountId: "u", idempotencyKey: "m" }), tx);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("partial merge retains guest and retries only failed steps", async () => {
  const { db, dir } = await dbWith({ schemaVersion: 2, users: [], sessions: [], ipBlocks: [], pantryItems: [{ id: "p1", stableId: "egg", guestSessionId: "g" }], recommendationLogs: [], savingsLogs: [], userShortcuts: [{ id: "s1", shortcutId: "quick", guestSessionId: "g" }], menuSelections: [], guestSessions: [{ id: "g" }], mergeTransactions: [], mergeTransactionSteps: [] });
  try {
    const partial = await db.mergeGuestIntoAccount({ guestSessionId: "g", accountId: "u", idempotencyKey: "retry-1", failStep: "userShortcuts" });
    assert.equal(partial.status, "partial");
    assert.equal(partial.steps.find((step) => step.entity === "pantryItems").status, "completed");
    assert.equal(partial.steps.find((step) => step.entity === "userShortcuts").status, "failed");
    assert.equal((await db.get((data) => data.guestSessions[0])).revokedAt, undefined);
    const completed = await db.mergeGuestIntoAccount({ guestSessionId: "g", accountId: "u", idempotencyKey: "retry-1" });
    assert.equal(completed.status, "completed");
    assert.equal(completed.steps.find((step) => step.entity === "pantryItems").attempts, 1);
    assert.equal(completed.steps.find((step) => step.entity === "userShortcuts").attempts, 2);
    assert.equal(Boolean((await db.get((data) => data.guestSessions[0])).revokedAt), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("expired and revoked guest credentials cannot resolve", async () => {
  const { db, dir } = await dbWith({ schemaVersion: 2, users: [], sessions: [], ipBlocks: [], pantryItems: [], recommendationLogs: [], savingsLogs: [], userShortcuts: [], menuSelections: [], guestSessions: [
    { id: "expired", tokenHash: "expired-hash", expiresAt: "2020-01-01T00:00:00.000Z", revokedAt: null },
    { id: "revoked", tokenHash: "revoked-hash", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: "2026-01-01T00:00:00.000Z" },
    { id: "active", tokenHash: "active-hash", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null }
  ], mergeTransactions: [], mergeTransactionSteps: [] });
  try {
    assert.equal(await db.findGuestSessionByTokenHash("expired-hash", "2026-01-01T00:00:00.000Z"), null);
    assert.equal(await db.findGuestSessionByTokenHash("revoked-hash", "2026-01-01T00:00:00.000Z"), null);
    assert.equal((await db.findGuestSessionByTokenHash("active-hash", "2026-01-01T00:00:00.000Z")).id, "active");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("guest cleanup cascades expired ownership and unselected exposures are capped", async () => {
  const { db, dir } = await dbWith({ schemaVersion: 2, users: [], sessions: [], ipBlocks: [], pantryItems: [{ id: "expired-item", guestSessionId: "expired" }], recommendationLogs: [], savingsLogs: [], userShortcuts: [], menuSelections: [], guestSessions: [{ id: "expired", tokenHash: "old", expiresAt: "2020-01-01T00:00:00.000Z" }, { id: "active", tokenHash: "new", expiresAt: "2099-01-01T00:00:00.000Z" }], mergeTransactions: [], mergeTransactionSteps: [] });
  try {
    assert.equal(await db.cleanupExpiredGuestSessions("2026-01-01T00:00:00.000Z"), 1);
    assert.equal((await db.get((data) => data.pantryItems)).length, 0);
    for (let index = 0; index < 201; index += 1) await db.recordRecommendationExposure({ guestSessionId: "active", recommendationId: `r-${index}`, snapshot: { recipes: [] }, createdAt: new Date(index * 1000).toISOString() });
    assert.equal((await db.get((data) => data.recommendationLogs)).length, 200);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("menu selection merge resolves recommendation and idempotency collisions account-first", async () => {
  const { db, dir } = await dbWith({ schemaVersion: 2, users: [], sessions: [], ipBlocks: [], pantryItems: [], recommendationLogs: [], savingsLogs: [], userShortcuts: [], menuSelections: [
    { id: "account-rec", ownerId: "u", userId: "u", recommendationId: "r1", idempotencyKey: "account-key" },
    { id: "guest-rec", ownerId: "g", guestSessionId: "g", recommendationId: "r1", idempotencyKey: "guest-key" },
    { id: "guest-key", ownerId: "g", guestSessionId: "g", recommendationId: "r2", idempotencyKey: "account-key" }
  ], guestSessions: [{ id: "g" }], mergeTransactions: [], mergeTransactionSteps: [] });
  try {
    const result = await db.mergeGuestIntoAccount({ guestSessionId: "g", accountId: "u", idempotencyKey: "merge-collisions" });
    assert.equal(result.status, "completed");
    const rows = await db.get((data) => data.menuSelections);
    assert.deepEqual(rows.map((row) => row.id), ["account-rec"]);
    assert.equal(result.steps.find((step) => step.entity === "menuSelections").accountKeptCount, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
