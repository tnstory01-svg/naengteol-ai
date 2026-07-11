const DATASETS = [
  {
    key: "users",
    table: "app_users",
    fromRow: fromUserRow,
    toRow: toUserRow
  },
  {
    key: "sessions",
    table: "app_user_sessions",
    fromRow: fromSessionRow,
    toRow: toSessionRow
  },
  {
    key: "ipBlocks",
    table: "ip_blocks",
    fromRow: fromIpBlockRow,
    toRow: toIpBlockRow
  },
  {
    key: "pantryItems",
    table: "pantry_items",
    fromRow: fromPantryItemRow,
    toRow: toPantryItemRow
  },
  {
    key: "recommendationLogs",
    table: "recommendation_logs",
    fromRow: fromRecommendationLogRow,
    toRow: toRecommendationLogRow
  },
  {
    key: "savingsLogs",
    table: "savings_logs",
    fromRow: fromSavingsLogRow,
    toRow: toSavingsLogRow
  }
];

const DELETE_ORDER = [...DATASETS].reverse();
const USER_COLUMNS = "id,email,display_name,password_hash,role,status,permissions,created_at,updated_at";
const SESSION_COLUMNS = "id,user_id,token_hash,csrf_token,user_agent,ip_hash,created_at,last_seen_at,expires_at";
const IP_BLOCK_COLUMNS = "id,ip_hash,reason,user_id,created_by_user_id,created_at";
const PANTRY_COLUMNS = "id,user_id,guest_session_id,stable_id,anonymous_id,name,quantity,expires_at,created_at,updated_at";
const RECOMMENDATION_LOG_COLUMNS = "id,user_id,anonymous_id,input_ingredients,preferences,ai_response,created_at";
const GUEST_SESSION_COLUMNS = "id,token_hash,csrf_token,created_at,last_seen_at,expires_at,revoked_at";
const RECOMMENDATION_EXPOSURE_COLUMNS = "id,user_id,anonymous_id,input_ingredients,preferences,ai_response,created_at";
const MENU_SELECTION_COLUMNS = "id,user_id,guest_session_id,recommendation_id,recipe_id,idempotency_key,recipe_snapshot,estimated_savings,selected_at";
const SHORTCUT_COLUMNS = "id,user_id,guest_session_id,shortcut_id,shortcut_snapshot,created_at,updated_at";
const MERGE_TRANSACTION_COLUMNS = "id,guest_session_id,user_id,idempotency_key,status,created_at,completed_at,error";
const MERGE_STEP_COLUMNS = "id,merge_transaction_id,category,status,attempts,added_count,account_kept_count,skipped_count,failed_count,error_code,started_at,completed_at,error";
const EMPTY_DATA = {
  users: [],
  sessions: [],
  ipBlocks: [],
  pantryItems: [],
  recommendationLogs: [],
  savingsLogs: []
};

export class SupabaseDatabase {
  constructor({ url, serviceRoleKey, schema = "public", maxRows = 5000 }) {
    this.url = trimTrailingSlash(url);
    this.serviceRoleKey = serviceRoleKey;
    this.schema = schema || "public";
    this.maxRows = maxRows;
    this.data = null;
    this.initialized = false;
    this.initPromise = null;
    this.writeQueue = Promise.resolve();
    this.provider = "supabase";
  }

  async init() {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.#load();
    }

