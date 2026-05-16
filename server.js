import http from "node:http";
import https from "node:https";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createCsrfToken,
  createSessionToken,
  hashClientAddress,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  validateEmail,
  validatePassword,
  verifyPassword
} from "./lib/auth.js";
import { LocalDatabase } from "./lib/local-db.js";
import { SupabaseDatabase } from "./lib/supabase-db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH || path.join(__dirname, "data", "app.db.json");
const SUPABASE_URL = trimTrailingSlash(process.env.SUPABASE_URL || "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_SCHEMA = process.env.SUPABASE_SCHEMA || "public";
const SUPABASE_DB_ENABLED = parseBooleanFlag(
  process.env.SUPABASE_DB_ENABLED,
  Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
);
const SESSION_COOKIE_NAME = "fi_session";
const SESSION_TTL_DAYS = clampInt(process.env.SESSION_TTL_DAYS, 1, 30, 7);
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_DELIVERY_COST = 12000;
const DEFAULT_HOME_COOKING_COST = 3500;
const USER_ROLES = new Set(["user", "admin"]);
const USER_STATUSES = new Set(["active", "suspended"]);

const db = SUPABASE_DB_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? new SupabaseDatabase({
      url: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      schema: SUPABASE_SCHEMA,
      maxRows: clampInt(process.env.SUPABASE_MAX_ROWS, 100, 50_000, 5000)
    })
  : new LocalDatabase(LOCAL_DB_PATH);
const rateLimitBuckets = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

const RECOMMENDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recipes", "priorityIngredients", "summary"],
  properties: {
    recipes: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "reason",
          "ownedIngredients",
          "missingIngredients",
          "cookTimeMinutes",
          "difficulty",
          "steps",
          "estimatedSavings"
        ],
        properties: {
          name: { type: "string" },
          reason: { type: "string" },
          ownedIngredients: {
            type: "array",
            items: { type: "string" }
          },
          missingIngredients: {
            type: "array",
            items: { type: "string" }
          },
          cookTimeMinutes: {
            type: "integer",
            minimum: 5,
            maximum: 60
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"]
          },
          steps: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: { type: "string" }
          },
          estimatedSavings: {
            type: "integer",
            minimum: 1000,
            maximum: 15000
          }
        }
      }
    },
    priorityIngredients: {
      type: "array",
      items: { type: "string" }
    },
    summary: { type: "string" }
  }
};

class HttpError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const appReady = initializeApp();

