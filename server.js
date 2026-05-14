import http from "node:http";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH || path.join(__dirname, "data", "app.db.json");
const SESSION_COOKIE_NAME = "fi_session";
const SESSION_TTL_DAYS = clampInt(process.env.SESSION_TTL_DAYS, 1, 30, 7);
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_DELIVERY_COST = 12000;
const DEFAULT_HOME_COOKING_COST = 3500;

const db = new LocalDatabase(LOCAL_DB_PATH);
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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

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
      sendJson(response, 200, {
        ok: true,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
        supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
        localDbConfigured: true,
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
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`냉장고 재료 running at http://${displayHost}:${PORT}`);
});

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

  if (ingredients.length === 0) {
    throw new HttpError(400, "재료를 한 가지 이상 입력해 주세요.");
  }

  let source = "fallback";
  let recommendation = null;
  let warning = null;

  try {
    recommendation = await createAiRecommendation({ ingredients, preferences, anonymousId });
    if (recommendation) {
      source = "openai";
    }
  } catch (error) {
    warning = error.message;
    console.warn("OpenAI recommendation failed. Using fallback.", error.message);
  }

  if (!recommendation) {
    recommendation = createFallbackRecommendation(ingredients, preferences);
  }

  const normalized = normalizeRecommendation(recommendation, ingredients);
  const supabaseLogging = await logRecommendationToSupabase({
    userId: auth?.user.id || null,
    anonymousId,
    inputIngredients: ingredients,
    preferences,
    recommendation: normalized,
    source
  });
  const localLogging = await logRecommendationLocally({
    auth,
    anonymousId,
    inputIngredients: ingredients,
    preferences,
    recommendation: normalized,
    source
  });

  sendJson(response, 200, {
    ...normalized,
    meta: {
      source,
      warning,
      logging: {
        stored: Boolean(supabaseLogging.stored || localLogging.stored),
        supabase: supabaseLogging,
        local: localLogging
      }
    }
  });
}

async function createAiRecommendation({ ingredients, preferences, anonymousId }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You are 냉장고 재료, a Korean home-cooking assistant.",
          "Return only JSON that matches the provided schema.",
          "Recommend realistic meals from owned ingredients.",
          "Keep missing ingredients optional and cheap.",
          "Estimate savings in KRW compared with delivery food."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          ingredients,
          preferences,
          requiredLanguage: "ko-KR",
          savingsRule: {
            deliveryCostKrw: DEFAULT_DELIVERY_COST,
            defaultHomeCookingCostKrw: DEFAULT_HOME_COOKING_COST
          }
        })
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "recipe_recommendation",
        strict: true,
        schema: RECOMMENDATION_SCHEMA
      }
    },
    max_completion_tokens: 1400,
    safety_identifier: anonymousId
  };

  const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await openAiResponse.json().catch(() => ({}));

  if (!openAiResponse.ok) {
    const message = data?.error?.message || `OpenAI request failed with ${openAiResponse.status}`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty recommendation.");
  }

  return JSON.parse(content);
}

async function logRecommendationLocally({
  auth,
  anonymousId,
  inputIngredients,
  preferences,
  recommendation,
  source
}) {
  if (!auth) {
    return { enabled: true, stored: false, reason: "login_required" };
  }

  const now = new Date().toISOString();
  await db.mutate((data) => {
    data.recommendationLogs.push({
      id: randomUUID(),
      userId: auth.user.id,
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
        userId: auth.user.id,
        recipeName: topRecipe.name,
        estimatedSavings: topRecipe.estimatedSavings,
        createdAt: now
      });
    }

    trimUserLogs(data.recommendationLogs, auth.user.id, 200);
    trimUserLogs(data.savingsLogs, auth.user.id, 500);
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
  const supabaseUrl = trimTrailingSlash(process.env.SUPABASE_URL || "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recommendationTable = process.env.SUPABASE_RECOMMENDATION_TABLE || "recommendation_logs";
  const savingsTable = process.env.SUPABASE_SAVINGS_TABLE || "savings_logs";

  if (!supabaseUrl || !serviceKey) {
    return { enabled: false, stored: false };
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };

  try {
    await supabaseInsert(`${supabaseUrl}/rest/v1/${recommendationTable}`, headers, {
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
      await supabaseInsert(`${supabaseUrl}/rest/v1/${savingsTable}`, headers, {
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
    return {
      name: asString(recipe.name, fallbackRecipe.name),
      reason: asString(recipe.reason, fallbackRecipe.reason),
      ownedIngredients: asStringArray(recipe.ownedIngredients, fallbackRecipe.ownedIngredients).slice(0, 12),
      missingIngredients: asStringArray(recipe.missingIngredients, fallbackRecipe.missingIngredients).slice(0, 8),
      cookTimeMinutes: clampInt(recipe.cookTimeMinutes, 5, 60, fallbackRecipe.cookTimeMinutes),
      difficulty: ["easy", "medium", "hard"].includes(recipe.difficulty) ? recipe.difficulty : "easy",
      steps: asStringArray(recipe.steps, fallbackRecipe.steps).slice(0, 6),
      estimatedSavings: clampInt(recipe.estimatedSavings, 1000, 15000, fallbackRecipe.estimatedSavings)
    };
  });

  while (normalizedRecipes.length < 3) {
    normalizedRecipes.push(fallback.recipes[normalizedRecipes.length]);
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
    createdAt: user.createdAt
  };
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

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
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
