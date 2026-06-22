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
const PANTRY_COLUMNS = "id,user_id,anonymous_id,name,quantity,expires_at,created_at,updated_at";
const RECOMMENDATION_LOG_COLUMNS = "id,user_id,anonymous_id,input_ingredients,preferences,ai_response,created_at";
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

  async findIpBlockByHash(ipHash) {
    const rows = await this.#request(
      "GET",
      `ip_blocks?select=${IP_BLOCK_COLUMNS}&ip_hash=eq.${encodeFilterValue(ipHash)}&limit=1`
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

  async getRecommendationHistory(userId, limit) {
    const logs = await this.#request(
      "GET",
      `recommendation_logs?select=${RECOMMENDATION_LOG_COLUMNS}&user_id=eq.${encodeFilterValue(userId)}&order=created_at.desc&limit=${encodeFilterValue(limit)}`
    );
    const savingsLogs = await this.#request(
      "GET",
      `savings_logs?select=estimated_savings&user_id=eq.${encodeFilterValue(userId)}`
    );

    return {
      logs: logs.map(fromRecommendationLogRow).map(toRecommendationHistoryItem),
      totalSavings: savingsLogs.reduce((sum, row) => sum + Number(row.estimated_savings || 0), 0)
    };
  }

  async insertRecommendationEntries({ recommendationLog, savingsLog, trimUserId }) {
    await this.#request("POST", "recommendation_logs", toRecommendationLogRow(recommendationLog), {
      Prefer: "return=minimal"
    });

    if (savingsLog) {
      await this.#request("POST", "savings_logs", toSavingsLogRow(savingsLog), {
        Prefer: "return=minimal"
      });
    }

    if (trimUserId) {
      await Promise.all([
        this.#trimUserRows("recommendation_logs", trimUserId, 200),
        this.#trimUserRows("savings_logs", trimUserId, 500)
      ]);
    }
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

  async #request(method, path, body = null, extraHeaders = {}) {
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
      return null;
    }

    return JSON.parse(text);
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

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