export async function handleRequest(request, response) {
  await appReady;

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      const ipBlock = await resolveIpBlock(request);
      if (ipBlock) {
        const auth = await resolveSession(request);
        if (!auth || !isAdminUser(auth.user)) {
          sendJson(response, 403, {
            error: "This IP address is blocked.",
            blockId: ipBlock.id
          });
          return;
        }
      }
    }

    if (url.pathname.startsWith("/api/auth/") && request.method !== "GET") {
      if (!enforceRateLimit(request, response, "auth", 10, 60_000)) {
        return;
      }
    }

    if (url.pathname.startsWith("/api/")) {
      if (!enforceRateLimit(request, response, "api", 120, 60_000)) {
        return;
      }
      assertSafeRequestOrigin(request);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      await db.init();
      const groqConfigured = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_MODEL);
      sendJson(response, 200, {
        ok: true,
        aiConfigured: groqConfigured,
        aiProvider: groqConfigured ? "groq" : "fallback",
        groqConfigured,
        openaiConfigured: false,
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
        supabaseDatabaseConfigured: db.provider === "supabase",
        localDbConfigured: db.provider === "local",
        databaseProvider: db.provider || "local",
        authConfigured: true
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      await handleRegister(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      await handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      await handleSession(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/support/chat") {
      await handleSupportChat(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
      await handleAdminOverview(request, response);
      return;
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && request.method === "PATCH") {
      await handleAdminUserUpdate(request, response, decodeURIComponent(adminUserMatch[1]));
      return;
    }

    const adminUserIpMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/block-ip$/);
    if (adminUserIpMatch && request.method === "POST") {
      await handleAdminUserIpBlock(request, response, decodeURIComponent(adminUserIpMatch[1]));
      return;
    }

    const adminIpBlockMatch = url.pathname.match(/^\/api\/admin\/ip-blocks\/([^/]+)$/);
    if (adminIpBlockMatch && request.method === "DELETE") {
      await handleAdminIpUnblock(request, response, decodeURIComponent(adminIpBlockMatch[1]));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/pantry") {
      await handlePantryList(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/pantry") {
      await handlePantryCreate(request, response);
      return;
    }

    const pantryItemMatch = url.pathname.match(/^\/api\/pantry\/([^/]+)$/);
    if (pantryItemMatch && request.method === "PATCH") {
      await handlePantryUpdate(request, response, decodeURIComponent(pantryItemMatch[1]));
      return;
    }

    if (pantryItemMatch && request.method === "DELETE") {
      await handlePantryDelete(request, response, decodeURIComponent(pantryItemMatch[1]));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/recommendations") {
      await handleRecommendationHistory(request, response, url);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recommend") {
      await handleRecommend(request, response);
      return;
    }

    if (request.method === "GET") {
      serveStatic(url.pathname, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    handleError(response, error);
  }
}

const server = http.createServer(handleRequest);

if (isMainModule()) {
  await appReady;
  server.listen(PORT, HOST, () => {
    const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log(`자취생의 모든것 running at http://${displayHost}:${PORT}`);
  });
}

async function initializeApp() {
  await db.init();
  await ensureAdminAccount();
}

function isMainModule() {
  return Boolean(process.argv[1] && path.resolve(process.argv[1]) === __filename);
}

async function handleRegister(request, response) {
  const payload = asObject(await readJson(request, 16_000));
  const email = normalizeEmail(payload.email);
  const displayName = normalizeDisplayName(payload.displayName, email);
  const password = String(payload.password || "");

  if (!validateEmail(email)) {
    throw new HttpError(400, "올바른 이메일 주소를 입력해 주세요.");
  }

  const passwordFailures = validatePassword(password);
  if (passwordFailures.length) {
    throw new HttpError(400, "비밀번호 보안 기준을 확인해 주세요.", passwordFailures);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const user = await db.mutate((data) => {
    if (data.users.some((item) => item.email === email)) {
      throw new HttpError(409, "이미 가입된 이메일입니다.");
    }

    const record = {
      id: randomUUID(),
      email,
      displayName,
      passwordHash,
      role: "user",
      status: "active",
      permissions: {},
      createdAt: now,
      updatedAt: now
    };
    data.users.push(record);
    return publicUser(record);
  });

  const session = await createUserSession(user, request);
  sendJson(
    response,
    201,
    {
      authenticated: true,
      user,
      csrfToken: session.csrfToken
    },
    { "Set-Cookie": session.cookie }
  );
}

async function handleLogin(request, response) {
  const payload = asObject(await readJson(request, 16_000));
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!validateEmail(email) || !password) {
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  const userRecord = await db.get((data) => data.users.find((item) => item.email === email));
  const validPassword = userRecord ? await verifyPassword(password, userRecord.passwordHash) : false;

  if (!validPassword) {
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  if (normalizeUserStatus(userRecord.status) !== "active") {
    throw new HttpError(403, "This account is suspended.");
  }

  const user = publicUser(userRecord);
  const session = await createUserSession(user, request);
  sendJson(
    response,
    200,
    {
      authenticated: true,
      user,
      csrfToken: session.csrfToken
    },
    { "Set-Cookie": session.cookie }
  );
}

async function handleLogout(request, response) {
  const auth = await resolveSession(request);

  if (auth) {
    assertCsrf(request, auth.session);
    await db.mutate((data) => {
      data.sessions = data.sessions.filter((session) => session.tokenHash !== auth.session.tokenHash);
    });
  }

  sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(request) });
}

async function handleSession(request, response) {
  const auth = await resolveSession(request);

  if (!auth) {
    sendJson(response, 200, {
      authenticated: false
    });
    return;
  }

  sendJson(response, 200, {
    authenticated: true,
    user: publicUser(auth.user),
    csrfToken: auth.session.csrfToken
  });
}

async function handleSupportChat(request, response) {
  const payload = asObject(await readJson(request, 12_000));
  const message = normalizeShortText(payload.message, 500);

  if (!message) {
    throw new HttpError(400, "문의 내용을 입력해주세요.");
  }

  const result = await createSupportReply(message);
  sendJson(response, 200, result);
}

async function handleAdminOverview(request, response) {
  const auth = await requireAdmin(request);
  const overview = await db.get((data) => buildAdminOverview(data, auth.user.id));
  sendJson(response, 200, overview);
}

async function handleAdminUserUpdate(request, response, userId) {
  const auth = await requireAdmin(request, { requireCsrf: true });
  const payload = asObject(await readJson(request, 16_000));
  const hasRole = Object.hasOwn(payload, "role");
  const hasStatus = Object.hasOwn(payload, "status");

  if (!hasRole && !hasStatus) {
    throw new HttpError(400, "No account changes were provided.");
  }

  const requestedRole = hasRole ? parseUserRole(payload.role) : null;
  const requestedStatus = hasStatus ? parseUserStatus(payload.status) : null;
  const now = new Date().toISOString();

  const user = await db.mutate((data) => {
    const record = data.users.find((item) => item.id === userId);
    if (!record) {
      throw new HttpError(404, "User not found.");
    }

    const currentRole = normalizeUserRole(record.role);
    const currentStatus = normalizeUserStatus(record.status);
    const nextRole = requestedRole || currentRole;
    const nextStatus = requestedStatus || currentStatus;

    if (record.id === auth.user.id && (nextRole !== currentRole || nextStatus !== currentStatus)) {
      throw new HttpError(400, "You cannot change your own admin role or account status.");
    }

    if (currentRole === "admin" && nextRole !== "admin" && countAdminUsers(data) <= 1) {
      throw new HttpError(400, "At least one admin account must remain.");
    }

    if (
      currentRole === "admin" &&
      currentStatus === "active" &&
      nextStatus !== "active" &&
      countActiveAdminUsers(data) <= 1
    ) {
      throw new HttpError(400, "At least one active admin account must remain.");
    }

    record.role = nextRole;
    record.status = nextStatus;
    record.permissions = asObject(record.permissions);
    record.updatedAt = now;

    if (nextStatus !== "active") {
      data.sessions = data.sessions.filter((session) => session.userId !== record.id);
    }

    return buildAdminUser(record, data);
  });

  sendJson(response, 200, { user });
}

async function handleAdminUserIpBlock(request, response, userId) {
  const auth = await requireAdmin(request, { requireCsrf: true });
  const payload = asObject(await readJson(request, 16_000));
  const reason = normalizeShortText(payload.reason, 180) || "Suspicious activity";
  const currentAdminIpHash = hashClientAddress(getClientIp(request));
  const now = new Date().toISOString();

  const result = await db.mutate((data) => {
    const target = data.users.find((item) => item.id === userId);
    if (!target) {
      throw new HttpError(404, "User not found.");
    }

    if (isAdminUser(target)) {
      throw new HttpError(400, "Admin account IPs cannot be blocked from this action.");
    }

    const targetIpHashes = uniqueValues(
      data.sessions
        .filter((session) => session.userId === target.id)
        .map((session) => session.ipHash)
        .filter(Boolean)
    );
    const ipHashesToBlock = targetIpHashes.filter((ipHash) => ipHash !== currentAdminIpHash);

    if (ipHashesToBlock.length === 0) {
      throw new HttpError(400, "No blockable session IP was found for this user.");
    }

    data.ipBlocks = Array.isArray(data.ipBlocks) ? data.ipBlocks : [];
    const createdBlocks = [];
    for (const ipHash of ipHashesToBlock) {
      const existing = data.ipBlocks.find((block) => block.ipHash === ipHash);
      if (existing) {
        continue;
      }

      const block = {
        id: randomUUID(),
        ipHash,
        reason,
        userId: target.id,
        createdByUserId: auth.user.id,
        createdAt: now
      };
      data.ipBlocks.push(block);
      createdBlocks.push(block);
    }

    data.sessions = data.sessions.filter((session) => session.userId !== target.id);

    return {
      blockedCount: createdBlocks.length,
      alreadyBlockedCount: ipHashesToBlock.length - createdBlocks.length,
      skippedCurrentAdminIp: targetIpHashes.length !== ipHashesToBlock.length,
      blocks: createdBlocks.map((block) => buildPublicIpBlock(block, data))
    };
  });

  sendJson(response, 200, result);
}

async function handleAdminIpUnblock(request, response, blockId) {
  await requireAdmin(request, { requireCsrf: true });
  const block = await db.mutate((data) => {
    data.ipBlocks = Array.isArray(data.ipBlocks) ? data.ipBlocks : [];
    const index = data.ipBlocks.findIndex((item) => item.id === blockId);
    if (index === -1) {
      throw new HttpError(404, "IP block not found.");
    }

    const [removed] = data.ipBlocks.splice(index, 1);
    return buildPublicIpBlock(removed, data);
  });

  sendJson(response, 200, { ok: true, block });
}

async function handlePantryList(request, response) {
  const auth = await requireSession(request);
  const items = await db.get((data) =>
    data.pantryItems
      .filter((item) => item.userId === auth.user.id)
      .sort(comparePantryItems)
  );

  sendJson(response, 200, { items });
}

async function handlePantryCreate(request, response) {
  const auth = await requireSession(request, { requireCsrf: true });
  const payload = asObject(await readJson(request, 16_000));
  const itemInput = normalizePantryInput(payload, { partial: false });
  const now = new Date().toISOString();

  const item = await db.mutate((data) => {
    const record = {
      id: randomUUID(),
      userId: auth.user.id,
      name: itemInput.name,
      quantity: itemInput.quantity,
      expiresAt: itemInput.expiresAt,
      createdAt: now,
      updatedAt: now
    };
    data.pantryItems.push(record);
    return record;
  });

  sendJson(response, 201, { item });
}

async function handlePantryUpdate(request, response, itemId) {
  const auth = await requireSession(request, { requireCsrf: true });
  const payload = asObject(await readJson(request, 16_000));
  const itemInput = normalizePantryInput(payload, { partial: true });
  const now = new Date().toISOString();

  const item = await db.mutate((data) => {
    const record = data.pantryItems.find((entry) => entry.id === itemId && entry.userId === auth.user.id);
    if (!record) {
      throw new HttpError(404, "재료를 찾을 수 없습니다.");
    }

    for (const [key, value] of Object.entries(itemInput)) {
      record[key] = value;
    }
    record.updatedAt = now;
    return record;
  });

  sendJson(response, 200, { item });
}

async function handlePantryDelete(request, response, itemId) {
  const auth = await requireSession(request, { requireCsrf: true });
  const deleted = await db.mutate((data) => {
    const before = data.pantryItems.length;
    data.pantryItems = data.pantryItems.filter((entry) => !(entry.id === itemId && entry.userId === auth.user.id));
    return before !== data.pantryItems.length;
  });

  if (!deleted) {
    throw new HttpError(404, "재료를 찾을 수 없습니다.");
  }

  sendJson(response, 200, { ok: true });
}

async function handleRecommendationHistory(request, response, url) {
  const auth = await requireSession(request);
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);
  const result = await db.get((data) => {
    const logs = data.recommendationLogs
      .filter((log) => log.userId === auth.user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((log) => ({
        id: log.id,
        createdAt: log.createdAt,
        source: log.source,
        inputIngredients: log.inputIngredients,
        summary: log.recommendation?.summary || "",
        bestSavings: log.recommendation?.totals?.bestSavings || 0,
        recipeNames: (log.recommendation?.recipes || []).map((recipe) => recipe.name).slice(0, 3)
      }));

    const totalSavings = data.savingsLogs
      .filter((log) => log.userId === auth.user.id)
      .reduce((sum, log) => sum + Number(log.estimatedSavings || 0), 0);

    return {
      logs,
      totalSavings
    };
  });

  sendJson(response, 200, result);
}

async function handleRecommend(request, response) {
  const auth = await resolveSession(request);
  if (auth) {
    assertCsrf(request, auth.session);
  }

  const payload = asObject(await readJson(request));
  const anonymousId = auth ? `user-${auth.user.id}` : normalizeAnonymousId(payload.anonymousId);
  const ingredients = normalizeIngredients(payload.ingredients, payload.ingredientsText);
  const preferences = normalizePreferences(payload.preferences);
  const pantryItems = auth
    ? await db.get((data) =>
        data.pantryItems
          .filter((item) => item.userId === auth.user.id)
          .sort(comparePantryItems)
      )
    : [];
  const ingredientCheck = buildIngredientCheck({ inputIngredients: ingredients, pantryItems });
  const recommendationIngredients = ingredientCheck.recommendationIngredients;

  if (recommendationIngredients.length === 0) {
    throw new HttpError(400, "재료를 한 가지 이상 입력해 주세요.");
  }

  let source = "fallback";
  let recommendation = null;
  let warning = null;

  try {
    recommendation = await createAiRecommendation({
      ingredients: recommendationIngredients,
      preferences,
      anonymousId,
      ingredientCheck
    });
    if (recommendation) {
      source = "groq";
    }
  } catch (error) {
    warning = error.message;
    console.warn("Groq recommendation failed. Using fallback.", error.message);
  }

  if (!recommendation) {
    recommendation = createFallbackRecommendation(recommendationIngredients, preferences);
  }

  const normalized = {
    ...normalizeRecommendation(recommendation, recommendationIngredients),
    ingredientCheck
  };
  const localLogging = await logRecommendationLocally({
    auth,
    anonymousId,
    inputIngredients: recommendationIngredients,
    preferences,
    recommendation: normalized,
    source
  });
  const supabaseLogging = db.provider === "supabase"
    ? { enabled: true, stored: localLogging.stored, primary: true }
    : await logRecommendationToSupabase({
        userId: auth?.user.id || null,
        anonymousId,
        inputIngredients: recommendationIngredients,
        preferences,
        recommendation: normalized,
        source
      });

  sendJson(response, 200, {
    ...normalized,
    meta: {
      source,
      warning,
      ingredientCheck,
      logging: {
        stored: Boolean(supabaseLogging.stored || localLogging.stored),
        supabase: supabaseLogging,
        local: localLogging
      }
    }
  });
}

function buildIngredientCheck({ inputIngredients, pantryItems }) {
  const submittedIngredients = uniqueValues(inputIngredients || []).slice(0, 15);
  const databaseIngredients = (Array.isArray(pantryItems) ? pantryItems : [])
    .map((item) => ({
      name: normalizeShortText(item.name, 80),
      quantity: normalizeShortText(item.quantity, 40),
      expiresAt: item.expiresAt || ""
    }))
    .filter((item) => item.name)
    .slice(0, 50);
  const pantryByKey = new Map();

  for (const item of databaseIngredients) {
    const key = ingredientKey(item.name);
    if (key && !pantryByKey.has(key)) {
      pantryByKey.set(key, item);
    }
  }

  const submittedKeys = new Set();
  const verifiedMatches = [];
  const unverifiedInputIngredients = [];

  for (const ingredient of submittedIngredients) {
    const key = ingredientKey(ingredient);
    if (key) {
      submittedKeys.add(key);
    }

    const match = pantryByKey.get(key);
    if (match) {
      verifiedMatches.push({
        input: ingredient,
        name: match.name,
        quantity: match.quantity,
        expiresAt: match.expiresAt
      });
    } else {
      unverifiedInputIngredients.push(ingredient);
    }
  }

  const databaseOnlyIngredients = databaseIngredients.filter((item) => !submittedKeys.has(ingredientKey(item.name)));
  const verifiedIngredients = uniqueValues(verifiedMatches.map((item) => item.name));
  const recommendationIngredients = uniqueValues([
    ...verifiedIngredients,
    ...unverifiedInputIngredients,
    ...databaseOnlyIngredients.map((item) => item.name)
  ]).slice(0, 20);
  const summary = databaseIngredients.length
    ? `DB 확인 ${verifiedIngredients.length}개, 입력만 ${unverifiedInputIngredients.length}개, DB 추가 ${databaseOnlyIngredients.length}개`
    : `입력 재료 ${submittedIngredients.length}개 기준`;

  return {
    databaseChecked: databaseIngredients.length > 0,
    submittedIngredients,
    databaseIngredients: databaseIngredients.slice(0, 20),
    verifiedIngredients,
    verifiedMatches,
    unverifiedInputIngredients,
    databaseOnlyIngredients: databaseOnlyIngredients.slice(0, 20),
    recommendationIngredients,
    summary
  };
}

async function createAiRecommendation({ ingredients, preferences, anonymousId, ingredientCheck }) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  const baseUrl = trimTrailingSlash(process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1");

  if (!apiKey || !model) {
    return null;
  }

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You are 자취생의 모든것, a Korean living-alone home-cooking assistant.",
          "Return only a valid JSON object. Do not include reasoning, markdown, code fences, or <think> tags.",
          "Recommend realistic meals from owned ingredients.",
          "Keep missing ingredients optional and cheap.",
          "Estimate savings in KRW compared with delivery food.",
          "/no_think"
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          ingredients,
          submittedIngredients: ingredientCheck.submittedIngredients,
          databaseIngredients: ingredientCheck.databaseIngredients,
          verifiedIngredients: ingredientCheck.verifiedIngredients,
          unverifiedInputIngredients: ingredientCheck.unverifiedInputIngredients,
          databaseOnlyIngredients: ingredientCheck.databaseOnlyIngredients,
          preferences,
          requiredLanguage: "ko-KR",
          outputShape: {
            recipes: [
              {
                name: "string",
                reason: "string",
                ownedIngredients: ["string"],
                missingIngredients: ["string"],
                cookTimeMinutes: "number",
                difficulty: "easy | medium | hard",
                steps: ["string"],
                estimatedDeliveryCost: "number",
                estimatedHomeCookingCost: "number",
                estimatedSavings: "number"
              }
            ],
            priorityIngredients: ["string"],
            summary: "string"
          },
          rules: [
            "Return exactly 3 recipes.",
            "Use only JSON. No prose outside the JSON object.",
            "Use camelCase property names exactly as shown.",
            "Prioritize verifiedIngredients and databaseIngredients when possible.",
            "Treat unverifiedInputIngredients as usable but less reliable than database-verified ingredients.",
            "Reflect the delivery-vs-home-cooking cost difference in every recipe."
          ],
          savingsRule: {
            deliveryCostKrw: DEFAULT_DELIVERY_COST,
            defaultHomeCookingCostKrw: DEFAULT_HOME_COOKING_COST
          }
        })
      }
    ],
    temperature: 0.2,
    max_tokens: clampInt(process.env.GROQ_MAX_TOKENS, 512, 4096, 2200),
    user: anonymousId
  };

  const groqResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await groqResponse.json().catch(() => ({}));

  if (!groqResponse.ok) {
    const message = data?.error?.message || `Groq request failed with ${groqResponse.status}`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned an empty recommendation.");
  }

  return parseAiJsonContent(content);
}