    await this.initPromise;
  }

  async get(selector) {
    await this.writeQueue;
    const current = await this.#loadFresh();
    this.data = current;
    this.initialized = true;
    return clone(await selector(current));
  }

  async mutate(mutator) {
    const run = this.writeQueue.then(async () => {
      const before = await this.#loadFresh();
      const next = clone(before);
      const result = await mutator(next);
      const normalizedNext = normalizeData(next);
      await this.#sync(before, normalizedNext);
      this.data = normalizedNext;
      this.initialized = true;
      return clone(result);
    });

    this.writeQueue = run.catch(() => {});
    return run;
  }

  async findUserByEmail(email) {
    const rows = await this.#request(
      "GET",
      `app_users?select=${USER_COLUMNS}&email=eq.${encodeFilterValue(email)}&limit=1`
    );
    return rows[0] ? fromUserRow(rows[0]) : null;
  }

  async findUserById(userId) {
    const rows = await this.#request(
      "GET",
      `app_users?select=${USER_COLUMNS}&id=eq.${encodeFilterValue(userId)}&limit=1`
    );
    return rows[0] ? fromUserRow(rows[0]) : null;
  }

  async insertUser(record) {
    const rows = await this.#request("POST", `app_users?select=${USER_COLUMNS}`, toUserRow(record), {
      Prefer: "return=representation"
    });
    return rows[0] ? fromUserRow(rows[0]) : record;
  }

  async ensureAdminUser(record) {
    const existing = await this.findUserByEmail(record.email);
    if (existing) {
      return this.updateUserAccount(existing.id, {
        displayName: record.displayName,
        passwordHash: record.passwordHash,
        role: "admin",
        status: "active",
        permissions: record.permissions,
        updatedAt: record.updatedAt
      });
    }

    return this.insertUser(record);
  }

  async findActiveSessionAuth(tokenHash, nowIso) {
    const sessions = await this.#request(
      "GET",
      `app_user_sessions?select=${SESSION_COLUMNS}&token_hash=eq.${encodeFilterValue(tokenHash)}&expires_at=gt.${encodeFilterValue(nowIso)}&limit=1`
    );
    const session = sessions[0] ? fromSessionRow(sessions[0]) : null;
    if (!session) {
      return null;
    }

    const users = await this.#request(
      "GET",
      `app_users?select=${USER_COLUMNS}&id=eq.${encodeFilterValue(session.userId)}&status=eq.active&limit=1`
    );
    const user = users[0] ? fromUserRow(users[0]) : null;
    return user ? { session, user } : null;
  }

  async createSession(record, nowIso) {
    await this.#request(
      "DELETE",
      `app_user_sessions?expires_at=lte.${encodeFilterValue(nowIso)}`,
      null,
      { Prefer: "return=minimal" }
    );
    await this.#request("POST", "app_user_sessions", toSessionRow(record), {
      Prefer: "return=minimal"
    });
  }

  async deleteSessionByTokenHash(tokenHash) {
    await this.#request(
      "DELETE",
      `app_user_sessions?token_hash=eq.${encodeFilterValue(tokenHash)}`,
      null,
      { Prefer: "return=minimal" }
    );
  }

  async deleteSessionsByUserId(userId) {
    await this.#request(
      "DELETE",
      `app_user_sessions?user_id=eq.${encodeFilterValue(userId)}`,
      null,
      { Prefer: "return=minimal" }
    );
  }

  async listSessionsByUserId(userId) {
    const rows = await this.#request(
      "GET",
      `app_user_sessions?select=${SESSION_COLUMNS}&user_id=eq.${encodeFilterValue(userId)}&order=last_seen_at.desc.nullslast,created_at.desc`
    );
    return rows.map(fromSessionRow);
  }

  async findIpBlockByHash(ipHash) {
    const rows = await this.#request(
      "GET",
      `ip_blocks?select=${IP_BLOCK_COLUMNS}&ip_hash=eq.${encodeFilterValue(ipHash)}&limit=1`
    );
    return rows[0] ? fromIpBlockRow(rows[0]) : null;
  }

  async findIpBlocksByHashes(ipHashes) {
    const filter = encodeInFilter(ipHashes);
    if (!filter) {
      return [];
    }

    const rows = await this.#request(
      "GET",
      `ip_blocks?select=${IP_BLOCK_COLUMNS}&ip_hash=in.(${filter})`
    );
    return rows.map(fromIpBlockRow);
  }

  async insertIpBlocks(records) {
    if (!records.length) {
      return [];
    }

    const rows = await this.#request(
      "POST",
      `ip_blocks?select=${IP_BLOCK_COLUMNS}`,
      records.map(toIpBlockRow),
      { Prefer: "return=representation" }
    );
    return rows.map(fromIpBlockRow);
  }

  async deleteIpBlockById(blockId) {
    const rows = await this.#request(
      "DELETE",
      `ip_blocks?id=eq.${encodeFilterValue(blockId)}&select=${IP_BLOCK_COLUMNS}`,
      null,
      { Prefer: "return=representation" }
    );
    return rows[0] ? fromIpBlockRow(rows[0]) : null;
  }

  async listPantryItemsByUserId(userId) {
    const rows = await this.#request(
      "GET",
      `pantry_items?select=${PANTRY_COLUMNS}&user_id=eq.${encodeFilterValue(userId)}&order=expires_at.asc.nullslast,created_at.desc`
    );
    return rows.map(fromPantryItemRow);
  }

  async insertPantryItem(record) {
    const rows = await this.#request("POST", `pantry_items?select=${PANTRY_COLUMNS}`, toPantryItemRow(record), {
      Prefer: "return=representation"
    });
    return rows[0] ? fromPantryItemRow(rows[0]) : record;
  }

  async listPantryItems({ userId, guestSessionId }) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("GET", `pantry_items?select=${PANTRY_COLUMNS}&${ownerFilters({ userId, guestSessionId }).join("&")}&order=expires_at.asc.nullslast,created_at.desc`);
    return rows.map(fromPantryItemRow);
  }

  async updateOwnedPantryItem({ userId, guestSessionId }, itemId, patch) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("PATCH", `pantry_items?id=eq.${encodeFilterValue(itemId)}&${ownerFilters({ userId, guestSessionId }).join("&")}&select=${PANTRY_COLUMNS}`, toPantryItemRow(patch), { Prefer: "return=representation" });
    return rows[0] ? fromPantryItemRow(rows[0]) : null;
  }

  async deleteOwnedPantryItem({ userId, guestSessionId }, itemId) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("DELETE", `pantry_items?id=eq.${encodeFilterValue(itemId)}&${ownerFilters({ userId, guestSessionId }).join("&")}&select=id`, null, { Prefer: "return=representation" });
    return rows.length > 0;
  }

  async updatePantryItem(userId, itemId, patch) {
    const rows = await this.#request(
      "PATCH",
      `pantry_items?id=eq.${encodeFilterValue(itemId)}&user_id=eq.${encodeFilterValue(userId)}&select=${PANTRY_COLUMNS}`,
      toPantryItemRow(patch),
      { Prefer: "return=representation" }
    );
    return rows[0] ? fromPantryItemRow(rows[0]) : null;
  }

  async deletePantryItem(userId, itemId) {
    const rows = await this.#request(
      "DELETE",
      `pantry_items?id=eq.${encodeFilterValue(itemId)}&user_id=eq.${encodeFilterValue(userId)}&select=id`,
      null,
      { Prefer: "return=representation" }
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async updateUserAccount(userId, patch) {
    const rows = await this.#request(
      "PATCH",
      `app_users?id=eq.${encodeFilterValue(userId)}&select=${USER_COLUMNS}`,
      toUserRow(patch),
      { Prefer: "return=representation" }
    );
    return rows[0] ? fromUserRow(rows[0]) : null;
  }

  async countUsers({ role = null, status = null } = {}) {
    const filters = [];
    if (role) {
      filters.push(`role=eq.${encodeFilterValue(role)}`);
    }
    if (status) {
      filters.push(`status=eq.${encodeFilterValue(status)}`);
    }
    return this.#count("app_users", filters);
  }

  async getAdminOverviewSnapshot({ userPage, userPageSize, ipBlockPage, ipBlockPageSize, nowIso }) {
    const userFrom = (userPage - 1) * userPageSize;
    const userTo = userFrom + userPageSize - 1;
    const ipBlockFrom = (ipBlockPage - 1) * ipBlockPageSize;
    const ipBlockTo = ipBlockFrom + ipBlockPageSize - 1;

    const [
      usersResult,
      activeUsers,
      suspendedUsers,
      adminUsers,
      activeSessions,
      ipBlocksResult
    ] = await Promise.all([
      this.#requestWithMeta(
        "GET",
        `app_users?select=${USER_COLUMNS}&order=created_at.desc`,
        null,
        {
          Prefer: "count=exact",
          Range: `${userFrom}-${userTo}`
        }
      ),
      this.#count("app_users", ["status=eq.active"]),
      this.#count("app_users", ["status=eq.suspended"]),
      this.#count("app_users", ["role=eq.admin"]),
      this.#count("app_user_sessions", [`expires_at=gt.${encodeFilterValue(nowIso)}`]),
      this.#requestWithMeta(
        "GET",
        `ip_blocks?select=${IP_BLOCK_COLUMNS}&order=created_at.desc`,
        null,
        {
          Prefer: "count=exact",
          Range: `${ipBlockFrom}-${ipBlockTo}`
        }
      )
    ]);

    const users = (usersResult.body || []).map(fromUserRow);
    const ipBlocks = (ipBlocksResult.body || []).map(fromIpBlockRow);
    const userIds = users.map((user) => user.id);
    const userIdFilter = encodeInFilter(userIds);
    const [
      sessions,
      pantryItems,
      recommendationLogs,
      menuSelections
    ] = userIdFilter
      ? await Promise.all([
          this.#request(
            "GET",
            `app_user_sessions?select=${SESSION_COLUMNS}&user_id=in.(${userIdFilter})&order=last_seen_at.desc.nullslast,created_at.desc`
          ),
          this.#request("GET", `pantry_items?select=id,user_id&user_id=in.(${userIdFilter})`),
          this.#request("GET", `recommendation_logs?select=id,user_id&user_id=in.(${userIdFilter})`),
          this.#request("GET", `menu_selections?select=user_id,estimated_savings&user_id=in.(${userIdFilter})`)
        ])
      : [[], [], [], []];

    const sessionIpFilter = encodeInFilter(
      sessions.map((session) => session.ip_hash).filter(Boolean)
    );
    const sessionIpBlocks = sessionIpFilter
      ? await this.#request(
          "GET",
          `ip_blocks?select=${IP_BLOCK_COLUMNS}&ip_hash=in.(${sessionIpFilter})`
        )
      : [];
    const mergedIpBlocks = mergeRowsById([...ipBlocks.map(toIpBlockRow), ...sessionIpBlocks]).map(fromIpBlockRow);
    const ipBlockUserIds = uniqueValues([
      ...mergedIpBlocks.map((block) => block.userId).filter(Boolean),
      ...mergedIpBlocks.map((block) => block.createdByUserId).filter(Boolean)
    ]);
    const ipBlockUsers = await this.#listUsersByIds(ipBlockUserIds);

    return {
      data: {
        users,
        sessions: sessions.map(fromSessionRow),
        ipBlocks: mergedIpBlocks,
        ipBlockUsers,
        pantryItems: pantryItems.map((row) => ({ id: row.id, userId: row.user_id })),
        recommendationLogs: recommendationLogs.map((row) => ({ id: row.id, userId: row.user_id })),
        menuSelections: menuSelections.map((row) => ({
          userId: row.user_id,
          estimatedSavings: row.estimated_savings
        }))
      },
      stats: {
        totalUsers: parseContentRangeTotal(usersResult.headers.get("content-range")),
        activeUsers,
        suspendedUsers,
        adminUsers,
        activeSessions,
        blockedIps: parseContentRangeTotal(ipBlocksResult.headers.get("content-range"))
      },
      pagination: {
        users: pageMeta(userPage, userPageSize, parseContentRangeTotal(usersResult.headers.get("content-range"))),
        ipBlocks: pageMeta(
          ipBlockPage,
          ipBlockPageSize,
          parseContentRangeTotal(ipBlocksResult.headers.get("content-range"))
        )
      }
    };
  }

  async getRecommendationHistory(userId, limit) {
    const rows = await this.#request("GET", `menu_selections?select=${MENU_SELECTION_COLUMNS}&user_id=eq.${encodeFilterValue(userId)}&order=selected_at.desc&limit=${encodeFilterValue(limit)}`);
    const selections = rows.map(fromMenuSelectionRow);
    return { logs: selections, selections, totalSavings: selections.reduce((sum, row) => sum + Number(row.realizedSavings || 0), 0), legacySavingsExcluded: true };
  }

  async findGuestSessionByTokenHash(tokenHash, nowIso = new Date().toISOString()) {
    const rows = await this.#request("GET", `guest_sessions?select=${GUEST_SESSION_COLUMNS}&token_hash=eq.${encodeFilterValue(tokenHash)}&revoked_at=is.null&expires_at=gt.${encodeFilterValue(nowIso)}&limit=1`);
    return rows[0] ? fromGuestSessionRow(rows[0]) : null;
  }

  async createGuestSession(record) {
    const rows = await this.#request("POST", `guest_sessions?select=${GUEST_SESSION_COLUMNS}`, { id: record.id, token_hash: record.tokenHash, csrf_token: record.csrfToken, created_at: record.createdAt, last_seen_at: record.lastSeenAt, expires_at: record.expiresAt, revoked_at: record.revokedAt || null }, { Prefer: "return=representation" });
    return rows[0] ? fromGuestSessionRow(rows[0]) : null;
  }

  async cleanupExpiredGuestSessions(limit = 500) {
    const result = await this.#request("POST", "rpc/cleanup_expired_guest_sessions", { p_limit: limit });
    return Number(Array.isArray(result) ? result[0] : result || 0);
  }

  async listMenuSelections({ userId, guestSessionId, limit = 10 }) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("GET", `menu_selections?select=${MENU_SELECTION_COLUMNS}&${ownerFilters({ userId, guestSessionId }).join("&")}&order=selected_at.desc&limit=${encodeFilterValue(limit)}`);
    return rows.map(fromMenuSelectionRow);
  }

  async resolveGuestSession({ tokenHash, csrfToken }) {
    if (!tokenHash || !csrfToken) throw new Error("tokenHash and csrfToken are required.");
    const rows = await this.#request("POST", "rpc/resolve_guest_session", {
      p_token_hash: tokenHash,
      p_csrf_token: csrfToken
    });
    return rows[0] ? { id: rows[0].guest_session_id, csrfToken: rows[0].csrf_token, expiresAt: rows[0].expires_at } : null;
  }

  async recordRecommendationExposure({ userId, guestSessionId, recommendationId, inputIngredients, preferences, snapshot, source, createdAt }) {
    assertOwner({ userId, guestSessionId });
    if (userId) {
      const rows = await this.#request("POST", `recommendation_logs?select=${RECOMMENDATION_LOG_COLUMNS}`, {
        id: recommendationId, user_id: userId, anonymous_id: `user-${userId}`,
        input_ingredients: inputIngredients || [], preferences: preferences || {},
        ai_response: { ...(snapshot || {}), source }, created_at: createdAt
      }, { Prefer: "return=representation" });
      return fromRecommendationLogRow(rows[0]);
    }
    const result = await this.#request("POST", "rpc/record_recommendation_exposure", {
      p_guest_session_id: guestSessionId,
      p_recommendation_id: recommendationId,
      p_input_ingredients: inputIngredients || [],
      p_preferences: preferences || {},
      p_ai_response: { ...(snapshot || {}), source }
    });
    return { id: Array.isArray(result) ? result[0] : result, recommendationId, guestSessionId, snapshot, source, createdAt };
  }

  async getRecommendationExposure({ recommendationId, userId, guestSessionId }) {
    assertOwner({ userId, guestSessionId });
    if (!recommendationId) throw new Error("recommendationId is required.");
    const ownerFilter = userId
      ? `user_id=eq.${encodeFilterValue(userId)}`
      : `anonymous_id=eq.${encodeFilterValue(`guest:${guestSessionId}`)}`;
    const rows = await this.#request("GET", `recommendation_logs?select=${RECOMMENDATION_EXPOSURE_COLUMNS}&id=eq.${encodeFilterValue(recommendationId)}&${ownerFilter}&limit=1`);
    return rows[0] ? fromRecommendationLogRow(rows[0]) : null;
  }

  async findMenuSelection({ userId, guestSessionId, idempotencyKey, recommendationId }) {
    assertOwner({ userId, guestSessionId });
    const identity = idempotencyKey ? `idempotency_key=eq.${encodeFilterValue(idempotencyKey)}` : `recommendation_id=eq.${encodeFilterValue(recommendationId)}`;
    const rows = await this.#request("GET", `menu_selections?select=${MENU_SELECTION_COLUMNS}&${ownerFilters({ userId, guestSessionId }).join("&")}&${identity}&limit=1`);
    return rows[0] ? fromMenuSelectionRow(rows[0]) : null;
  }

  async recordMenuSelection({ userId, guestSessionId, recommendationId, recipeId, idempotencyKey }) {
    assertOwner({ userId, guestSessionId });
    if (!recommendationId || !recipeId || !idempotencyKey) {
      throw new Error("recommendationId, recipeId, and idempotencyKey are required.");
    }
    const result = await this.#request("POST", "rpc/record_menu_selection", {
      p_owner_user_id: userId || null,
      p_guest_session_id: guestSessionId || null,
      p_recommendation_id: recommendationId,
      p_recipe_id: recipeId,
      p_idempotency_key: idempotencyKey
    });
    const payload = Array.isArray(result) ? result[0] : result;
    const row = payload?.selection || payload;
    return row ? { ...fromMenuSelectionRow(row), outcome: payload?.outcome || "created" } : null;
  }

  async getRealizedSavingsTotal({ userId, guestSessionId }) {
    assertOwner({ userId, guestSessionId });
    if (userId) {
      const result = await this.#request("POST", "rpc/get_realized_savings_total", { p_user_id: userId });
      return Number(Array.isArray(result) ? result[0] : result || 0);
    }
    const rows = await this.#request("GET", `menu_selections?select=estimated_savings&guest_session_id=eq.${encodeFilterValue(guestSessionId)}`);
    return rows.reduce((sum, row) => sum + Number(row.estimated_savings || 0), 0);
  }

  async listShortcuts({ userId, guestSessionId }) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("GET", `user_shortcuts?select=${SHORTCUT_COLUMNS}&${ownerFilters({ userId, guestSessionId }).join("&")}&order=created_at.asc`);
    return rows.map(fromShortcutRow);
  }

  async getShortcutsByOwner(owner) { return this.listShortcuts(owner); }

  async recordShortcut({ userId, guestSessionId, shortcutId, shortcutSnapshot, createdAt, updatedAt }) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("POST", "user_shortcuts", toShortcutRow({ userId, guestSessionId, shortcutId, shortcutSnapshot, createdAt, updatedAt }), { Prefer: "return=representation" });
    return rows[0] ? fromShortcutRow(rows[0]) : null;
  }

  async deleteShortcut({ userId, guestSessionId, shortcutId }) {
    assertOwner({ userId, guestSessionId });
    const rows = await this.#request("DELETE", `user_shortcuts?shortcut_id=eq.${encodeFilterValue(shortcutId)}&${ownerFilters({ userId, guestSessionId }).join("&")}&select=id`, null, { Prefer: "return=representation" });
    return rows.length > 0;
  }

  async mergeGuestIntoAccount({ guestSessionId, userId, idempotencyKey }) {
    if (!guestSessionId || !userId || !idempotencyKey) throw new Error("guestSessionId, userId, and idempotencyKey are required.");
    const result = await this.#request("POST", "rpc/merge_guest_into_account", {
      p_guest_session_id: guestSessionId, p_user_id: userId, p_idempotency_key: idempotencyKey
    });
    const transactionId = Array.isArray(result) ? result[0] : result;
    return this.getMergeTransaction({ id: transactionId });
  }

  async getMergeTransaction({ id, guestSessionId, userId, idempotencyKey }) {
    const filters = [];
    if (id) filters.push(`id=eq.${encodeFilterValue(id)}`);
    if (guestSessionId) filters.push(`guest_session_id=eq.${encodeFilterValue(guestSessionId)}`);
    if (userId) filters.push(`user_id=eq.${encodeFilterValue(userId)}`);
    if (idempotencyKey) filters.push(`idempotency_key=eq.${encodeFilterValue(idempotencyKey)}`);
    if (!filters.length) throw new Error("A merge transaction identifier is required.");
    const rows = await this.#request("GET", `merge_transactions?select=${MERGE_TRANSACTION_COLUMNS},merge_transaction_steps(${MERGE_STEP_COLUMNS})&${filters.join("&")}&limit=1`);
    return rows[0] ? fromMergeTransactionRow(rows[0]) : null;
  }

  async #load() {
    this.data = clone(EMPTY_DATA);
    this.initialized = true;
  }

  async #trimUserRows(table, userId, maxItems) {
    const rows = await this.#request(
      "GET",
      `${table}?select=id&user_id=eq.${encodeFilterValue(userId)}&order=created_at.desc&offset=${encodeFilterValue(maxItems)}`
    );
    const ids = rows.map((row) => row.id).filter(Boolean);
    if (ids.length) {
      await this.#deleteByIds(table, ids);
    }
  }

  async #loadFresh() {
    const entries = await Promise.all(
      DATASETS.map(async (dataset) => {
        const rows = await this.#request("GET", `${dataset.table}?select=*&limit=${this.maxRows}`);
        return [dataset.key, rows.map(dataset.fromRow)];
      })
    );

    return normalizeData(Object.fromEntries(entries));
  }

  async #sync(before, next) {
    for (const dataset of DELETE_ORDER) {
      const removedIds = diffRemovedIds(before[dataset.key], next[dataset.key]);
      if (removedIds.length) {
        await this.#deleteByIds(dataset.table, removedIds);
      }
    }

    for (const dataset of DATASETS) {
      const changedRows = diffChangedRows(before[dataset.key], next[dataset.key], dataset.toRow);
      if (changedRows.length) {
        await this.#upsertRows(dataset.table, changedRows);
      }
    }
  }

  async #upsertRows(table, rows) {
    await this.#request("POST", `${table}?on_conflict=id`, rows, {
      Prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  async #deleteByIds(table, ids) {
    const filter = ids.map((id) => encodeURIComponent(id)).join(",");
    await this.#request("DELETE", `${table}?id=in.(${filter})`, null, {
      Prefer: "return=minimal"
    });
  }

  async #count(table, filters = []) {
    const query = filters.length ? `&${filters.join("&")}` : "";
    const result = await this.#requestWithMeta("GET", `${table}?select=id${query}&limit=1`, null, {
      Prefer: "count=exact"
    });
    return parseContentRangeTotal(result.headers.get("content-range"));
  }

  async #listUsersByIds(ids) {
    const filter = encodeInFilter(ids);
    if (!filter) {
      return [];
    }

    const rows = await this.#request("GET", `app_users?select=${USER_COLUMNS}&id=in.(${filter})`);
    return rows.map(fromUserRow);
  }

  async #request(method, path, body = null, extraHeaders = {}) {
    return (await this.#requestWithMeta(method, path, body, extraHeaders)).body;
  }

  async #requestWithMeta(method, path, body = null, extraHeaders = {}) {
    if (!this.url || !this.serviceRoleKey) {
      throw new Error("Supabase URL and service role key are required.");
    }

    const headers = {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      Accept: "application/json",
      ...profileHeaders(this.schema),
      ...extraHeaders
    };

    if (body !== null) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body)
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(text || `Supabase ${method} ${path} failed with ${response.status}`);
    }

    if (!text) {
      return { body: null, headers: response.headers };
    }

    return { body: JSON.parse(text), headers: response.headers };
  }
}

