import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOOD_CATALOG, findCatalogItem, flattenCatalog, ingredientNamesMatch } from "../public/food-catalog.js";
import { RECIPE_SPECS } from "../public/recipe-specs.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const EXPECTED_ITEM_IDS = [
  "instant-rice", "cup-rice", "nurungji", "bag-ramen", "cup-ramen", "frozen-udon", "bread", "tortilla", "rice-cake",
  "frozen-dumpling", "fishcake", "tteokbokki-kit", "nugget", "pork-cutlet", "hamburg-steak", "frozen-fried-rice", "frozen-pizza", "frozen-vegetable",
  "tuna-can", "spam", "chicken-breast", "retort-curry", "retort-jjajang", "tomato-sauce", "whelk-can", "saury-can", "mackerel-can",
  "cabbage-kimchi", "kkakdugi", "yeolmu-kimchi", "jangjorim", "anchovy", "jinmichae", "bean-sprout", "danmuji", "dried-radish",
  "cabbage", "lettuce", "perilla-leaf", "potato", "carrot", "onion", "egg", "tofu", "soft-tofu", "cheese", "milk", "yogurt"
];

const items = flattenCatalog();
const recipes = items.flatMap((item) => item.recipes.map((recipe, index) => ({ item, recipe, key: `${item.id}:${index}` })));
const expectedSpecKeys = EXPECTED_ITEM_IDS.flatMap((id) => [0, 1, 2].map((index) => `${id}:${index}`));

function normalizeName(value) {
  return String(value || "").toLocaleLowerCase("ko-KR").replace(/[\s\-_/().]/g, "");
}

function names(recipe) {
  return (recipe.requiredIngredients || []).map((entry) => typeof entry === "string" ? entry : entry?.name).filter(Boolean);
}

function hasNamedIngredient(recipe, expected) {
  const wanted = normalizeName(expected);
  return names(recipe).some((name) => ingredientNamesMatch(name, expected) || normalizeName(name).includes(wanted) || wanted.includes(normalizeName(name)));
}

function recipeAt(itemId, index) {
  const entry = recipes.find((candidate) => candidate.key === `${itemId}:${index}`);
  assert.ok(entry, `missing catalog recipe ${itemId}:${index}`);
  return entry.recipe;
}