function parseAiJsonContent(content) {
  const raw = String(content || "").trim();
  const cleaned = stripAiReasoning(raw);
  const candidates = [raw, cleaned, extractJsonObject(cleaned), extractJsonObject(raw)].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next representation.
    }
  }

  throw new Error("Groq returned a non-JSON recommendation.");
}

function stripAiReasoning(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(value) {
  const text = String(value || "");
  const start = text.indexOf("{");
  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

async function logRecommendationLocally({
  auth,
  anonymousId,
  inputIngredients,
  preferences,
  recommendation,
  source
}) {
  if (!auth && db.provider !== "supabase") {
    return { enabled: true, stored: false, reason: "login_required" };
  }

  const now = new Date().toISOString();
  await db.mutate((data) => {
    data.recommendationLogs.push({
      id: randomUUID(),
      userId: auth?.user.id || null,
      anonymousId,
      inputIngredients,
      preferences,
      recommendation,
      source,
      createdAt: now
    });

    const topRecipe = recommendation.recipes[0];
    if (topRecipe) {
      data.savingsLogs.push({
        id: randomUUID(),
        userId: auth?.user.id || null,
        anonymousId,
        recipeName: topRecipe.name,
        estimatedSavings: topRecipe.estimatedSavings,
        createdAt: now
      });
    }

    if (auth) {
      trimUserLogs(data.recommendationLogs, auth.user.id, 200);
      trimUserLogs(data.savingsLogs, auth.user.id, 500);
    }
  });

  return { enabled: true, stored: true };
}

async function logRecommendationToSupabase({
  userId,
  anonymousId,
  inputIngredients,
  preferences,
  recommendation,
  source
}) {
  const recommendationTable = process.env.SUPABASE_RECOMMENDATION_TABLE || "recommendation_logs";
  const savingsTable = process.env.SUPABASE_SAVINGS_TABLE || "savings_logs";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { enabled: false, stored: false };
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };
  if (SUPABASE_SCHEMA !== "public") {
    headers["Accept-Profile"] = SUPABASE_SCHEMA;
    headers["Content-Profile"] = SUPABASE_SCHEMA;
  }

  try {
    await supabaseInsert(`${SUPABASE_URL}/rest/v1/${recommendationTable}`, headers, {
      user_id: userId,
      anonymous_id: anonymousId,
      input_ingredients: inputIngredients,
      preferences,
      ai_response: {
        ...recommendation,
        source
      }
    });

    const topRecipe = recommendation.recipes[0];
    if (topRecipe) {
      await supabaseInsert(`${SUPABASE_URL}/rest/v1/${savingsTable}`, headers, {
        user_id: userId,
        anonymous_id: anonymousId,
        recipe_name: topRecipe.name,
        estimated_savings: topRecipe.estimatedSavings
      });
    }

    return { enabled: true, stored: true };
  } catch (error) {
    console.warn("Supabase logging failed.", error.message);
    return { enabled: true, stored: false, warning: error.message };
  }
}

async function supabaseInsert(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase insert failed with ${response.status}`);
  }
}

async function ensureAdminAccount() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!email && !password) {
    return;
  }

  if (!validateEmail(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  const passwordFailures = validatePassword(password);
  if (passwordFailures.length) {
    throw new Error("ADMIN_PASSWORD does not meet the password policy.");
  }

  const displayName = normalizeDisplayName(process.env.ADMIN_DISPLAY_NAME || "Admin", email);
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  await db.mutate((data) => {
    const existing = data.users.find((item) => item.email === email);
    if (existing) {
      existing.displayName = displayName;
      existing.passwordHash = passwordHash;
      existing.role = "admin";
      existing.status = "active";
      existing.permissions = asObject(existing.permissions);
      existing.updatedAt = now;
      return publicUser(existing);
    }

    const record = {
      id: randomUUID(),
      email,
      displayName,
      passwordHash,
      role: "admin",
      status: "active",
      permissions: {},
      createdAt: now,
      updatedAt: now
    };
    data.users.push(record);
    return publicUser(record);
  });
}

async function createUserSession(user, request) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const csrfToken = createCsrfToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await db.mutate((data) => {
    const currentTime = Date.now();
    data.sessions = data.sessions.filter((session) => new Date(session.expiresAt).getTime() > currentTime);
    data.sessions.push({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      csrfToken,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt,
      userAgent: String(request.headers["user-agent"] || "").slice(0, 240),
      ipHash: hashClientAddress(getClientIp(request))
    });
  });

  return {
    csrfToken,
    cookie: serializeSessionCookie(token, request)
  };
}

async function resolveSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token || token.length < 30) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  return db.get((data) => {
    const session = data.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session || new Date(session.expiresAt).getTime() <= now) {
      return null;
    }

    const user = data.users.find((item) => item.id === session.userId);
    if (!user) {
      return null;
    }

    if (normalizeUserStatus(user.status) !== "active") {
      return null;
    }

    return {
      session,
      user
    };
  });
}

async function requireSession(request, options = {}) {
  const auth = await resolveSession(request);
  if (!auth) {
    throw new HttpError(401, "로그인이 필요합니다.");
  }

  if (options.requireCsrf) {
    assertCsrf(request, auth.session);
  }

  return auth;
}

async function requireAdmin(request, options = {}) {
  const auth = await requireSession(request, options);
  if (!isAdminUser(auth.user)) {
    throw new HttpError(403, "Admin account required.");
  }

  return auth;
}

async function resolveIpBlock(request) {
  const ipHash = hashClientAddress(getClientIp(request));
  return db.get((data) => {
    const ipBlocks = Array.isArray(data.ipBlocks) ? data.ipBlocks : [];
    return ipBlocks.find((block) => block.ipHash === ipHash) || null;
  });
}

function createFallbackRecommendation(ingredients, preferences) {
  const ingredientSet = new Set(ingredients.map((item) => item.toLowerCase()));
  const has = (...names) => names.some((name) => ingredientSet.has(name.toLowerCase()));
  const owned = (...names) => names.filter((name) => has(name));
  const savings = DEFAULT_DELIVERY_COST - DEFAULT_HOME_COOKING_COST;
  const maxCookTime = preferences.maxCookTimeMinutes || 20;

  const recipes = [
    {
      name: has("김치", "밥") ? "김치볶음밥" : "냉장고 재료 볶음밥",
      reason: "밥과 남은 재료를 한 번에 처리할 수 있어 식비 절약 효과가 큽니다.",
      ownedIngredients: owned("김치", "밥", "계란", "달걀", "두부", "대파", "파"),
      missingIngredients: has("참기름") ? [] : ["참기름"],
      cookTimeMinutes: Math.min(15, maxCookTime),
      difficulty: "easy",
      steps: [
        "팬에 기름을 두르고 파나 단단한 재료를 먼저 볶습니다.",
        "김치나 채소를 넣고 수분을 날리며 볶습니다.",
        "밥을 넣고 고르게 섞은 뒤 간을 맞춥니다.",
        "계란이나 참기름을 더해 마무리합니다."
      ],
      estimatedSavings: savings
    },
    {
      name: has("두부", "김치") ? "두부김치" : "단백질 냉장고 한 접시",
      reason: "두부, 계란, 채소처럼 빨리 쓰기 좋은 재료를 중심으로 구성했습니다.",
      ownedIngredients: owned("두부", "김치", "계란", "달걀", "파", "대파", "양파"),
      missingIngredients: has("간장") ? [] : ["간장"],
      cookTimeMinutes: Math.min(12, maxCookTime),
      difficulty: "easy",
      steps: [
        "두부나 단백질 재료를 먹기 좋은 크기로 준비합니다.",
        "김치나 채소를 팬에 볶아 감칠맛을 냅니다.",
        "간장이나 소금으로 간을 조절합니다.",
        "밥과 곁들일 수 있게 따뜻하게 담습니다."
      ],
      estimatedSavings: 7800
    },
    {
      name: has("계란", "달걀") ? "계란국" : "빠른 냉장고 국",
      reason: "조리 시간이 짧고 부족한 재료가 적어 저녁 메뉴로 안정적입니다.",
      ownedIngredients: owned("계란", "달걀", "두부", "대파", "파", "양파", "김치"),
      missingIngredients: has("국간장") ? [] : ["국간장"],
      cookTimeMinutes: Math.min(10, maxCookTime),
      difficulty: "easy",
      steps: [
        "물이나 육수를 끓입니다.",
        "두부, 파, 양파처럼 있는 재료를 먼저 넣습니다.",
        "계란을 천천히 풀어 넣습니다.",
        "국간장이나 소금으로 간을 맞춥니다."
      ],
      estimatedSavings: 6500
    }
  ];

  const priorityIngredients = ingredients
    .filter((item) => ["두부", "콩나물", "버섯", "상추", "시금치", "대파", "파"].includes(item))
    .slice(0, 3);

  return {
    recipes,
    priorityIngredients: priorityIngredients.length ? priorityIngredients : ingredients.slice(0, 2),
    summary: `배달 대신 집밥으로 해결하면 오늘 약 ${formatKrw(savings)}을 아낄 수 있습니다.`
  };
}

function normalizeRecommendation(recommendation, ingredients) {
  const source = recommendation && typeof recommendation === "object" ? recommendation : {};
  const fallback = createFallbackRecommendation(ingredients, {});
  const recipes = Array.isArray(source.recipes) ? source.recipes : [];
  const normalizedRecipes = recipes.slice(0, 3).map((recipe, index) => {
    const fallbackRecipe = fallback.recipes[index] || fallback.recipes[0];
    const estimatedDeliveryCost = clampInt(recipe.estimatedDeliveryCost, 8000, 30_000, DEFAULT_DELIVERY_COST);
    const rawSavings = clampInt(
      recipe.estimatedSavings,
      0,
      estimatedDeliveryCost,
      fallbackRecipe.estimatedSavings
    );
    const estimatedHomeCookingCost = clampInt(
      recipe.estimatedHomeCookingCost,
      0,
      estimatedDeliveryCost,
      Math.max(0, estimatedDeliveryCost - rawSavings)
    );
    const savingsDifference = Math.max(0, estimatedDeliveryCost - estimatedHomeCookingCost);

    return {
      name: asString(recipe.name, fallbackRecipe.name),
      reason: asString(recipe.reason, fallbackRecipe.reason),
      ownedIngredients: asStringArray(recipe.ownedIngredients, fallbackRecipe.ownedIngredients).slice(0, 12),
      missingIngredients: asStringArray(recipe.missingIngredients, fallbackRecipe.missingIngredients).slice(0, 8),
      cookTimeMinutes: clampInt(recipe.cookTimeMinutes, 5, 60, fallbackRecipe.cookTimeMinutes),
      difficulty: ["easy", "medium", "hard"].includes(recipe.difficulty) ? recipe.difficulty : "easy",
      steps: asStringArray(recipe.steps, fallbackRecipe.steps).slice(0, 6),
      estimatedDeliveryCost,
      estimatedHomeCookingCost,
      estimatedSavings: savingsDifference,
      savingsDifference
    };
  });

  while (normalizedRecipes.length < 3) {
    const fallbackRecipe = fallback.recipes[normalizedRecipes.length];
    normalizedRecipes.push({
      ...fallbackRecipe,
      estimatedDeliveryCost: DEFAULT_DELIVERY_COST,
      estimatedHomeCookingCost: DEFAULT_HOME_COOKING_COST,
      savingsDifference: fallbackRecipe.estimatedSavings
    });
  }

  return {
    recipes: normalizedRecipes,
    priorityIngredients: asStringArray(source.priorityIngredients, fallback.priorityIngredients).slice(0, 5),
    summary: asString(source.summary, fallback.summary),
    totals: {
      bestSavings: Math.max(...normalizedRecipes.map((recipe) => recipe.estimatedSavings)),
      averageDeliveryCost: DEFAULT_DELIVERY_COST,
      estimatedHomeCookingCost: DEFAULT_HOME_COOKING_COST
    }
  };
}

function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const requestedPath = path.resolve(PUBLIC_DIR, `.${safePath}`);
  const relativePath = path.relative(PUBLIC_DIR, requestedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !existsSync(requestedPath)) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const extension = path.extname(requestedPath);
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300"
  });
  createReadStream(requestedPath).pipe(response);
}

function readJson(request, maxBytes = 64_000) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new HttpError(413, "요청 본문이 너무 큽니다."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, "JSON 요청 형식이 올바르지 않습니다."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function securityHeaders() {
  const headers = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'"
    ].join("; "),
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
  };

  if (process.env.NODE_ENV === "production") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}

function handleError(response, error) {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, {
      error: error.message,
      details: error.details
    });
    return;
  }

  console.error(error);
  sendJson(response, 500, {
    error: "Unexpected server error",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
}

function assertSafeRequestOrigin(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")) {
    return;
  }

  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
  }

  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  const allowedOrigins = new Set();
  const host = request.headers.host;
  const forwardedHost = request.headers["x-forwarded-host"];
  for (const value of [host, forwardedHost].filter(Boolean)) {
    allowedOrigins.add(`http://${value}`);
    allowedOrigins.add(`https://${value}`);
  }

  if (!allowedOrigins.has(origin)) {
    throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
  }
}