function diffRemovedIds(beforeRows = [], nextRows = []) {
  const nextIds = new Set(nextRows.map((row) => row.id).filter(Boolean));
  return beforeRows.map((row) => row.id).filter((id) => id && !nextIds.has(id));
}

function diffChangedRows(beforeRows = [], nextRows = [], toRow) {
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  const changed = [];

  for (const nextRow of nextRows) {
    if (!nextRow.id) {
      continue;
    }

    const serializedNext = stableStringify(toRow(nextRow));
    const beforeRow = beforeById.get(nextRow.id);
    if (!beforeRow || stableStringify(toRow(beforeRow)) !== serializedNext) {
      changed.push(toRow(nextRow));
    }
  }

  return changed;
}

function fromUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    permissions: asObject(row.permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toUserRow(record) {
  return omitUndefined({
    id: record.id,
    email: record.email,
    display_name: record.displayName,
    password_hash: record.passwordHash,
    role: record.role || "user",
    status: record.status || "active",
    permissions: asObject(record.permissions),
    created_at: record.createdAt,
    updated_at: record.updatedAt
  });
}

function fromSessionRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    csrfToken: row.csrf_token,
    userAgent: row.user_agent || "",
    ipHash: row.ip_hash || "",
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at
  };
}

function toSessionRow(record) {
  return omitUndefined({
    id: record.id,
    user_id: record.userId,
    token_hash: record.tokenHash,
    csrf_token: record.csrfToken,
    user_agent: record.userAgent || null,
    ip_hash: record.ipHash || null,
    created_at: record.createdAt,
    last_seen_at: record.lastSeenAt,
    expires_at: record.expiresAt
  });
}

