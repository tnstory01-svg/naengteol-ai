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
import { SupabaseDatabase } from "./lib/supabase-db.js";
import { flattenCatalog, ingredientNamesMatch } from "./public/food-catalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const IS_DEPLOYED = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
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
const GUEST_COOKIE_NAME = "fi_guest";
const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DELIVERY_COST = 12000;
const DEFAULT_HOME_COOKING_COST = 3500;
const USER_ROLES = new Set(["user", "admin"]);
const USER_STATUSES = new Set(["active", "suspended"]);
const LEGACY_REDIRECTS = new Map([
  ["/index.html", "/"], ["/shopping.html", "/tools.html#shopping"], ["/notes.html", "/tools.html#notes"],
  ["/places.html", "/tools.html#places"], ["/tips.html", "/tools.html#tips"], ["/chatbot.html", "/tools.html#chatbot"],
  ["/login.html", "/me.html#login"], ["/register.html", "/me.html#register"]
]);

const db = SUPABASE_DB_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? new SupabaseDatabase({
      url: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      schema: SUPABASE_SCHEMA,
      maxRows: clampInt(process.env.SUPABASE_MAX_ROWS, 100, 50_000, 5000)
    })
  : new LocalDatabase(LOCAL_DB_PATH);
const rateLimitBuckets = new Map();
const ADMIN_OVERVIEW_CACHE_TTL_MS = clampInt(process.env.ADMIN_OVERVIEW_CACHE_TTL_SECONDS, 10, 30, 10) * 1000;
const adminOverviewCache = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

class HttpError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

let appReady;