function assertCsrf(request, session) {
  const token = request.headers["x-csrf-token"];
  if (!token || token !== session.csrfToken) {
    throw new HttpError(403, "보안 토큰이 만료되었거나 올바르지 않습니다.");
  }
}

function enforceRateLimit(request, response, bucket, maxRequests, windowMs) {
  const now = Date.now();
  const key = `${bucket}:${getClientIp(request)}`;
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  if (current.count > maxRequests) {
    sendJson(response, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });
    return false;
  }

  return true;
}

function serializeSessionCookie(token, request) {
  const secure = isSecureCookieRequired(request);
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function clearSessionCookie(request) {
  const secure = isSecureCookieRequired(request);
  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function isSecureCookieRequired(request) {
  return (
    process.env.SESSION_COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production" ||
    request.headers["x-forwarded-proto"] === "https"
  );
}

function parseCookies(headerValue) {
  const cookies = {};
  for (const part of String(headerValue || "").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
    createdAt: user.createdAt
  };
}

async function createSupportReply(message) {
  const text = message.toLowerCase();
  const intents = [
    {
      id: "login",
      keywords: ["로그인", "회원", "가입", "비밀번호", "계정"],
      answer:
        "로그인은 login.html, 회원가입은 register.html에서 각각 할 수 있습니다. 비밀번호는 10자 이상이고 영문과 숫자를 모두 포함해야 합니다.",
      suggestions: ["로그인 페이지", "회원가입 방법", "로그아웃"]
    },
    {
      id: "fridge-clear",
      keywords: ["추천", "메뉴", "요리", "재료", "냉장고", "레시피", "털기"],
      answer:
        "냉장고 재료 털기 화면에서 보유 재료를 쉼표나 줄바꿈으로 입력하면 만들 수 있는 메뉴 3가지를 보여줍니다. 로그인하면 털기 기록과 예상 절약 금액이 저장됩니다.",
      suggestions: ["재료 입력", "털기 기록", "식비 절약"]
    },
    {
      id: "pantry",
      keywords: ["저장", "재료 db", "재료db", "유통기한", "소비기한", "삭제"],
      answer:
        "로그인 후 재료 DB에 재료명, 수량, 소비기한을 저장할 수 있습니다. 저장된 재료는 냉장고 재료 털기 입력란으로 바로 옮길 수 있습니다.",
      suggestions: ["재료 저장", "소비기한", "재료 삭제"]
    },
    {
      id: "admin",
      keywords: ["관리자", "admin", "권한", "차단", "ip", "정지"],
      answer:
        "관리자 계정은 사용자 목록, 계정 상태, 권한, 의심 IP 차단을 관리합니다. 일반 계정에서는 관리자 API와 화면이 열리지 않습니다.",
      suggestions: ["사용자 정지", "IP 차단", "권한 변경"]
    },
    {
      id: "notes",
      keywords: ["메모", "노트", "할일", "기록", "체크"],
      answer:
        "메모장 화면에서 자취 생활 메모, 장보기 계획, 할 일을 저장할 수 있습니다. 현재 메모는 이 브라우저의 localStorage에 저장됩니다.",
      suggestions: ["메모 저장", "장보기 메모", "할 일 관리"]
    },
    {
      id: "shopping",
      keywords: [
        "장바구니",
        "쇼핑",
        "필수품",
        "자취",
        "구매",
        "쿠팡",
        "네이버",
        "11번가",
        "g마켓",
        "shopping",
        "cart",
        "basket",
        "living",
        "apartment",
        "checklist",
        "essential",
        "essentials"
      ],
      answer:
        "자취 장바구니 화면에서 주방, 청소, 욕실, 생활 필수품을 체크하고 쇼핑몰 검색 링크로 바로 이동할 수 있습니다.",
      suggestions: ["자취 필수품", "주방 기본템", "청소 용품"]
    },
    {
      id: "tips",
      keywords: ["꿀팁", "서류", "전입신고", "확정일자", "계약", "관리비", "이사"],
      answer:
        "꿀팁방출기 화면에서 전입신고, 확정일자, 계약 전 점검, 관리비, 이사 당일 체크 같은 자취 정보를 검색하고 분야별로 볼 수 있습니다.",
      suggestions: ["전입신고", "계약 전 확인", "관리비 정리"]
    },
    {
      id: "privacy",
      keywords: ["개인정보", "보안", "세션", "데이터", "삭제"],
      answer:
        "계정, 세션, 냉장고 털기 기록은 서버 쪽 로컬 DB에 저장됩니다. IP 차단은 원문 IP가 아니라 해시 지문으로 관리합니다.",
      suggestions: ["데이터 저장 위치", "IP 차단 방식", "로그아웃"]
    }
  ];

  const search = await searchWebSummary(message);
  if (search.answer) {
    return {
      intent: "search",
      answer: search.answer,
      suggestions: ["관련 링크 확인", "더 구체적으로 질문하기", "메모장에 기록하기"],
      links: search.links
    };
  }

  const matched = intents.find((intent) => intent.keywords.some((keyword) => text.includes(keyword)));
  if (matched) {
    return {
      intent: matched.id,
      answer: matched.answer,
      suggestions: matched.suggestions,
      links: createSearchLinks(message)
    };
  }

  return {
    intent: "fallback",
    answer:
      "지금은 기본 문의만 자동 응답할 수 있습니다. 로그인, 냉장고 재료 털기, 재료 DB, 관리자, 메모장, 자취 장바구니, 꿀팁방출기 중 하나를 물어보면 더 정확히 답할게요.",
    suggestions: ["냉장고 재료 털기는 어떻게 해?", "자취 필수품 알려줘", "관리자는 무엇을 할 수 있어?"],
    links: createSearchLinks(message)
  };
}

async function searchWebSummary(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

  try {
    const data = JSON.parse(await requestTextWithTimeout(url, 3500));
    const related = extractDuckDuckGoRelatedTopic(data.RelatedTopics);
    const answer = normalizeShortText(data.AbstractText || data.Answer || related?.text || "", 900);
    const links = [
      ...uniqueSearchLinks([
        data.AbstractURL ? { name: data.Heading || "DuckDuckGo result", url: data.AbstractURL } : null,
        related?.url ? { name: "Related result", url: related.url } : null,
        ...createSearchLinks(query)
      ])
    ];

    return {
      answer,
      links
    };
  } catch {
    return { answer: "", links: createSearchLinks(query) };
  }
}

function requestTextWithTimeout(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "curl/8.0"
        },
        timeout: timeoutMs
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`Search request failed with ${response.statusCode}`));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Search request timed out."));
    });
    request.on("error", reject);
  });
}