function fromIpBlockRow(row) {
  return {
    id: row.id,
    ipHash: row.ip_hash,
    reason: row.reason || "",
    userId: row.user_id || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at
  };
}

function toIpBlockRow(record) {
  return omitUndefined({
    id: record.id,
    ip_hash: record.ipHash,
    reason: record.reason || null,
    user_id: record.userId || null,
    created_by_user_id: record.createdByUserId || null,
    created_at: record.createdAt
  });
}

function fromPantryItemRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    guestSessionId: row.guest_session_id || null,
    stableId: row.stable_id || row.id,
    anonymousId: row.anonymous_id || null,
    name: row.name,
    quantity: row.quantity || "",
    expiresAt: row.expires_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPantryItemRow(record) {
  return omitUndefined({
    id: record.id,
    user_id: record.userId || null,
    guest_session_id: record.guestSessionId || null,
    stable_id: record.stableId || record.id,
    anonymous_id: record.anonymousId || null,
    name: record.name,
    quantity: record.quantity || null,
    expires_at: record.expiresAt || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  });
}

function fromRecommendationLogRow(row) {
  const aiResponse = asObject(row.ai_response);
  const source = typeof aiResponse.source === "string" ? aiResponse.source : "unknown";
  const recommendation = { ...aiResponse };
  delete recommendation.source;

  return {
    id: row.id,
    userId: row.user_id || null,
    anonymousId: row.anonymous_id,
    inputIngredients: asArray(row.input_ingredients),
    preferences: asObject(row.preferences),
    recommendation,
    source,
    createdAt: row.created_at
  };
}

