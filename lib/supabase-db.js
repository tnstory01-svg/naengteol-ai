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

  async #load() {
    this.data = await this.#loadFresh();
    this.initialized = true;
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

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