function extractDuckDuckGoRelatedTopic(topics) {
  if (!Array.isArray(topics)) {
    return null;
  }

  for (const topic of topics) {
    if (topic?.Text && topic?.FirstURL) {
      return {
        text: topic.Text,
        url: topic.FirstURL
      };
    }

    const nested = extractDuckDuckGoRelatedTopic(topic?.Topics);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function createSearchLinks(query) {
  const encoded = encodeURIComponent(query);
  return [
    {
      name: "네이버 검색",
      url: `https://search.naver.com/search.naver?query=${encoded}`
    },
    {
      name: "Google 검색",
      url: `https://www.google.com/search?q=${encoded}`
    },
    {
      name: "DuckDuckGo 검색",
      url: `https://duckduckgo.com/?q=${encoded}`
    }
  ];
}

function uniqueSearchLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    if (!link?.url || seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
}

function buildAdminOverview(data, currentUserId) {
  const users = (Array.isArray(data.users) ? data.users : [])
    .map((user) => buildAdminUser(user, data))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const activeSessions = (Array.isArray(data.sessions) ? data.sessions : []).filter(
    (session) => new Date(session.expiresAt).getTime() > Date.now()
  );
  const ipBlocks = (Array.isArray(data.ipBlocks) ? data.ipBlocks : [])
    .map((block) => buildPublicIpBlock(block, data))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return {
    currentUserId,
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.status === "active").length,
      suspendedUsers: users.filter((user) => user.status === "suspended").length,
      adminUsers: users.filter((user) => user.role === "admin").length,
      activeSessions: activeSessions.length,
      blockedIps: ipBlocks.length
    },
    users,
    ipBlocks
  };
}