function toRecommendationLogRow(record) {
  const recommendation = asObject(record.recommendation);
  const source = record.source || recommendation.source || "unknown";

  return omitUndefined({
    id: record.id,
    user_id: record.userId || null,
    anonymous_id: record.anonymousId || fallbackAnonymousId(record.userId),
    input_ingredients: asArray(record.inputIngredients),
    preferences: asObject(record.preferences),
    ai_response: {
      ...recommendation,
      source
    },
    created_at: record.createdAt
  });
}

function fromSavingsLogRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    anonymousId: row.anonymous_id,
    recipeName: row.recipe_name,
    estimatedSavings: Number(row.estimated_savings || 0),
    createdAt: row.created_at
  };
}

function toSavingsLogRow(record) {
  return omitUndefined({
    id: record.id,
    user_id: record.userId || null,
    anonymous_id: record.anonymousId || fallbackAnonymousId(record.userId),
    recipe_name: record.recipeName,
    estimated_savings: Number(record.estimatedSavings || 0),
    created_at: record.createdAt
  });
}

function toRecommendationHistoryItem(log) {
  return {
    id: log.id,
    createdAt: log.createdAt,
    source: log.source,
    inputIngredients: log.inputIngredients,
    summary: log.recommendation?.summary || "",
    bestSavings: log.recommendation?.totals?.bestSavings || 0,
    recipeNames: (log.recommendation?.recipes || []).map((recipe) => recipe.name).slice(0, 3)
  };
}

