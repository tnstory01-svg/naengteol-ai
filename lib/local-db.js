import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const EMPTY_DATA = {
  schemaVersion: 2,
  users: [], sessions: [], ipBlocks: [], pantryItems: [], recommendationLogs: [], savingsLogs: [],
  guestSessions: [], userShortcuts: [], menuSelections: [], mergeTransactions: [], mergeTransactionSteps: []
};

export class LocalDatabase {
  constructor(filePath) {
    this.filePath = filePath; this.data = null; this.initialized = false; this.initPromise = null;
    this.writeQueue = Promise.resolve(); this.provider = "local";
  }
  async init() {
    if (this.initialized) return;
    if (!this.initPromise) this.initPromise = this.#load().catch((error) => { this.initPromise = null; throw error; });
    await this.initPromise;
  }
  async get(selector) { await this.writeQueue; await this.init(); return clone(await selector(this.data)); }
  async mutate(mutator) {
    const run = this.writeQueue.then(async () => { await this.init(); const result = await mutator(this.data); await this.#write(); return clone(result); });
    this.writeQueue = run.catch(() => {}); return run;
  }

  async listPantryItems(owner) {
    assertOwner(owner);
    return this.get((data) => data.pantryItems.filter((row) => matchesOwner(row, owner)).sort(comparePantryItems));
  }

  async insertPantryItem(record) {
    assertOwner(record);
    return this.mutate((data) => {
      data.pantryItems.push(record);
      return record;
    });
  }

  async updateOwnedPantryItem(owner, itemId, patch) {
    assertOwner(owner);
    return this.mutate((data) => {
      const item = data.pantryItems.find((row) => row.id === itemId && matchesOwner(row, owner));
      if (!item) return null;
      Object.assign(item, patch);
      return item;
    });
  }

  async deleteOwnedPantryItem(owner, itemId) {
    assertOwner(owner);
    return this.mutate((data) => {
      const before = data.pantryItems.length;
      data.pantryItems = data.pantryItems.filter((row) => !(row.id === itemId && matchesOwner(row, owner)));
      return before !== data.pantryItems.length;
    });
  }

  async listShortcuts(owner) {
    assertOwner(owner);
    return this.get((data) => data.userShortcuts.filter((row) => matchesOwner(row, owner)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
  }

  async recordShortcut({ userId, guestSessionId, shortcutId, shortcutSnapshot, createdAt, updatedAt }) {
    assertOwner({ userId, guestSessionId });
    return this.mutate((data) => {
      const row = { id: randomUUID(), ownerId: userId || guestSessionId, userId, guestSessionId, shortcutId, shortcutSnapshot, createdAt, updatedAt };
      data.userShortcuts.push(row);
      return row;
    });
  }

  async deleteShortcut({ userId, guestSessionId, shortcutId }) {
    assertOwner({ userId, guestSessionId });
    return this.mutate((data) => {
      const before = data.userShortcuts.length;
      data.userShortcuts = data.userShortcuts.filter((row) => !(
        row.shortcutId === shortcutId && matchesOwner(row, { userId, guestSessionId })
      ));
      return before !== data.userShortcuts.length;
    });
  }

  async findGuestSessionByTokenHash(tokenHash, nowIso = new Date().toISOString()) {
    return this.get((data) => data.guestSessions.find((row) => row.tokenHash === tokenHash && !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt).getTime() > new Date(nowIso).getTime())) || null);
  }

  async cleanupExpiredGuestSessions(nowIso = new Date().toISOString()) {
    const now = new Date(nowIso).getTime();
    return this.mutate((data) => {
      const expired = new Set(data.guestSessions.filter((row) => row.revokedAt || (row.expiresAt && new Date(row.expiresAt).getTime() <= now)).map((row) => row.id));
      if (!expired.size) return 0;
      data.guestSessions = data.guestSessions.filter((row) => !expired.has(row.id));
      for (const key of ["pantryItems", "userShortcuts", "menuSelections", "recommendationLogs"]) data[key] = data[key].filter((row) => !expired.has(row.guestSessionId) && !expired.has(row.ownerId));
      return expired.size;
    });
  }

  async createGuestSession(record) {
    return this.mutate((data) => {
      const existing = data.guestSessions.find((row) => row.tokenHash === record.tokenHash);
      if (existing) return existing;
      data.guestSessions.push(clone(record));
      return record;
    });
  }

  async listMenuSelections({ userId, guestSessionId, limit = 10 }) {
    return this.get((data) => data.menuSelections.filter((row) => (userId ? row.userId === userId : row.guestSessionId === guestSessionId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit));
  }

  async resolveGuestSession(input = {}) {
    const tokenHash = input.tokenHash || input.guestTokenHash;
    const csrfToken = input.csrfToken || input.guestCsrf;
    if (!tokenHash || !csrfToken) throw new Error("guest token hash and CSRF token are required");
    return this.mutate((data) => {
      const existing = data.guestSessions.find((row) => row.tokenHash === tokenHash);
      if (existing) return existing;
      const session = { id: input.id || randomUUID(), tokenHash, csrfToken, createdAt: input.createdAt || new Date().toISOString(), lastSeenAt: input.lastSeenAt || new Date().toISOString(), expiresAt: input.expiresAt || null };
      data.guestSessions.push(session); return session;
    });
  }

  async recordRecommendationExposure(input = {}) {
    const ownerId = ownerOf(input); const recommendationId = input.recommendationId || input.id;
    if (!ownerId || !recommendationId) throw new Error("owner and recommendationId are required");
    return this.mutate((data) => {
      const key = input.idempotencyKey || input.requestId;
      const existing = key && data.recommendationLogs.find((row) => row.ownerId === ownerId && row.idempotencyKey === key && row.type === "exposure");
      if (existing) return existing;
      const row = { id: input.exposureId || randomUUID(), type: "exposure", ownerId, userId: input.userId || null, guestSessionId: input.guestSessionId || null, recommendationId, idempotencyKey: key || null, snapshot: clone(input.snapshot || input.recommendation || null), createdAt: input.createdAt || new Date().toISOString() };
      data.recommendationLogs.push(row);
      if (input.guestSessionId) {
        const selected = new Set(data.menuSelections.filter((item) => ownerOf(item) === ownerId).map((item) => item.recommendationId));
        const removable = data.recommendationLogs.filter((item) => ownerOf(item) === ownerId && !selected.has(item.recommendationId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(200);
        const removeIds = new Set(removable.map((item) => item.id));
        data.recommendationLogs = data.recommendationLogs.filter((item) => !removeIds.has(item.id));
      }
      return row;
    });
  }

  async recordMenuSelection(input = {}) {
    const ownerId = ownerOf(input); const recommendationId = input.recommendationId;
    if (!ownerId || !recommendationId) throw new Error("owner and recommendationId are required");
    return this.mutate((data) => {
      const key = input.idempotencyKey || input.requestId;
      const same = key && data.menuSelections.find((row) => row.ownerId === ownerId && row.idempotencyKey === key);
      if (same) return { ...same, outcome: "replayed" };
      const duplicate = data.menuSelections.find((row) => row.ownerId === ownerId && row.recommendationId === recommendationId);
      if (duplicate) { const error = new Error("recommendation already selected"); error.code = "DUPLICATE_SELECTION"; throw error; }
      const row = { id: input.selectionId || randomUUID(), ownerId, userId: input.userId || null, guestSessionId: input.guestSessionId || null, recommendationId, idempotencyKey: key || null, snapshot: clone(input.snapshot || input.recommendation || null), realizedSavings: Number(input.realizedSavings ?? input.estimatedSavings ?? 0), createdAt: input.createdAt || new Date().toISOString() };
      data.menuSelections.push(row); return { ...row, outcome: "created" };
    });
  }

  async getRealizedSavingsTotal(input = {}) {
    const ownerId = typeof input === "string" ? input : ownerOf(input);
    return this.get((data) => data.menuSelections.filter((row) => !ownerId || row.ownerId === ownerId).reduce((sum, row) => sum + Number(row.realizedSavings || 0), 0));
  }

  async mergeGuestIntoAccount(input = {}) {
    const guestId = input.guestSessionId || input.guestId;
    const accountId = input.userId || input.accountId;
    const idempotencyKey = input.idempotencyKey;
    if (!guestId || !accountId || !idempotencyKey) throw new Error("guestSessionId, accountId, and idempotencyKey are required");
    return this.mutate((data) => {
      let tx = data.mergeTransactions.find((row) => row.guestSessionId === guestId && row.accountId === accountId && row.idempotencyKey === idempotencyKey);
      if (tx?.status === "completed") return mergeSummary(data, tx);
      const now = new Date().toISOString();
      if (!tx) {
        tx = { id: input.transactionId || randomUUID(), guestSessionId: guestId, accountId, idempotencyKey, status: "running", createdAt: now, updatedAt: now, completedAt: null };
        data.mergeTransactions.push(tx);
      }
      for (const entity of ["pantryItems", "userShortcuts", "menuSelections"]) {
        let step = data.mergeTransactionSteps.find((row) => row.transactionId === tx.id && row.entity === entity);
        if (step?.status === "completed") continue;
        if (!step) {
          step = { id: randomUUID(), transactionId: tx.id, entity, status: "pending", attempts: 0, addedCount: 0, accountKeptCount: 0, skippedCount: 0, failedCount: 0, errorCode: null };
          data.mergeTransactionSteps.push(step);
        }
        Object.assign(step, { status: "running", attempts: step.attempts + 1, addedCount: 0, accountKeptCount: 0, skippedCount: 0, failedCount: 0, errorCode: null });
        try {
          if (input.failStep === entity) { const error = new Error(`injected ${entity} failure`); error.code = "RETRYABLE_STEP_FAILURE"; throw error; }
          const rows = data[entity].filter((row) => ownerOf(row) === guestId);
          for (const row of rows) {
            const stableId = stableItemId(row);
            if (!stableId) { step.skippedCount += 1; continue; }
            const conflict = data[entity].find((candidate) => ownerOf(candidate) === accountId && (entity === "menuSelections" ? candidate.recommendationId === row.recommendationId || candidate.idempotencyKey === row.idempotencyKey : stableItemId(candidate) === stableId));
            if (conflict) { data[entity] = data[entity].filter((candidate) => candidate !== row); step.accountKeptCount += 1; }
            else { row.ownerId = accountId; row.userId = accountId; row.guestSessionId = null; step.addedCount += 1; }
          }
          step.status = "completed";
          step.completedAt = new Date().toISOString();
        } catch (error) {
          step.status = "failed";
          step.failedCount = 1;
          step.errorCode = error.code || "MERGE_STEP_FAILED";
          step.error = String(error.message || error);
        }
      }
      const failed = data.mergeTransactionSteps.some((step) => step.transactionId === tx.id && step.status === "failed");
      tx.status = failed ? "partial" : "completed";
      tx.updatedAt = new Date().toISOString();
      tx.completedAt = failed ? null : tx.updatedAt;
      if (!failed) { const guest = data.guestSessions.find((row) => row.id === guestId); if (guest) guest.revokedAt = tx.completedAt; }
      return mergeSummary(data, tx);
    });
  }

  async getMergeTransaction(transactionId) { return this.get((data) => { const tx = data.mergeTransactions.find((row) => row.id === transactionId); return tx ? mergeSummary(data, tx) : null; }); }

  async #load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) { this.data = freshData(); await this.#write(); this.initialized = true; return; }
    this.data = normalizeData(JSON.parse(await readFile(this.filePath, "utf8"))); this.initialized = true;
  }
  async #write() { await mkdir(path.dirname(this.filePath), { recursive: true }); const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`; await writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await rename(tempPath, this.filePath); }
}

function freshData() { return clone(EMPTY_DATA); }
function normalizeData(value) {
  const data = value && typeof value === "object" ? value : {};
  const result = { schemaVersion: 2, users: arr(data.users), sessions: arr(data.sessions), ipBlocks: arr(data.ipBlocks), pantryItems: arr(data.pantryItems), recommendationLogs: arr(data.recommendationLogs), savingsLogs: arr(data.savingsLogs), guestSessions: arr(data.guestSessions), userShortcuts: arr(data.userShortcuts), menuSelections: arr(data.menuSelections), mergeTransactions: arr(data.mergeTransactions), mergeTransactionSteps: arr(data.mergeTransactionSteps) };
  result.savingsLogs = result.savingsLogs.map((row) => ({ ...row, source: row.source || "legacy_exposure", estimatedSavings: Number(row.estimatedSavings ?? row.amount ?? row.savings ?? 0) }));
  return result;
}
function arr(value) { return Array.isArray(value) ? value : []; }
function mergeSummary(data, tx) { return { ...tx, steps: data.mergeTransactionSteps.filter((step) => step.transactionId === tx.id) }; }
function ownerOf(input) { return input.ownerId || input.userId || input.accountId || input.guestSessionId || input.guestId || null; }
function stableItemId(input) { return input.stableId || input.itemId || input.shortcutId || input.selectionId || input.id; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function matchesOwner(row, { userId, guestSessionId }) {
  return userId ? row.userId === userId : row.guestSessionId === guestSessionId;
}

function assertOwner({ userId, guestSessionId }) {
  if (Boolean(userId) === Boolean(guestSessionId)) throw new Error("exactly one owner is required.");
}

function comparePantryItems(a, b) {
  if (a.expiresAt && b.expiresAt && a.expiresAt !== b.expiresAt) return a.expiresAt.localeCompare(b.expiresAt);
  if (a.expiresAt && !b.expiresAt) return -1;
  if (!a.expiresAt && b.expiresAt) return 1;
  return String(b.createdAt).localeCompare(String(a.createdAt));
}