function buildAdminUser(user, data) {
  const sessions = (Array.isArray(data.sessions) ? data.sessions : [])
    .filter((session) => session.userId === user.id)
    .sort((a, b) => String(b.lastSeenAt || b.createdAt).localeCompare(String(a.lastSeenAt || a.createdAt)));
  const activeSessions = sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  const ipBlocks = Array.isArray(data.ipBlocks) ? data.ipBlocks : [];
  const pantryItems = (Array.isArray(data.pantryItems) ? data.pantryItems : []).filter(
    (item) => item.userId === user.id
  );
  const recommendationLogs = (Array.isArray(data.recommendationLogs) ? data.recommendationLogs : []).filter(
    (log) => log.userId === user.id
  );
  const savingsTotal = (Array.isArray(data.savingsLogs) ? data.savingsLogs : [])
    .filter((log) => log.userId === user.id)
    .reduce((sum, log) => sum + Number(log.estimatedSavings || 0), 0);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    pantryCount: pantryItems.length,
    recommendationCount: recommendationLogs.length,
    savingsTotal,
    activeSessionCount: activeSessions.length,
    lastSeenAt: sessions[0]?.lastSeenAt || sessions[0]?.createdAt || null,
    sessions: sessions.slice(0, 5).map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt || session.createdAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent || "",
      ipFingerprint: formatIpFingerprint(session.ipHash),
      blocked: ipBlocks.some((block) => block.ipHash === session.ipHash)
    }))
  };
}

