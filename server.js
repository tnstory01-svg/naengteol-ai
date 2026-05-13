import http from "node:http";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_DELIVERY_COST = 12000;
const DEFAULT_HOME_COOKING_COST = 3500;

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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
        supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      });
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
    console.error(error);
    sendJson(response, 500, {
      error: "Unexpected server error",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`냉장고 재료 running at http://${displayHost}:${PORT}`);
});

async function handleRecommend(request, response) {
  const payload = await readJson(request);
  const anonymousId = normalizeAnonymousId(payload.anonymousId);
  const ingredients = normalizeIngredients(payload.ingredients, payload.ingredientsText);
  const preferences = normalizePreferences(payload.preferences);

  if (ingredients.length === 0) {
    sendJson(response, 400, { error: "At least one ingredient is required." });
    return;
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
  const logging = await logRecommendation({
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
      logging
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

async function logRecommendation({ anonymousId, inputIngredients, preferences, recommendation, source }) {
  const supabaseUrl = trimTrailingSlash(process.env.SUPABASE_URL || "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recommendationTable = process.env.SUPABASE_RECOMMENDATION_TABLE || "recommendation_logs";
  const savingsTable = process.env.SUPABASE_SAVINGS_TABLE || "savings_logs";

  if (!supabaseUrl || !serviceKey) {
    return { enabled: false };
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };

  try {
    await supabaseInsert(`${supabaseUrl}/rest/v1/${recommendationTable}`, headers, {
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

function createFallbackRecommendation(ingredients, preferences) {
  const ingredientSet = new Set(ingredients.map((item) => item.toLowerCase()));
  const has = (...names) => names.some((name) => ingredientSet.has(name.toLowerCase()));
  const owned = (...names) => names.filter((name) => has(name));
  const savings = DEFAULT_DELIVERY_COST - DEFAULT_HOME_COOKING_COST;

  const recipes = [
    {
      name: has("김치", "밥") ? "김치볶음밥" : "남은 재료 볶음밥",
      reason: "밥과 냉장고 재료를 한 번에 처리할 수 있어 식비 절약 효과가 큽니다.",
      ownedIngredients: owned("김치", "밥", "계란", "대파", "양파", "햄"),
      missingIngredients: has("참기름") ? [] : ["참기름"],
      cookTimeMinutes: preferences.maxCookTimeMinutes ? Math.min(15, preferences.maxCookTimeMinutes) : 15,
      difficulty: "easy",
      steps: [
        "팬에 기름을 두르고 향이 나는 재료를 먼저 볶습니다.",
        "김치나 남은 채소를 넣고 수분을 날리듯 볶습니다.",
        "밥을 넣고 고르게 섞은 뒤 간을 맞춥니다.",
        "계란이나 참기름을 더해 마무리합니다."
      ],
      estimatedSavings: savings
    },
    {
      name: has("두부", "김치") ? "두부김치" : "단백질 냉털 한 접시",
      reason: "두부, 계란, 햄처럼 빨리 쓰기 좋은 단백질 재료를 중심으로 구성했습니다.",
      ownedIngredients: owned("두부", "김치", "계란", "햄", "대파"),
      missingIngredients: has("간장") ? [] : ["간장"],
      cookTimeMinutes: 12,
      difficulty: "easy",
      steps: [
        "두부나 단백질 재료를 먹기 좋은 크기로 준비합니다.",
        "김치나 채소를 팬에 볶아 감칠맛을 냅니다.",
        "간장이나 소금으로 간을 조절합니다.",
        "밥과 곁들일 수 있게 접시에 담습니다."
      ],
      estimatedSavings: 7800
    },
    {
      name: has("계란") ? "계란국" : "빠른 냉장고 국",
      reason: "조리 시간이 짧고 부족한 재료가 적어 데모에 안정적으로 보여줄 수 있습니다.",
      ownedIngredients: owned("계란", "대파", "두부", "양파", "김치"),
      missingIngredients: has("국간장") ? [] : ["국간장"],
      cookTimeMinutes: 10,
      difficulty: "easy",
      steps: [
        "물 또는 육수를 끓입니다.",
        "대파, 양파, 두부처럼 있는 재료를 먼저 넣습니다.",
        "계란을 풀어 천천히 둘러 넣습니다.",
        "국간장이나 소금으로 간을 맞춥니다."
      ],
      estimatedSavings: 6500
    }
  ];

  const priorityIngredients = ingredients
    .filter((item) => ["두부", "콩나물", "버섯", "상추", "시금치", "대파"].includes(item))
    .slice(0, 3);

  return {
    recipes,
    priorityIngredients: priorityIngredients.length ? priorityIngredients : ingredients.slice(0, 2),
    summary: `배달 대신 집밥으로 해결하면 오늘 약 ${formatKrw(savings)}을 아낄 수 있습니다.`
  };
}

function normalizeRecommendation(recommendation, ingredients) {
  const fallback = createFallbackRecommendation(ingredients, {});
  const recipes = Array.isArray(recommendation.recipes) ? recommendation.recipes : [];
  const normalizedRecipes = recipes.slice(0, 3).map((recipe, index) => {
    const fallbackRecipe = fallback.recipes[index] || fallback.recipes[0];
    return {
      name: asString(recipe.name, fallbackRecipe.name),
      reason: asString(recipe.reason, fallbackRecipe.reason),
      ownedIngredients: asStringArray(recipe.ownedIngredients, fallbackRecipe.ownedIngredients),
      missingIngredients: asStringArray(recipe.missingIngredients, fallbackRecipe.missingIngredients),
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
    priorityIngredients: asStringArray(recommendation.priorityIngredients, fallback.priorityIngredients).slice(0, 5),
    summary: asString(recommendation.summary, fallback.summary),
    totals: {
      bestSavings: Math.max(...normalizedRecipes.map((recipe) => recipe.estimatedSavings)),
      averageDeliveryCost: DEFAULT_DELIVERY_COST,
      estimatedHomeCookingCost: DEFAULT_HOME_COOKING_COST
    }
  };
}

function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!requestedPath.startsWith(PUBLIC_DIR) || !existsSync(requestedPath)) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const extension = path.extname(requestedPath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
  });
  createReadStream(requestedPath).pipe(response);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) {
        reject(new Error("Request body is too large."));
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
        reject(new Error("Invalid JSON request body."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
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

  return [...new Set(rawItems.map((item) => String(item).trim()).filter(Boolean))].slice(0, 15);
}

function normalizePreferences(preferences = {}) {
  return {
    goal: asString(preferences.goal, "save_money"),
    servings: clampInt(preferences.servings, 1, 6, 1),
    maxCookTimeMinutes: clampInt(preferences.maxCookTimeMinutes, 5, 60, 20),
    priorityNotes: asString(preferences.priorityNotes, "")
  };
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

  const normalized = value.map((item) => String(item).trim()).filter(Boolean);
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