function stepText(recipe) {
  return (recipe.steps || []).join(" ");
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function startAppServer(extraEnv = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "naengteol-content-api-"));
  const entry = `import http from "node:http";
    import { handleRequest } from "./server.js";
    const server = http.createServer(handleRequest);
    server.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", entry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      VERCEL: "",
      FRONTEND_ORIGIN: "",
      SUPABASE_DB_ENABLED: "false",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      GROQ_API_KEY: "",
      GROQ_MODEL: "",
      GROQ_API_BASE_URL: "",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      SESSION_COOKIE_SECURE: "false",
      LOCAL_DB_PATH: path.join(directory, "app.db.json"),
      ...extraEnv
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  child.stderr.resume();
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("content API server startup timed out")), 5000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("content API server exited before listening")); });
    child.once("message", (message) => {
      clearTimeout(timer);
      if (Number.isInteger(message.port) && message.port > 0 && message.port < 65536) resolve(message.port);
      else reject(new Error("content API server reported an invalid port"));
    });
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    async close() {
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
      if (child.pid) await exited;
      await rm(directory, { recursive: true, force: true });
    }
  };
}

async function jsonRequest(origin, pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function guestHeaders(origin) {
  const session = await jsonRequest(origin, "/api/guest/session", { method: "POST", body: "{}" });
  assert.equal(session.response.status, 200);
  const cookie = (session.response.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^fi_guest=/);
  assert.equal(typeof session.body.csrfToken, "string");
  return { cookie, "x-csrf-token": session.body.csrfToken };
}

function projectedNames(values) {
  return (values || []).map((value) => typeof value === "string" ? value.split(" · ")[0] : value?.name).filter(Boolean);
}

test("the original 48 ingredient IDs remain present exactly once", () => {
  assert.equal(Array.isArray(FOOD_CATALOG), true);
  assert.equal(items.length, EXPECTED_ITEM_IDS.length);
  assert.deepEqual(items.map((item) => item.id), EXPECTED_ITEM_IDS);
  assert.equal(new Set(items.map((item) => item.id)).size, 48);
  for (const item of items) {
    assert.equal(typeof item.name, "string");
    assert.ok(item.name.trim(), `${item.id} has no ingredient name`);
    assert.equal(item.recipes.length, 3, `${item.id} must expose three recipes`);
  }
});

test("explicit specs cover every catalog recipe without phantom or duplicate keys", () => {
  assert.deepEqual(Object.keys(RECIPE_SPECS).sort(), expectedSpecKeys.slice().sort());
  assert.equal(Object.keys(RECIPE_SPECS).length, 144);

  for (const key of expectedSpecKeys) {
    const spec = RECIPE_SPECS[key];
    assert.ok(spec, `missing recipe spec ${key}`);
    assert.equal(spec.servings, 1, `${key} must be a one-serving adaptation`);
    assert.ok(Number.isInteger(spec.cookTimeMinutes) && spec.cookTimeMinutes > 0 && spec.cookTimeMinutes <= 90, `${key} has an invalid estimated cook time`);
    assert.ok(Array.isArray(spec.requiredIngredients) && spec.requiredIngredients.length > 0, `${key} has no required ingredients`);
    assert.ok(Array.isArray(spec.optionalIngredients), `${key} optional ingredients must be an array`);
    assert.ok(Array.isArray(spec.equipment) && spec.equipment.length > 0, `${key} has no equipment`);
    assert.ok(Array.isArray(spec.steps) && spec.steps.length >= 3, `${key} needs ordered cooking steps`);
    assert.ok(spec.steps.every((step) => typeof step === "string" && step.trim()), `${key} has an empty cooking step`);
    assert.ok(typeof spec.doneness === "string" && spec.doneness.trim(), `${key} has no doneness criterion`);
    assert.ok(Array.isArray(spec.sourceRefs) && spec.sourceRefs.length > 0, `${key} has no source scope`);

    const required = spec.requiredIngredients.map((entry) => entry.name);
    const optional = spec.optionalIngredients.map((entry) => entry.name);
    for (const requiredName of required) {
      assert.ok(requiredName && spec.requiredIngredients.find((entry) => entry.name === requiredName && entry.amount), `${key} required ingredients need amounts`);
      assert.equal(optional.some((optionalName) => ingredientNamesMatch(requiredName, optionalName)), false, `${key} repeats ${requiredName} as required and optional`);
    }
  }
});

test("catalog recipes expose the explicit spec methods and quantities", () => {
  for (const { item, recipe, key } of recipes) {
    const spec = RECIPE_SPECS[key];
    assert.ok(spec, `no spec for ${key}`);
    const actualRequired = names(recipe);
    for (const expected of spec.requiredIngredients) {
      assert.ok(hasNamedIngredient(recipe, expected.name), `${key} dropped required ingredient ${expected.name}`);
      const actual = recipe.requiredIngredients.find((entry) => hasNamedIngredient({ requiredIngredients: [entry] }, expected.name));
      assert.ok(actual?.amount, `${key} has no amount for ${expected.name}`);
    }
    assert.ok(actualRequired.length > 0, `${key} has no actual required ingredients`);
    for (const optional of recipe.optionalIngredients || []) {
      assert.equal(actualRequired.some((required) => ingredientNamesMatch(required, optional.name)), false, `${key} repeats ${optional.name} as optional and required`);
    }
    assert.equal(recipe.steps.length, spec.steps.length, `${key} does not expose all explicit steps`);
    assert.deepEqual(recipe.steps, spec.steps, `${key} is not using the explicit method steps`);
    assert.equal(recipe.doneness, spec.doneness, `${key} is not using the explicit doneness criterion`);
    assert.deepEqual(recipe.equipment, spec.equipment, `${key} is not using the explicit equipment list`);
  }
});

test("named dishes declare their true core ingredients", () => {
  const requiredByKey = {
    "instant-rice:0": ["김치", "계란"],
    "instant-rice:2": ["계란", "버터"],
    "frozen-udon:1": ["카레", "계란"],
    "frozen-udon:2": ["김치", "우동"],
    "tortilla:0": ["토마토소스", "치즈"],
    "rice-cake:1": ["어묵", "떡"],
    "frozen-dumpling:2": ["만두", "초고추장"],
    "pork-cutlet:0": ["돈가스", "밥"],
    "frozen-vegetable:2": ["냉동야채", "파스타", "우유"],
    "tuna-can:0": ["참치캔", "밥", "마요네즈"],
    "retort-curry:0": ["카레", "계란", "밥"],
    "retort-jjajang:2": ["짜장", "계란", "밥"],
    "jangjorim:0": ["장조림", "밥", "버터"],
    "anchovy:1": ["멸치", "계란", "밥"],
    "bean-sprout:0": ["콩나물", "밥"],
    "lettuce:1": ["계란", "상추", "밥"],
    "perilla-leaf:0": ["깻잎", "참치캔", "밥"],
    "egg:1": ["계란", "김치", "밥"],
    "milk:1": ["우유", "계란", "식빵"],
    "milk:2": ["우유", "계란"],
    "yogurt:0": ["요거트"]
  };

  for (const [key, expected] of Object.entries(requiredByKey)) {
    const recipe = recipeAt(...key.split(":"));
    for (const ingredient of expected) assert.ok(hasNamedIngredient(recipe, ingredient), `${key} must require ${ingredient}`);
  }
});

test("catalog aliases distinguish equivalent names without merging unrelated foods", () => {
  assert.equal(ingredientNamesMatch("계란", "달걀"), true);
  assert.equal(ingredientNamesMatch("김치", "배추김치"), true);
  assert.equal(ingredientNamesMatch("우동", "냉동우동"), true);
  assert.equal(ingredientNamesMatch("밥", "즉석밥"), true);
  assert.equal(ingredientNamesMatch("우동", "우동면"), true);
  assert.equal(ingredientNamesMatch("돈가스", "돈까스"), true);
  assert.equal(ingredientNamesMatch("밥", "햇반"), true);
  assert.equal(ingredientNamesMatch("치즈", "모짜렐라치즈"), true);
  assert.equal(ingredientNamesMatch("계란", "김치"), false);
  assert.equal(ingredientNamesMatch("우유", "요거트"), false);
});

test("combined spam and ham guidance distinguishes shelf-stable cans from refrigerated ham", () => {
  const item = findCatalogItem("spam");
  assert.ok(item);
  assert.match(item.details.storage, /제품.*포장 표시/);
  assert.match(item.details.storage, /상온 보관 캔/);
  assert.match(item.details.storage, /냉장 햄/);
  assert.ok(item.sourceRefs.includes("usda-shelf-stable"));
  assert.ok(item.sourceRefs.includes("unl-food-storage"));
  for (const recipe of item.recipes) {
    assert.match(stepText(recipe), /햄 포장/);
    assert.ok(recipe.sourceRefs.includes("unl-food-storage"));
  }
});

test("critical methods match the named dish instead of a broad cooking profile", () => {
  const yogurtSteps = stepText(recipeAt("yogurt", 0));
  assert.match(yogurtSteps, /차갑|냉장|섞|올려|담/);
  assert.doesNotMatch(yogurtSteps, /프라이팬|볶|굽|끓/);

  const frenchToast = recipeAt("milk", 1);
  const frenchToastSteps = stepText(frenchToast);
  assert.match(frenchToastSteps, /우유/);
  assert.match(frenchToastSteps, /계란/);
  assert.match(frenchToastSteps, /적시|적셔|담가|불리|묻혀/);
  assert.match(frenchToastSteps, /팬|굽|익/);

  const steamedEggs = recipeAt("milk", 2);
  const steamedEggSteps = stepText(steamedEggs);
  assert.match(steamedEggSteps, /찜|찐다|전자레인지|중탕|덮/);
  assert.doesNotMatch(steamedEggSteps, /뒤집어.*굽|부쳐.*굽/);

  const coldNoodle = recipes.find(({ recipe }) => /국수|소면/.test(recipe.name) && recipe.sourceRefs?.includes("maangchi-bibim-guksu"));
  assert.ok(coldNoodle, "a cold bibim noodle recipe must cite the noodle method source");
  const coldNoodleSteps = stepText(coldNoodle.recipe);
  assert.match(coldNoodleSteps, /찬물|헹구|물기/);
  assert.doesNotMatch(coldNoodleSteps, /국물.*팔팔|뜨거운 국물/);

  const potatoBake = recipeAt("potato", 2);
  const potatoSteps = stepText(potatoBake);
  assert.match(potatoSteps, /감자/);
  assert.match(potatoSteps, /전자레인지|오븐|에어프라이어|팬/);
  assert.doesNotMatch(potatoSteps, /빵이나 또띠아|식빵.*올/);
});