function buildPublicIpBlock(block, data) {
  const users = Array.isArray(data.users) ? data.users : [];
  const target = users.find((user) => user.id === block.userId);
  const createdBy = users.find((user) => user.id === block.createdByUserId);

  return {
    id: block.id,
    ipFingerprint: formatIpFingerprint(block.ipHash),
    reason: block.reason || "",
    createdAt: block.createdAt,
    user: target
      ? {
          id: target.id,
          email: target.email,
          displayName: target.displayName
        }
      : null,
    createdBy: createdBy
      ? {
          id: createdBy.id,
          email: createdBy.email,
          displayName: createdBy.displayName
        }
      : null
  };
}

function isAdminUser(user) {
  return normalizeUserRole(user?.role) === "admin" && normalizeUserStatus(user?.status) === "active";
}

function normalizeUserRole(value) {
  const role = String(value || "user").trim().toLowerCase();
  return USER_ROLES.has(role) ? role : "user";
}

function normalizeUserStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  return USER_STATUSES.has(status) ? status : "active";
}

function parseUserRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (!USER_ROLES.has(role)) {
    throw new HttpError(400, "Invalid account role.");
  }
  return role;
}

function parseUserStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!USER_STATUSES.has(status)) {
    throw new HttpError(400, "Invalid account status.");
  }
  return status;
}