function fromGuestSessionRow(row) {
  return { id: row.id, tokenHash: row.token_hash, csrfToken: row.csrf_token, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at || null };
}

function assertOwner({ userId, guestSessionId }) {
  if (Boolean(userId) === Boolean(guestSessionId)) throw new Error("exactly one owner is required.");
}

function ownerFilters({ userId, guestSessionId }) {
  return userId ? [`user_id=eq.${encodeFilterValue(userId)}`] : [`guest_session_id=eq.${encodeFilterValue(guestSessionId)}`];
}

function fromMenuSelectionRow(row) {
  return { id: row.id, userId: row.user_id || null, guestSessionId: row.guest_session_id || null, recommendationId: row.recommendation_id, recipeId: row.recipe_id, idempotencyKey: row.idempotency_key, recipeSnapshot: asObject(row.recipe_snapshot), realizedSavings: Number(row.estimated_savings || 0), createdAt: row.selected_at };
}

function fromShortcutRow(row) {
  return { id: row.id, userId: row.user_id || null, guestSessionId: row.guest_session_id || null, shortcutId: row.shortcut_id, shortcutSnapshot: asObject(row.shortcut_snapshot), createdAt: row.created_at, updatedAt: row.updated_at };
}

function toShortcutRow(value) {
  return omitUndefined({ id: value.id, user_id: value.userId || null, guest_session_id: value.guestSessionId || null, shortcut_id: value.shortcutId, shortcut_snapshot: value.shortcutSnapshot || {}, created_at: value.createdAt, updated_at: value.updatedAt });
}