export async function handleRequest(request, response) {
  const requestId = randomUUID();
  let requestPath = "/";
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    requestPath = url.pathname;

    if (url.pathname === "/health") {
      applyCors(request, response);
    }

    if (url.pathname.startsWith("/api/")) {
      applyCors(request, response);
      if (request.method === "OPTIONS") {
        handleCorsPreflight(request, response);
        return;
      }

      assertSafeRequestOrigin(request);
      await ensureAppReady();

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
    }

    if (request.method === "GET" && url.pathname === "/health") {
      await ensureAppReady();
      if (db.provider === "supabase") await db.checkHealth();
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

    if (request.method === "POST" && url.pathname === "/api/guest/session") {
      await handleGuestSession(request, response);
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

    if (request.method === "POST" && url.pathname === "/api/guest/merge") {
      await handleGuestMerge(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/menu-selections") {
      await handleMenuSelection(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/support/chat") {
      await handleSupportChat(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
      await handleAdminOverview(request, response, url);
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

    if (request.method === "GET" && url.pathname === "/api/shortcuts") { await handleShortcutList(request, response); return; }
    if (request.method === "POST" && url.pathname === "/api/shortcuts") { await handleShortcutCreate(request, response); return; }
    const shortcutMatch = url.pathname.match(/^\/api\/shortcuts\/([^/]+)$/);
    if (shortcutMatch && request.method === "DELETE") { await handleShortcutDelete(request, response, decodeURIComponent(shortcutMatch[1])); return; }

    if (request.method === "GET" && url.pathname === "/api/recommendations") {
      await handleRecommendationHistory(request, response, url);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recommend") {
      await handleRecommend(request, response);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (["GET", "HEAD"].includes(request.method || "")) {
      const destination = LEGACY_REDIRECTS.get(url.pathname);
      if (destination) {
        const [targetPath, fragment = ""] = destination.split("#");
        response.writeHead(308, { ...securityHeaders(), Location: `${targetPath}${url.search}${fragment ? `#${fragment}` : ""}` });
        response.end();
        return;
      }
      serveStatic(url.pathname, response, request.method);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    handleError(response, error, { requestId, path: requestPath });
  }
}

const server = http.createServer(handleRequest);

if (isMainModule()) {
  server.listen(PORT, HOST, () => {
    const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log(`자취생의 모든것 running at http://${displayHost}:${PORT}`);
  });
}

async function initializeApp() {
  if (IS_DEPLOYED && db.provider !== "supabase") {
    throw new HttpError(503, "서버 데이터베이스 설정이 필요합니다. 잠시 후 다시 이용해 주세요.", {
      code: "DATABASE_CONFIGURATION_REQUIRED", retryable: false
    });
  }
  await db.init();
  await ensureAdminAccount();
}

async function ensureAppReady() {
  if (!appReady) {
    appReady = initializeApp().catch((error) => {
      appReady = null;
      if (error instanceof HttpError || error.code === "DATABASE_UNAVAILABLE") throw error;
      throw new HttpError(503, "서버 데이터베이스를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.", {
        code: "DATABASE_INITIALIZATION_FAILED", retryable: true
      });
    });
  }
  await appReady;
}

function isMainModule() {
  return Boolean(process.argv[1] && path.resolve(process.argv[1]) === __filename);
}

async function handleGuestSession(request, response) {
  await db.cleanupExpiredGuestSessions();
  const existing = await resolveGuestSession(request);
  if (existing) {
    sendJson(response, 200, { csrfToken: existing.csrfToken, expiresAt: existing.expiresAt });
    return;
  }
  const token = createSessionToken();
  const now = new Date();
  const record = {
    id: randomUUID(), tokenHash: hashSessionToken(token), csrfToken: createCsrfToken(),
    createdAt: now.toISOString(), lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + GUEST_TTL_MS).toISOString(), revokedAt: null
  };
  const guest = await db.createGuestSession(record);
  sendJson(response, 200, { csrfToken: guest.csrfToken, expiresAt: guest.expiresAt }, { "Set-Cookie": serializeGuestCookie(token, request) });
}

async function resolveGuestSession(request) {
  const token = parseCookies(request.headers.cookie || "")[GUEST_COOKIE_NAME];
  if (!token || token.length < 30) return null;
  const tokenHash = hashSessionToken(token);
  const now = new Date().toISOString();
  return db.findGuestSessionByTokenHash(tokenHash, now);
}

function assertGuestCsrf(request, guest) {
  const token = request.headers["x-csrf-token"];
  if (!token || token !== guest.csrfToken) throw new HttpError(403, "게스트 보안 토큰이 만료되었거나 올바르지 않습니다.");
}

async function requireRequestOwner(request, { requireCsrf = true } = {}) {
  const auth = await resolveSession(request);
  if (auth) { if (requireCsrf) assertCsrf(request, auth.session); return { auth, guest: null, userId: auth.user.id, guestSessionId: null }; }
  const guest = await resolveGuestSession(request);
  if (!guest) throw new HttpError(401, "게스트 세션을 먼저 시작해 주세요.");
  if (requireCsrf) assertGuestCsrf(request, guest);
  return { auth: null, guest, userId: null, guestSessionId: guest.id };
}

async function handleGuestMerge(request, response) {
  const auth = await requireSession(request, { requireCsrf: true });
  const guest = await resolveGuestSession(request);
  if (!guest) throw new HttpError(404, "병합할 게스트 데이터가 없습니다.");
  const payload = asObject(await readJson(request, 8_000));
  const idempotencyKey = normalizeShortText(payload.idempotencyKey, 160);
  if (!idempotencyKey) throw new HttpError(400, "병합 요청 키가 필요합니다.");
  const merge = await db.mergeGuestIntoAccount({ guestSessionId: guest.id, userId: auth.user.id, idempotencyKey });
  const complete = ["completed", "succeeded"].includes(merge?.status);
  sendJson(response, 200, { merge }, complete ? { "Set-Cookie": clearGuestCookie(request) } : {});
}

async function handleMenuSelection(request, response) {
  const owner = await requireRequestOwner(request);
  const payload = asObject(await readJson(request, 12_000));
  const recommendationId = normalizeShortText(payload.recommendationId, 100);
  const recipeId = normalizeShortText(payload.recipeId, 160);
  const idempotencyKey = normalizeShortText(payload.idempotencyKey, 160);
  if (!recommendationId || !recipeId || !idempotencyKey) throw new HttpError(400, "추천, 레시피, 요청 키가 모두 필요합니다.");
  const findSelection = async (identity) => typeof db.findMenuSelection === "function"
    ? db.findMenuSelection({ userId: owner.userId, guestSessionId: owner.guestSessionId, ...identity })
    : db.get((data) => (data.menuSelections || []).find((row) => (owner.userId ? row.userId === owner.userId : row.guestSessionId === owner.guestSessionId) && (identity.idempotencyKey ? row.idempotencyKey === identity.idempotencyKey : row.recommendationId === identity.recommendationId)) || null);
  const replay = await findSelection({ idempotencyKey });
  if (replay) { sendJson(response, 200, { selectionId: replay.id, selection: { ...replay, outcome: "replayed" }, recipeSnapshot: replay.recipeSnapshot || replay.snapshot }); return; }
  const prior = await findSelection({ recommendationId });
  if (prior) throw new HttpError(409, "이미 선택한 추천입니다.", { selection: prior });
  const exposure = typeof db.getRecommendationExposure === "function"
    ? await db.getRecommendationExposure({ recommendationId, userId: owner.userId, guestSessionId: owner.guestSessionId })
    : await db.get((data) => data.recommendationLogs.find((row) => row.recommendationId === recommendationId && (owner.userId ? row.userId === owner.userId : row.guestSessionId === owner.guestSessionId)));
  const snapshot = exposure?.snapshot || exposure?.recommendation;
  const recipe = (snapshot?.recipes || []).find((item) => item.id === recipeId || item.recipeId === recipeId);
  if (!recipe) throw new HttpError(404, "선택할 수 있는 추천 메뉴를 찾지 못했습니다.");
  try {
    const selection = await db.recordMenuSelection({ userId: owner.userId, guestSessionId: owner.guestSessionId, recommendationId, recipeId, idempotencyKey, recipeSnapshot: recipe, snapshot: recipe, realizedSavings: recipe.estimatedSavings });
    if (selection.outcome === "conflict") throw new HttpError(409, "이미 선택한 추천입니다.", { selection });
    sendJson(response, selection.outcome === "replayed" ? 200 : 201, { selectionId: selection.id, selection, recipeSnapshot: selection.recipeSnapshot || selection.snapshot || recipe });
  } catch (error) {
    if (error.code === "DUPLICATE_SELECTION") throw new HttpError(409, "이미 선택한 추천입니다.", { selection: error.selection });
    throw error;
  }
}

async function handleRegister(request, response) {
  const payload = asObject(await readJson(request, 16_000));
  const guest = await resolveGuestSession(request);
  if (guest) assertGuestCsrf(request, guest);
  const guestMergeIdempotencyKey = guest ? normalizeShortText(payload.guestMergeIdempotencyKey, 160) : null;
  if (guest && !guestMergeIdempotencyKey) throw new HttpError(400, "게스트 병합 요청 키가 필요합니다.");
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
  const user = typeof db.insertUser === "function"
    ? await (async () => {
        if (await db.findUserByEmail(email)) {
          throw new HttpError(409, "이미 가입된 이메일입니다.");
        }
        try {
          return publicUser(await db.insertUser(record));
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new HttpError(409, "이미 가입된 이메일입니다.");
          }
          throw error;
        }
      })()
    : await db.mutate((data) => {
        if (data.users.some((item) => item.email === email)) {
          throw new HttpError(409, "이미 가입된 이메일입니다.");
        }

        data.users.push(record);
        return publicUser(record);
      });

  const session = await createUserSession(user, request);
  let merge = null;
  if (guest) {
    merge = await db.mergeGuestIntoAccount({ guestSessionId: guest.id, userId: user.id, idempotencyKey: guestMergeIdempotencyKey });
  }
  const mergeComplete = !guest || ["completed", "succeeded"].includes(merge?.status);
  const cookies = [session.cookie, ...(guest && mergeComplete ? [clearGuestCookie(request)] : [])];
  sendJson(response, 201, { authenticated: true, user, csrfToken: session.csrfToken, merge }, { "Set-Cookie": cookies });
}

async function handleLogin(request, response) {
  const payload = asObject(await readJson(request, 16_000));
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!validateEmail(email) || !password) {
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  const userRecord = typeof db.findUserByEmail === "function"
    ? await db.findUserByEmail(email)
    : await db.get((data) => data.users.find((item) => item.email === email));
  const validPassword = userRecord ? await verifyPassword(password, userRecord.passwordHash) : false;

  if (!validPassword) {
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  if (normalizeUserStatus(userRecord.status) !== "active") {
    throw new HttpError(403, "비활성화된 계정입니다. 관리자에게 문의해 주세요.");
  }

  const session = await createUserSession(userRecord, request);
  sendJson(
    response,
    200,
    {
      authenticated: true,
      user: publicUser(userRecord),
      csrfToken: session.csrfToken
    },
    { "Set-Cookie": session.cookie }
  );
}

async function handleLogout(request, response) {
  const auth = await resolveSession(request);

  if (auth) {
    assertCsrf(request, auth.session);
    if (typeof db.deleteSessionByTokenHash === "function") {
      await db.deleteSessionByTokenHash(auth.session.tokenHash);
    } else {
      await db.mutate((data) => {
        data.sessions = data.sessions.filter((session) => session.tokenHash !== auth.session.tokenHash);
      });
    }
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

  const result = await createSupportReply(message, payload.history);
  sendJson(response, 200, result);
}

async function handleAdminOverview(request, response, url) {
  const auth = await requireAdmin(request);
  const userPage = clampInt(url.searchParams.get("userPage"), 1, 100_000, 1);
  const userPageSize = clampInt(url.searchParams.get("userPageSize"), 5, 100, 25);
  const ipBlockPage = clampInt(url.searchParams.get("ipBlockPage"), 1, 100_000, 1);
  const ipBlockPageSize = clampInt(url.searchParams.get("ipBlockPageSize"), 5, 100, 50);
  const cacheKey = [auth.user.id, userPage, userPageSize, ipBlockPage, ipBlockPageSize].join(":");
  const cachedOverview = adminOverviewCache.get(cacheKey);
  if (cachedOverview && cachedOverview.expiresAt > Date.now()) {
    sendJson(response, 200, cachedOverview.value, { "X-Admin-Overview-Cache": "hit" });
    return;
  }

  const overview = typeof db.getAdminOverviewSnapshot === "function"
    ? await (async () => {
        const snapshot = await db.getAdminOverviewSnapshot({
          userPage,
          userPageSize,
          ipBlockPage,
          ipBlockPageSize,
          nowIso: new Date().toISOString()
        });
        return buildAdminOverview(snapshot.data, auth.user.id, {
          stats: snapshot.stats,
          pagination: snapshot.pagination
        });
      })()
    : await db.get((data) => buildAdminOverview(data, auth.user.id));
  adminOverviewCache.set(cacheKey, {
    value: overview,
    expiresAt: Date.now() + ADMIN_OVERVIEW_CACHE_TTL_MS
  });
  sendJson(response, 200, overview, { "X-Admin-Overview-Cache": "miss" });
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

  const user = typeof db.updateUserAccount === "function"
    ? await updateAdminUserDirect({ auth, userId, requestedRole, requestedStatus, now })
    : await db.mutate((data) => {
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

  clearAdminOverviewCache();
  sendJson(response, 200, { user });
}

async function handleAdminUserIpBlock(request, response, userId) {
  const auth = await requireAdmin(request, { requireCsrf: true });
  const payload = asObject(await readJson(request, 16_000));
  const reason = normalizeShortText(payload.reason, 180) || "Suspicious activity";
  const currentAdminIpHash = hashClientAddress(getClientIp(request));
  const now = new Date().toISOString();

  const result = typeof db.insertIpBlocks === "function"
    ? await blockAdminUserIpDirect({ auth, userId, reason, currentAdminIpHash, now })
    : await db.mutate((data) => {
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

  clearAdminOverviewCache();
  sendJson(response, 200, result);
}

async function handleAdminIpUnblock(request, response, blockId) {
  await requireAdmin(request, { requireCsrf: true });
  const block = typeof db.deleteIpBlockById === "function"
    ? await (async () => {
        const removed = await db.deleteIpBlockById(blockId);
        if (!removed) {
          throw new HttpError(404, "IP block not found.");
        }
        return buildPublicIpBlock(removed, {});
      })()
    : await db.mutate((data) => {
        data.ipBlocks = Array.isArray(data.ipBlocks) ? data.ipBlocks : [];
        const index = data.ipBlocks.findIndex((item) => item.id === blockId);
        if (index === -1) {
          throw new HttpError(404, "IP block not found.");
        }

        const [removed] = data.ipBlocks.splice(index, 1);
        return buildPublicIpBlock(removed, data);
      });

  clearAdminOverviewCache();
  sendJson(response, 200, { ok: true, block });
}

async function updateAdminUserDirect({ auth, userId, requestedRole, requestedStatus, now }) {
  const record = await db.findUserById(userId);
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

  if (currentRole === "admin" && nextRole !== "admin" && (await db.countUsers({ role: "admin" })) <= 1) {
    throw new HttpError(400, "At least one admin account must remain.");
  }

  if (
    currentRole === "admin" &&
    currentStatus === "active" &&
    nextStatus !== "active" &&
    (await db.countUsers({ role: "admin", status: "active" })) <= 1
  ) {
    throw new HttpError(400, "At least one active admin account must remain.");
  }

  const updated = await db.updateUserAccount(record.id, {
    role: nextRole,
    status: nextStatus,
    permissions: asObject(record.permissions),
    updatedAt: now
  });
  if (!updated) {
    throw new HttpError(404, "User not found.");
  }

  if (nextStatus !== "active") {
    await db.deleteSessionsByUserId(record.id);
  }

  return buildAdminUser(updated, { users: [updated], sessions: [], ipBlocks: [], pantryItems: [], recommendationLogs: [], savingsLogs: [] });
}

async function blockAdminUserIpDirect({ auth, userId, reason, currentAdminIpHash, now }) {
  const target = await db.findUserById(userId);
  if (!target) {
    throw new HttpError(404, "User not found.");
  }

  if (isAdminUser(target)) {
    throw new HttpError(400, "Admin account IPs cannot be blocked from this action.");
  }

  const sessions = await db.listSessionsByUserId(target.id);
  const targetIpHashes = uniqueValues(sessions.map((session) => session.ipHash).filter(Boolean));
  const ipHashesToBlock = targetIpHashes.filter((ipHash) => ipHash !== currentAdminIpHash);

  if (ipHashesToBlock.length === 0) {
    throw new HttpError(400, "No blockable session IP was found for this user.");
  }

  const existingBlocks = await db.findIpBlocksByHashes(ipHashesToBlock);
  const existingIpHashes = new Set(existingBlocks.map((block) => block.ipHash));
  const blocksToCreate = ipHashesToBlock
    .filter((ipHash) => !existingIpHashes.has(ipHash))
    .map((ipHash) => ({
      id: randomUUID(),
      ipHash,
      reason,
      userId: target.id,
      createdByUserId: auth.user.id,
      createdAt: now
    }));
  const createdBlocks = await db.insertIpBlocks(blocksToCreate);
  await db.deleteSessionsByUserId(target.id);

  return {
    blockedCount: createdBlocks.length,
    alreadyBlockedCount: ipHashesToBlock.length - createdBlocks.length,
    skippedCurrentAdminIp: targetIpHashes.length !== ipHashesToBlock.length,
    blocks: createdBlocks.map((block) => buildPublicIpBlock(block, { users: [target, auth.user] }))
  };
}

function clearAdminOverviewCache() {
  adminOverviewCache.clear();
}

async function handlePantryList(request, response) {
  const owner = await requireRequestOwner(request, { requireCsrf: false });
  const items = await db.listPantryItems(owner);
  sendJson(response, 200, { items });
}

async function handlePantryCreate(request, response) {
  const owner = await requireRequestOwner(request);
  const payload = asObject(await readJson(request, 16_000));
  const itemInput = normalizePantryInput(payload, { partial: false });
  const existing = await db.listPantryItems(owner);
  if (!owner.userId && existing.length >= 100) throw new HttpError(429, "게스트 재료는 최대 100개까지 저장할 수 있습니다.");
  const now = new Date().toISOString(); const id = randomUUID();
  const record = { id, stableId: normalizeShortText(payload.stableId, 100) || id, ownerId: owner.userId || owner.guestSessionId, userId: owner.userId, guestSessionId: owner.guestSessionId, ...itemInput, createdAt: now, updatedAt: now };
  const item = await db.insertPantryItem(record);
  sendJson(response, 201, { item });
}

async function handlePantryUpdate(request, response, itemId) {
  const owner = await requireRequestOwner(request);
  const payload = asObject(await readJson(request, 16_000));
  const itemInput = normalizePantryInput(payload, { partial: true });
  const item = await db.updateOwnedPantryItem(owner, itemId, {
    ...itemInput, updatedAt: new Date().toISOString()
  });
  if (!item) throw new HttpError(404, "재료를 찾을 수 없습니다.");
  sendJson(response, 200, { item });
}

async function handlePantryDelete(request, response, itemId) {
  const owner = await requireRequestOwner(request);
  const deleted = await db.deleteOwnedPantryItem(owner, itemId);
  if (!deleted) throw new HttpError(404, "재료를 찾을 수 없습니다.");
  sendJson(response, 200, { ok: true });
}

async function handleShortcutList(request, response) {
  const owner = await requireRequestOwner(request, { requireCsrf: false });
  const shortcuts = await db.listShortcuts(owner);
  sendJson(response, 200, { shortcuts });
}

async function handleShortcutCreate(request, response) {
  const owner = await requireRequestOwner(request);
  const payload = asObject(await readJson(request, 8_000));
  const shortcutId = normalizeShortText(payload.shortcutId, 100) || randomUUID();
  const shortcutSnapshot = asObject(payload.shortcutSnapshot);
  if (!Object.keys(shortcutSnapshot).length) throw new HttpError(400, "바로가기 정보가 필요합니다.");
  const existing = await db.listShortcuts(owner);
  if (!owner.userId && existing.length >= 50) throw new HttpError(429, "게스트 바로가기는 최대 50개까지 저장할 수 있습니다.");
  const now = new Date().toISOString();
  const shortcut = await db.recordShortcut({ ...owner, shortcutId, shortcutSnapshot, createdAt: now, updatedAt: now });
  sendJson(response, 201, { shortcut });
}

async function handleShortcutDelete(request, response, shortcutId) {
  const owner = await requireRequestOwner(request);
  const deleted = await db.deleteShortcut({ ...owner, shortcutId });
  if (!deleted) throw new HttpError(404, "바로가기를 찾을 수 없습니다.");
  sendJson(response, 200, { ok: true });
}

async function handleRecommendationHistory(request, response, url) {
  const auth = await requireSession(request);
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);
  const selections = await db.listMenuSelections({ userId: auth.user.id, limit });
  const totalSavings = await db.getRealizedSavingsTotal({ userId: auth.user.id });
  sendJson(response, 200, { logs: selections, selections, totalSavings, legacySavingsExcluded: true });
}

async function handleRecommend(request, response) {
  const owner = await requireRequestOwner(request);
  const payload = asObject(await readJson(request));
  const ingredients = normalizeIngredients(payload.ingredients, payload.ingredientsText);
  const preferences = normalizePreferences(payload.preferences);
  const pantryItems = await db.listPantryItems(owner);
  const ingredientCheck = buildIngredientCheck({ inputIngredients: ingredients, pantryItems });
  const recommendationIngredients = ingredientCheck.recommendationIngredients;
  if (recommendationIngredients.length === 0) throw new HttpError(400, "재료를 한 가지 이상 입력해 주세요.");

  let source = "fallback";
  let recommendation = null;
  let warning = null;
  try {
    recommendation = await createAiRecommendation({ ingredients: recommendationIngredients, preferences, anonymousId: owner.userId ? `user-${owner.userId}` : `guest-${owner.guestSessionId}`, ingredientCheck });
    if (recommendation && isCompleteRecommendation(recommendation)) source = "groq";
    else if (recommendation) {
      warning = "AI 추천 형식이 완전하지 않아 검토된 기본 레시피를 사용했습니다.";
      recommendation = null;
    }
  } catch (error) {
    warning = error.message;
    console.warn("Groq recommendation failed. Using fallback.", error.message);
  }
  if (!recommendation) recommendation = createFallbackRecommendation(recommendationIngredients, preferences, ingredientCheck);
  const recommendationId = randomUUID();
  const normalizedBase = normalizeRecommendation(recommendation, recommendationIngredients, ingredientCheck, preferences, source);
  const normalized = { ...normalizedBase, recipes: normalizedBase.recipes.map((recipe) => ({ ...recipe, id: randomUUID() })), ingredientCheck };
  const exposure = await db.recordRecommendationExposure({ userId: owner.userId, guestSessionId: owner.guestSessionId, recommendationId, inputIngredients: recommendationIngredients, preferences, snapshot: normalized, recommendation: normalized, source, createdAt: new Date().toISOString() });
  sendJson(response, 200, { recommendationId, ...normalized, meta: { source, warning, ingredientCheck, logging: { stored: Boolean(exposure) } } });
}

function buildIngredientCheck({ inputIngredients, pantryItems }) {
  const submittedIngredients = uniqueValues(inputIngredients || []).slice(0, 15);
  const databaseIngredients = (Array.isArray(pantryItems) ? pantryItems : []).map((item) => ({ name: normalizeShortText(item.name, 80), quantity: normalizeShortText(item.quantity, 40), expiresAt: item.expiresAt || "" })).filter((item) => item.name);
  const verifiedMatches = [];
  const unverifiedInputIngredients = [];
  for (const ingredient of submittedIngredients) {
    const match = databaseIngredients.find((item) => ingredientNamesMatch(item.name, ingredient));
    if (match) verifiedMatches.push({ input: ingredient, name: match.name, quantity: match.quantity, expiresAt: match.expiresAt });
    else unverifiedInputIngredients.push(ingredient);
  }
  const databaseOnlyIngredients = databaseIngredients.filter((item) => !submittedIngredients.some((ingredient) => ingredientNamesMatch(item.name, ingredient)));
  const verifiedIngredients = uniqueValues(verifiedMatches.map((item) => item.name));
  const recommendationIngredients = uniqueValues([...verifiedIngredients, ...unverifiedInputIngredients, ...databaseOnlyIngredients.map((item) => item.name)]).slice(0, 20);
  return { databaseChecked: databaseIngredients.length > 0, submittedIngredients, databaseIngredients, verifiedIngredients, verifiedMatches, unverifiedInputIngredients, databaseOnlyIngredients, recommendationIngredients, summary: databaseIngredients.length ? `DB 확인 ${verifiedIngredients.length}개, 입력만 ${unverifiedInputIngredients.length}개, DB 추가 ${databaseOnlyIngredients.length}개` : `입력 재료 ${submittedIngredients.length}개 기준` };
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
          databaseIngredients: ingredientCheck.databaseIngredients?.slice(0, 20),
          verifiedIngredients: ingredientCheck.verifiedIngredients,
          unverifiedInputIngredients: ingredientCheck.unverifiedInputIngredients,
          databaseOnlyIngredients: ingredientCheck.databaseOnlyIngredients?.slice(0, 20),
          preferences,
          requiredLanguage: "ko-KR",
          outputShape: {
            recipes: [
              {
                name: "string",
                reason: "string",
                ownedIngredients: ["string"],
                inputIngredients: ["string"],
                missingIngredients: ["string"],
                requiredIngredients: [{ name: "string", amount: "string" }],
                optionalIngredients: [{ name: "string", amount: "string" }],
                equipment: ["string"],
                cookTimeMinutes: "number",
                difficulty: "easy | medium | hard",
                steps: ["string"],
                doneness: "string",
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
            "List every ingredient needed for the dish in requiredIngredients with a practical one-serving amount.",
            "ownedIngredients may contain only ingredients present in databaseIngredients. Put submitted-only matches in inputIngredients.",
            "Do not reduce cookTimeMinutes to fit the preference; recommend another dish or report the honest time.",
            "Give ordered heat/time/doneness steps and name the required equipment.",
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

async function ensureAdminAccount() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!email && !password) {
    return;
  }

  if (!validateEmail(email)) {
    throw new HttpError(503, "관리자 초기 계정 설정을 확인해 주세요.", {
      code: "ADMIN_CONFIGURATION_INVALID", fields: ["ADMIN_EMAIL"], retryable: false
    });
  }

  const passwordFailures = validatePassword(password);
  if (passwordFailures.length) {
    throw new HttpError(503, "관리자 초기 계정 설정을 확인해 주세요.", {
      code: "ADMIN_CONFIGURATION_INVALID", fields: ["ADMIN_PASSWORD"], retryable: false
    });
  }

  const displayName = normalizeDisplayName(process.env.ADMIN_DISPLAY_NAME || "Admin", email);
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
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

  if (typeof db.ensureAdminUser === "function") {
    await db.ensureAdminUser(record);
    return;
  }

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

  const record = {
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    csrfToken,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt,
    userAgent: String(request.headers["user-agent"] || "").slice(0, 240),
    ipHash: hashClientAddress(getClientIp(request))
  };

  if (typeof db.createSession === "function") {
    await db.createSession(record, now.toISOString());
  } else {
    await db.mutate((data) => {
      const currentTime = Date.now();
      data.sessions = data.sessions.filter((session) => new Date(session.expiresAt).getTime() > currentTime);
      data.sessions.push(record);
    });
  }

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
  if (typeof db.findActiveSessionAuth === "function") {
    return db.findActiveSessionAuth(tokenHash, new Date().toISOString());
  }

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
  if (typeof db.findIpBlockByHash === "function") {
    return db.findIpBlockByHash(ipHash);
  }

  return db.get((data) => {
    const ipBlocks = Array.isArray(data.ipBlocks) ? data.ipBlocks : [];
    return ipBlocks.find((block) => block.ipHash === ipHash) || null;
  });
}

function createFallbackRecommendation(ingredients, preferences, ingredientCheck = {}) {
  const pantryNames = (ingredientCheck.databaseIngredients || []).map((item) => item.name);
  const submittedNames = ingredientCheck.submittedIngredients || ingredients;
  const availableNames = [...pantryNames, ...submittedNames];
  const maxCookTime = preferences.maxCookTimeMinutes || 20;
  const candidates = flattenCatalog().flatMap((item) => item.recipes).map((recipe) => {
    const required = normalizeIngredientEntries(recipe.requiredIngredients);
    const matched = required.filter((entry) => availableNames.some((name) => ingredientNamesMatch(name, entry.name))).length;
    const missing = required.length - matched;
    const withinPreference = recipe.cookTimeMinutes <= maxCookTime;
    return { recipe, score: matched * 8 - missing * 4, withinPreference };
  });
  const rank = (left, right) => right.score - left.score || left.recipe.cookTimeMinutes - right.recipe.cookTimeMinutes;
  const rankedCandidates = [
    ...candidates.filter((candidate) => candidate.withinPreference).sort(rank),
    ...candidates.filter((candidate) => !candidate.withinPreference).sort(rank)
  ];

  const recipes = [];
  for (const candidate of rankedCandidates) {
    if (recipes.some((recipe) => recipe.name === candidate.recipe.name)) continue;
    const recipe = candidate.recipe;
    const required = normalizeIngredientEntries(recipe.requiredIngredients);
    const ownedIngredients = required.filter((entry) => pantryNames.some((name) => ingredientNamesMatch(name, entry.name))).map((entry) => entry.name);
    const inputIngredients = required.filter((entry) => submittedNames.some((name) => ingredientNamesMatch(name, entry.name)) && !pantryNames.some((name) => ingredientNamesMatch(name, entry.name))).map((entry) => entry.name);
    const missingIngredients = required.filter((entry) => !availableNames.some((name) => ingredientNamesMatch(name, entry.name))).map((entry) => entry.name);
    recipes.push({
      ...recipe,
      reason: `${recipe.reason} 필수 재료 ${required.length}개 중 현재 입력과 DB에서 ${required.length - missingIngredients.length}개를 확인했습니다.`,
      ownedIngredients,
      inputIngredients,
      missingIngredients,
      estimatedDeliveryCost: DEFAULT_DELIVERY_COST,
      estimatedHomeCookingCost: DEFAULT_HOME_COOKING_COST,
      estimatedSavings: DEFAULT_DELIVERY_COST - DEFAULT_HOME_COOKING_COST,
      savingsDifference: DEFAULT_DELIVERY_COST - DEFAULT_HOME_COOKING_COST,
      costEstimateNote: "가격은 1인분 예시이며 실제 구매가·사용량·배달비에 따라 달라집니다."
    });
    if (recipes.length === 3) break;
  }

  const priorityIngredients = ingredients
    .filter((item) => ["두부", "콩나물", "버섯", "상추", "시금치", "대파", "파"].includes(item))
    .slice(0, 3);

  return {
    recipes,
    priorityIngredients: priorityIngredients.length ? priorityIngredients : ingredients.slice(0, 2),
    summary: recipes.some((recipe) => recipe.cookTimeMinutes > maxCookTime)
      ? `요청 시간 ${maxCookTime}분 안의 후보가 부족해 실제 조리 시간이 더 긴 메뉴도 표시했습니다.`
      : `요청 시간 ${maxCookTime}분 안에서 입력 재료와 겹치는 순서로 메뉴를 골랐습니다.`
  };
}

function normalizeRecommendation(recommendation, ingredients, ingredientCheck = {}, preferences = {}, sourceKind = "fallback") {
  const source = recommendation && typeof recommendation === "object" ? recommendation : {};
  const fallback = createFallbackRecommendation(ingredients, preferences, ingredientCheck);
  const recipes = Array.isArray(source.recipes) ? source.recipes : [];
  const normalizedRecipes = recipes.slice(0, 3).map((recipe, index) => {
    const fallbackRecipe = fallback.recipes[index] || fallback.recipes[0];
    const usesFallback = !isCompleteStructuredRecipe(recipe);
    const baseRecipe = usesFallback ? fallbackRecipe : recipe;
    const hasTrustedCatalogProvenance = sourceKind === "fallback" || usesFallback;
    const estimatedDeliveryCost = clampInt(baseRecipe.estimatedDeliveryCost, 8000, 30_000, DEFAULT_DELIVERY_COST);
    const rawSavings = clampInt(
      baseRecipe.estimatedSavings,
      0,
      estimatedDeliveryCost,
      fallbackRecipe.estimatedSavings
    );
    const estimatedHomeCookingCost = clampInt(
      baseRecipe.estimatedHomeCookingCost,
      0,
      estimatedDeliveryCost,
      Math.max(0, estimatedDeliveryCost - rawSavings)
    );
    const savingsDifference = Math.max(0, estimatedDeliveryCost - estimatedHomeCookingCost);

    const requiredIngredients = normalizeIngredientEntries(baseRecipe.requiredIngredients).slice(0, 16);
    const optionalIngredients = normalizeIngredientEntries(baseRecipe.optionalIngredients).slice(0, 8);
    const pantryNames = (ingredientCheck.databaseIngredients || []).map((item) => item.name);
    const submittedNames = ingredientCheck.submittedIngredients || ingredients;
    const availableNames = [...pantryNames, ...submittedNames];
    const ownedIngredients = requiredIngredients.filter((entry) => pantryNames.some((name) => ingredientNamesMatch(name, entry.name))).map((entry) => entry.name);
    const inputIngredients = requiredIngredients.filter((entry) => submittedNames.some((name) => ingredientNamesMatch(name, entry.name)) && !pantryNames.some((name) => ingredientNamesMatch(name, entry.name))).map((entry) => entry.name);
    const missingIngredients = requiredIngredients.filter((entry) => !availableNames.some((name) => ingredientNamesMatch(name, entry.name))).map((entry) => entry.name);
    return {
      name: asString(baseRecipe.name, fallbackRecipe.name),
      reason: asString(baseRecipe.reason, fallbackRecipe.reason),
      ownedIngredients,
      inputIngredients,
      missingIngredients,
      requiredIngredients,
      optionalIngredients,
      equipment: asStringArray(baseRecipe.equipment, []).slice(0, 8),
      cookTimeMinutes: clampInt(baseRecipe.cookTimeMinutes, 5, 60, fallbackRecipe.cookTimeMinutes),
      difficulty: ["easy", "medium", "hard"].includes(baseRecipe.difficulty) ? baseRecipe.difficulty : "easy",
      steps: asStringArray(baseRecipe.steps, []).slice(0, 12),
      doneness: asString(baseRecipe.doneness, "완성 상태를 단계 설명과 제품 표시에서 확인하세요."),
      sourceRefs: hasTrustedCatalogProvenance ? asStringArray(baseRecipe.sourceRefs, []).slice(0, 8) : [],
      reviewedAt: hasTrustedCatalogProvenance ? asString(baseRecipe.reviewedAt, "") : "",
      adaptationNote: hasTrustedCatalogProvenance ? asString(baseRecipe.adaptationNote, "") : "AI가 입력 재료를 바탕으로 생성한 조리안입니다.",
      sourceScope: hasTrustedCatalogProvenance ? asString(baseRecipe.sourceScope, "") : "별도 요리 출처로 검증되지 않은 생성 결과입니다. 제품 표시와 안전한 익힘 상태를 우선하세요.",
      estimateNote: hasTrustedCatalogProvenance ? asString(baseRecipe.estimateNote, "") : "분량과 시간은 생성된 1인분 예상값이며 실제 조리로 검증한 표준값이 아닙니다.",
      costEstimateNote: asString(baseRecipe.costEstimateNote, "가격은 1인분 예시이며 실제 구매가·사용량·배달비에 따라 달라집니다."),
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

function isCompleteStructuredRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") return false;
  const normalizedRequired = normalizeIngredientEntries(recipe.requiredIngredients);
  return Boolean(
    normalizeShortText(recipe.name, 120) &&
    Array.isArray(recipe.requiredIngredients) && recipe.requiredIngredients.length > 0 &&
    normalizedRequired.length === recipe.requiredIngredients.length &&
    normalizedRequired.every((entry) => entry.name && entry.amount) &&
    Array.isArray(recipe.equipment) && recipe.equipment.length > 0 &&
    Array.isArray(recipe.steps) && recipe.steps.length >= 3 &&
    normalizeShortText(recipe.doneness, 300) &&
    Number.isFinite(Number(recipe.cookTimeMinutes))
  );
}

function isCompleteRecommendation(recommendation) {
  return recommendation && Array.isArray(recommendation.recipes) && recommendation.recipes.length === 3 && recommendation.recipes.every(isCompleteStructuredRecipe);
}

function normalizeIngredientEntries(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return (Array.isArray(source) ? source : []).map((entry) => {
    if (typeof entry === "string") return { name: normalizeShortText(entry, 80), amount: "" };
    const item = asObject(entry);
    return { name: normalizeShortText(item.name, 80), amount: normalizeShortText(item.amount, 80) };
  }).filter((entry) => entry.name);
}

function serveStatic(pathname, response, method = "GET") {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const requestedPath = path.resolve(PUBLIC_DIR, `.${safePath}`);
  const relativePath = path.relative(PUBLIC_DIR, requestedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !existsSync(requestedPath)) {
    const body = "<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>페이지 안내</title><link rel=\"stylesheet\" href=\"/styles.css\"><main class=\"app-shell hub-shell\"><h1>페이지가 이동했습니다</h1><p>원하는 영역을 선택해 계속 이용하세요.</p><nav class=\"app-nav\"><a class=\"nav-link\" href=\"/\">냉장고 털기</a><a class=\"nav-link\" href=\"/tools.html\">생활도구</a><a class=\"nav-link\" href=\"/me.html\">내 정보</a></nav></main></html>";
    response.writeHead(404, { ...securityHeaders(), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(method === "HEAD" ? undefined : body);
    return;
  }

  const extension = path.extname(requestedPath);
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" || safePath === "/sw.js" ? "no-cache" : "public, max-age=300"
  });
  if (method === "HEAD") response.end();
  else createReadStream(requestedPath).pipe(response);
}

async function readJson(request, maxBytes = 64_000) {
  if (Number(request.headers["content-length"]) > maxBytes) {
    throw new HttpError(413, "요청 본문이 너무 큽니다.");
  }

  // Vercel consumes the stream before invoking /api handlers and exposes a body getter.
  let parsedBody;
  try { parsedBody = request.body; }
  catch { throw new HttpError(400, "JSON 요청 형식이 올바르지 않습니다."); }
  if (parsedBody !== undefined) {
    const text = Buffer.isBuffer(parsedBody) ? parsedBody.toString("utf8")
      : typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new HttpError(413, "요청 본문이 너무 큽니다.");
    try { return text.trim() ? JSON.parse(text) : {}; }
    catch { throw new HttpError(400, "JSON 요청 형식이 올바르지 않습니다."); }
  }
  if (request.readableEnded) return {};

  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;

    request.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        reject(new HttpError(413, "요청 본문이 너무 큽니다."));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });

    request.on("end", () => {
      if (bytes > maxBytes) return;
      const body = Buffer.concat(chunks).toString("utf8");
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

function handleError(response, error, context) {
  if (error.code === "DATABASE_UNAVAILABLE") {
    error = new HttpError(503, "서버 데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", {
      code: error.code, retryable: error.retryable, upstreamStatus: error.upstreamStatus
    });
  }
  if (error instanceof HttpError) {
    const diagnostic = error.statusCode >= 500 ? { ...context, ...error.details } : error.details;
    if (error.statusCode >= 500) console.error(JSON.stringify({ ...diagnostic, status: error.statusCode }));
    sendJson(response, error.statusCode, {
      error: error.message,
      details: diagnostic
    });
    return;
  }

  console.error(JSON.stringify({ ...context, code: "INTERNAL_ERROR", status: 500 }));
  sendJson(response, 500, {
    error: "Unexpected server error",
    details: { ...context, code: "INTERNAL_ERROR", retryable: false },
    detail: IS_DEPLOYED ? undefined : error.message
  });
}

function assertSafeRequestOrigin(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")) {
    return;
  }

  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  const origin = request.headers.origin;
  const configuredFrontendOrigin = getConfiguredFrontendOrigin();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite) && origin !== configuredFrontendOrigin) {
    throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
  }

  if (!origin) {
    return;
  }

  const allowedOrigins = new Set();
  const requestOrigin = getRequestOrigin(request);
  if (requestOrigin) allowedOrigins.add(requestOrigin);
  if (configuredFrontendOrigin) {
    allowedOrigins.add(configuredFrontendOrigin);
  }

  if (!allowedOrigins.has(origin)) {
    throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
  }
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  if (isSameRequestOrigin(request, origin)) {
    return;
  }

  const configuredFrontendOrigin = getConfiguredFrontendOrigin();
  if (!configuredFrontendOrigin || origin !== configuredFrontendOrigin) {
    throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
  }

  response.setHeader("Access-Control-Allow-Origin", configuredFrontendOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
}

function isSameRequestOrigin(request, origin) {
  return origin === getRequestOrigin(request);
}

function getRequestOrigin(request) {
  const host = request.headers.host;
  if (!host) {
    return "";
  }
  const secure = request.socket?.encrypted || request.headers["x-forwarded-proto"] === "https";
  return `${secure ? "https" : "http"}://${host}`;
}

function handleCorsPreflight(request, response) {
  const requestedMethod = String(request.headers["access-control-request-method"] || "").toUpperCase();
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  if (!allowedMethods.includes(requestedMethod)) {
    throw new HttpError(403, "허용되지 않은 CORS 요청 방식입니다.");
  }

  const requestedHeaders = String(request.headers["access-control-request-headers"] || "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const allowedHeaders = new Set(["content-type", "x-csrf-token"]);
  if (requestedHeaders.some((header) => !allowedHeaders.has(header))) {
    throw new HttpError(403, "허용되지 않은 CORS 요청 헤더입니다.");
  }

  response.writeHead(204, {
    ...securityHeaders(),
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": [...allowedHeaders].join(", "),
    "Access-Control-Max-Age": "600"
  });
  response.end();
}

function getConfiguredFrontendOrigin() {
  const configured = String(process.env.FRONTEND_ORIGIN || "").trim();
  if (!configured) {
    return "";
  }
  if (configured === "*") {
    throw new Error("FRONTEND_ORIGIN must be an exact origin, not a wildcard.");
  }

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("FRONTEND_ORIGIN must be a valid absolute origin.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("FRONTEND_ORIGIN must contain only an http(s) scheme and host.");
  }
  return url.origin;
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
    `SameSite=${secure ? "None" : "Lax"}`,
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
    `SameSite=${secure ? "None" : "Lax"}`,
    "Path=/",
    "Max-Age=0",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function serializeGuestCookie(token, request) {
  const secure = isSecureCookieRequired(request);
  return [`${GUEST_COOKIE_NAME}=${encodeURIComponent(token)}`, "HttpOnly", `SameSite=${secure ? "None" : "Lax"}`, "Path=/", `Max-Age=${Math.floor(GUEST_TTL_MS / 1000)}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

function clearGuestCookie(request) {
  const secure = isSecureCookieRequired(request);
  return [`${GUEST_COOKIE_NAME}=`, "HttpOnly", `SameSite=${secure ? "None" : "Lax"}`, "Path=/", "Max-Age=0", secure ? "Secure" : ""].filter(Boolean).join("; ");
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

async function createSupportReply(message, history = []) {
  const suggestions = ["장바구니 사용법", "메모 사용법", "냉장고 털기 사용법"];
  const reply = (intent, answer) => ({ intent, answer, suggestions, links: [] });
  const faq = [
    ["shopping", /장바구니/, "생활도구의 장바구니에서 살 물건을 추가할 수 있어요."],
    ["notes", /메모/, "생활도구의 생활 메모에서 제목과 내용을 저장하세요."],
    ["fridge-clear", /냉장고\s*털기|냉털/, "냉장고 털기에 가진 재료를 입력하면 메뉴를 추천해요."],
    ["login", /로그인|회원가입/, "내 정보 탭에서 로그인하거나 회원가입할 수 있어요."]
  ];
  if (message.length <= 40 && /방법|사용법|어디|어떻게\s*(쓰|사용|하)|뭔가요/.test(message)) {
    const match = faq.find(([, pattern]) => pattern.test(message));
    if (match) return reply(match[0], match[2]);
  }

  const fallback = reply("fallback", "지금은 AI 상담에 연결할 수 없어요. 앱 사용법은 바로 안내해 드릴게요.");
  const { GROQ_API_KEY: key, GROQ_MODEL: model, GROQ_API_BASE_URL } = process.env;
  if (!key || !model) return fallback;

  const recent = (Array.isArray(history) ? history : [])
    .filter(m => ["user", "assistant"].includes(m?.role) && typeof m.content === "string")
    .map(m => ({ role: m.role, content: normalizeShortText(m.content, 500) }))
    .filter(m => m.content)
    .slice(-6);

  try {
    const base = trimTrailingSlash(GROQ_API_BASE_URL || "https://api.groq.com/openai/v1");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages: [
          { role: "system", content: "냉털 앱 상담원으로서 자취·요리 질문에 한국어로 간결히 답하세요. 확인할 수 없는 정보는 명시하세요." },
          ...recent,
          { role: "user", content: message }
        ]
      })
    });
    if (!response.ok) return fallback;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const answer = typeof content === "string" && stripAiReasoning(content);
    return answer ? reply("ai", answer.slice(0, 1200)) : fallback;
  } catch {
    return fallback;
  }
}

function buildAdminOverview(data, currentUserId, options = {}) {
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
    stats: options.stats || {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.status === "active").length,
      suspendedUsers: users.filter((user) => user.status === "suspended").length,
      adminUsers: users.filter((user) => user.role === "admin").length,
      activeSessions: activeSessions.length,
      blockedIps: ipBlocks.length
    },
    pagination: options.pagination || null,
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
  const savingsTotal = (Array.isArray(data.menuSelections) ? data.menuSelections : [])
    .filter((selection) => selection.userId === user.id)
    .reduce((sum, selection) => sum + Number(selection.realizedSavings || selection.estimatedSavings || 0), 0);

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
  const users = Array.isArray(data.ipBlockUsers) ? data.ipBlockUsers : Array.isArray(data.users) ? data.users : [];
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

function isUniqueConstraintError(error) {
  return error?.databaseCode === "23505" || /23505|duplicate|unique/i.test(String(error?.message || ""));
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