function countAdminUsers(data) {
  return data.users.filter((user) => normalizeUserRole(user.role) === "admin").length;
}

function countActiveAdminUsers(data) {
  return data.users.filter((user) => isAdminUser(user)).length;
}

function formatIpFingerprint(ipHash) {
  const value = String(ipHash || "");
  return value ? `ip:${value.slice(0, 8)}...${value.slice(-6)}` : "ip:unknown";
}

function normalizeDisplayName(value, email) {
  const fallback = email.includes("@") ? email.split("@")[0] : "사용자";
  const cleaned = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizePantryInput(payload, options = {}) {
  const source = asObject(payload);
  const input = {};

  if (!options.partial || Object.hasOwn(source, "name")) {
    const name = normalizeShortText(source.name, 80);
    if (!name) {
      throw new HttpError(400, "재료 이름을 입력해 주세요.");
    }
    input.name = name;
  }

  if (!options.partial || Object.hasOwn(source, "quantity")) {
    input.quantity = normalizeShortText(source.quantity, 40);
  }

  if (!options.partial || Object.hasOwn(source, "expiresAt")) {
    input.expiresAt = normalizeDate(source.expiresAt);
  }

  if (options.partial && Object.keys(input).length === 0) {
    throw new HttpError(400, "변경할 값이 없습니다.");
  }

  return input;
}

function normalizeShortText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpError(400, "날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }

  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new HttpError(400, "올바른 날짜를 입력해 주세요.");
  }

  return text;
}

function comparePantryItems(a, b) {
  if (a.expiresAt && b.expiresAt && a.expiresAt !== b.expiresAt) {
    return a.expiresAt.localeCompare(b.expiresAt);
  }
  if (a.expiresAt && !b.expiresAt) {
    return -1;
  }
  if (!a.expiresAt && b.expiresAt) {
    return 1;
  }
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

function trimUserLogs(logs, userId, maxItems) {
  const userLogs = logs
    .filter((log) => log.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const keep = new Set(userLogs.slice(0, maxItems).map((log) => log.id));
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (logs[index].userId === userId && !keep.has(logs[index].id)) {
      logs.splice(index, 1);
    }
  }
}

function loadEnv(envPath) {
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function normalizeIngredients(ingredients, ingredientsText) {
  const rawItems = Array.isArray(ingredients)
    ? ingredients
    : String(ingredientsText || "")
        .split(/[,;\n]/)
        .map((item) => item.trim());

  return [...new Set(rawItems.map((item) => normalizeShortText(item, 60)).filter(Boolean))].slice(0, 15);
}

function ingredientKey(value) {
  return normalizeShortText(value, 80)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s._,/\\|()[\]{}'"`~!@#$%^&*+=:;?-]+/g, "");
}

function normalizePreferences(preferences = {}) {
  const source = asObject(preferences);
  return {
    goal: asString(source.goal, "save_money"),
    servings: clampInt(source.servings, 1, 6, 1),
    maxCookTimeMinutes: clampInt(source.maxCookTimeMinutes, 5, 60, 20),
    priorityNotes: normalizeShortText(source.priorityNotes, 160)
  };
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeAnonymousId(value) {
  const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return safe || "anonymous-demo-user";
}

function asString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.map((item) => normalizeShortText(item, 120)).filter(Boolean);
  return normalized.length ? normalized : fallback;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function parseBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function formatKrw(value) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function getClientIp(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || request.socket.remoteAddress || "unknown";
}