function fromMergeTransactionRow(row) {
  return { id: row.id, guestSessionId: row.guest_session_id, userId: row.user_id, idempotencyKey: row.idempotency_key, status: row.status, error: row.error || null, createdAt: row.created_at, completedAt: row.completed_at || null, steps: asArray(row.merge_transaction_steps).map((step) => ({ id: step.id, category: step.category, status: step.status, attempts: Number(step.attempts || 0), addedCount: Number(step.added_count || 0), accountKeptCount: Number(step.account_kept_count || 0), skippedCount: Number(step.skipped_count || 0), failedCount: Number(step.failed_count || 0), errorCode: step.error_code || null })) };
}

function normalizeData(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    ipBlocks: Array.isArray(data.ipBlocks) ? data.ipBlocks : [],
    pantryItems: Array.isArray(data.pantryItems) ? data.pantryItems : [],
    recommendationLogs: Array.isArray(data.recommendationLogs) ? data.recommendationLogs : [],
    savingsLogs: Array.isArray(data.savingsLogs) ? data.savingsLogs : []
  };
}

function fallbackAnonymousId(userId) {
  return userId ? `user-${userId}` : "anonymous";
}

function profileHeaders(schema) {
  if (!schema || schema === "public") {
    return {};
  }

  return {
    "Accept-Profile": schema,
    "Content-Profile": schema
  };
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value));
}

function encodeInFilter(values) {
  return uniqueValues(values).map((value) => encodeFilterValue(value)).join(",");
}

function uniqueValues(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

function mergeRowsById(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (row?.id) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function parseContentRangeTotal(value) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function pageMeta(page, pageSize, total) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
