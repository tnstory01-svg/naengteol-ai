import {
  FOOD_CATALOG as CATEGORY_DATA,
  FOOD_CATALOG_SOURCES,
  OPTIONAL_INGREDIENT_NOTE,
  ingredientNamesMatch
} from "./food-catalog.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => {
    console.error("Service worker registration failed.", error);
  });
}

const form = document.querySelector("#recommendForm");
const demoButton = document.querySelector("#demoButton");
const message = document.querySelector("#message");
const recipesContainer = document.querySelector("#recipes");
const aiStatus = document.querySelector("#aiStatus");
const dbStatus = document.querySelector("#dbStatus");
const authStatus = document.querySelector("#authStatus");
const bestSavings = document.querySelector("#bestSavings");
const deliveryCost = document.querySelector("#deliveryCost");
const homeCost = document.querySelector("#homeCost");
const savingsBarFill = document.querySelector("#savingsBarFill");
const priorityIngredients = document.querySelector("#priorityIngredients");
const authEntry = document.querySelector("#authEntry");
const sessionPanel = document.querySelector("#sessionPanel");
const accountEmail = document.querySelector("#accountEmail");
const accountName = document.querySelector("#accountName");
const authMessage = document.querySelector("#authMessage");
const logoutButton = document.querySelector("#logoutButton");
const adminPanel = document.querySelector("#adminPanel");
const adminSummary = document.querySelector("#adminSummary");
const adminRefreshButton = document.querySelector("#adminRefreshButton");
const adminUserList = document.querySelector("#adminUserList");
const adminUserPager = document.querySelector("#adminUserPager");
const adminIpBlockList = document.querySelector("#adminIpBlockList");
const adminMessage = document.querySelector("#adminMessage");
const pantryForm = document.querySelector("#pantryForm");
const pantryList = document.querySelector("#pantryList");
const usePantryButton = document.querySelector("#usePantryButton");
const historyList = document.querySelector("#historyList");
const totalSavings = document.querySelector("#totalSavings");
const majorCategories = document.querySelector("#majorCategories");
const mediumCategories = document.querySelector("#mediumCategories");
const smallCategories = document.querySelector("#smallCategories");
const selectedIngredientSummary = document.querySelector("#selectedIngredientSummary");
const categoryRecipes = document.querySelector("#categoryRecipes");
const applyCategoryButton = document.querySelector("#applyCategoryButton");
const requestCategoryButton = document.querySelector("#requestCategoryButton");
const API_BASE_URL = String(window.NAENGTEOL_API_BASE_URL || "").replace(/\/+$/, "");
const DEDUPED_GET_PATHS = new Set(["/health", "/api/admin/overview"]);
const pendingGetRequests = new Map();



const state = {
  authenticated: false,
  user: null,
  csrfToken: null,
  guestCsrfToken: null,
  latestRecommendationId: null,
  pantry: [],
  history: [],
  totalSavings: 0,
  adminOverview: null,
  adminUserPage: 1,
  explorer: getDefaultExplorerSelection()
};

bindEvents();
renderCategoryExplorer();
await hydrateGuestSession();
await hydrateHealth();
await hydrateSession();

function bindEvents() {
  logoutButton.addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      clearAuthState();
      renderAll();
      setAuthMessage("로그아웃되었습니다.", false);
    } catch (error) {
      setAuthMessage(formatError(error), true);
    }
  });

  pantryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createPantryItem();
  });

  pantryList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-pantry]");
    if (!button) {
      return;
    }
    await deletePantryItem(button.dataset.deletePantry);
  });

  usePantryButton.addEventListener("click", () => {
    const names = state.pantry.map((item) => item.name);
    if (names.length) {
      document.querySelector("#ingredientsText").value = names.join(", ");
      setAuthMessage("저장된 재료를 입력란에 반영했습니다.", false);
    }
  });

  adminRefreshButton.addEventListener("click", async () => {
    await refreshAdminOverview();
  });

  adminUserPager.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-user-page]");
    if (!button) {
      return;
    }
    state.adminUserPage = Math.max(1, Number(button.dataset.adminUserPage || 1));
    await refreshAdminOverview();
  });

  adminUserList.addEventListener("click", async (event) => {
    const saveButton = event.target.closest("[data-admin-save-user]");
    if (saveButton) {
      await saveAdminUser(saveButton.dataset.adminSaveUser);
      return;
    }

    const blockButton = event.target.closest("[data-admin-block-ip]");
    if (blockButton) {
      await blockAdminUserIp(blockButton.dataset.adminBlockIp);
    }
  });

  adminIpBlockList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-unblock-ip]");
    if (!button) {
      return;
    }
    await unblockAdminIp(button.dataset.adminUnblockIp);
  });

  majorCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-major-id]");
    if (button) {
      selectMajorCategory(button.dataset.majorId);
    }
  });

  mediumCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-medium-id]");
    if (button) {
      selectMediumCategory(button.dataset.mediumId);
    }
  });

  smallCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-item-id]");
    if (button) {
      selectSmallCategory(button.dataset.itemId);
    }
  });

  applyCategoryButton.addEventListener("click", () => {
    applySelectedCategoryToForm();
  });

  requestCategoryButton.addEventListener("click", async () => {
    applySelectedCategoryToForm({ showStatus: false });
    await requestRecommendation();
  });

  demoButton.addEventListener("click", () => {
    document.querySelector("#ingredientsText").value = "계란, 김치, 두부, 밥, 대파";
    document.querySelector("#priorityNotes").value = "두부 유통기한 임박";
    document.querySelector("#goal").value = "save_money";
    document.querySelector("#servings").value = "1";
    document.querySelector("#maxCookTimeMinutes").value = "20";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await requestRecommendation();
  });
}

async function hydrateGuestSession() {
  try {
    const response = await fetch(apiUrl("/api/guest/session"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "게스트 세션을 시작하지 못했습니다.");
    state.guestCsrfToken = data.csrfToken;
  } catch (error) {
    showMessage(formatError(error), true);
  }
}

async function hydrateHealth() {
  try {
    const response = await fetch(apiUrl("/health"), { credentials: "include" });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      aiStatus.textContent = "서비스 연결 확인 필요";
      aiStatus.className = "status-pill fallback";
      dbStatus.textContent = "DB 연결 불가";
      dbStatus.className = "status-pill fallback";
      return;
    }

    const aiReady = Boolean(data.groqConfigured || data.aiConfigured);
    aiStatus.textContent = aiReady ? "Groq 연결 준비" : "Fallback 데모 모드";
    aiStatus.className = `status-pill ${aiReady ? "ready" : "fallback"}`;

    const dbReady = data.localDbConfigured || data.supabaseDatabaseConfigured;
    dbStatus.textContent = data.supabaseDatabaseConfigured
      ? "Supabase DB 준비"
      : data.supabaseConfigured
        ? "Supabase 로그 준비"
        : "로컬 DB 준비";
    dbStatus.className = `status-pill ${dbReady ? "ready" : "fallback"}`;
  } catch {
    aiStatus.textContent = "정적 데모 모드";
    aiStatus.className = "status-pill fallback";
    dbStatus.textContent = "서버 연결 불가";
    dbStatus.className = "status-pill fallback";
  }
}

async function hydrateSession() {
  try {
    const data = await apiFetch("/api/auth/session");
    if (data.authenticated) {
      applyAuthState(data);
      await hydrateProtectedData();
    } else {
      clearAuthState();
      await refreshPantry();
    }
  } catch {
    clearAuthState();
  }
  renderAll();
}

async function hydrateProtectedData() {
  if (!state.authenticated) {
    return;
  }

  const [pantry, history] = await Promise.all([
    apiFetch("/api/pantry"),
    apiFetch("/api/recommendations?limit=8")
  ]);

  state.pantry = pantry.items || [];
  state.history = history.logs || [];
  state.totalSavings = history.totalSavings || 0;

  if (isAdmin()) {
    const overview = await apiFetch(adminOverviewUrl());
    state.adminOverview = overview;
  } else {
    state.adminOverview = null;
  }
}

async function createPantryItem() {
  const payload = Object.fromEntries(new FormData(pantryForm).entries());
  setFormLoading(pantryForm, true);
  try {
    await apiFetch("/api/pantry", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    pantryForm.reset();
    await refreshPantry();
    setAuthMessage(state.authenticated ? "재료가 저장되었습니다." : "게스트 재료가 저장되었습니다. 다른 기기와 동기화하려면 내 정보에서 로그인하세요.", false);
  } catch (error) {
    setAuthMessage(formatError(error), true);
  } finally {
    setFormLoading(pantryForm, false);
  }
}

async function deletePantryItem(itemId) {
  try {
    await apiFetch(`/api/pantry/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    await refreshPantry();
    setAuthMessage("재료를 삭제했습니다.", false);
  } catch (error) {
    setAuthMessage(formatError(error), true);
  }
}

async function refreshPantry() {
  const data = await apiFetch("/api/pantry");
  state.pantry = data.items || [];
  renderPantry();
}

async function refreshHistory() {
  const data = await apiFetch("/api/recommendations?limit=8");
  state.history = data.logs || [];
  state.totalSavings = data.totalSavings || 0;
  renderHistory();
}

async function refreshAdminOverview() {
  if (!isAdmin()) {
    state.adminOverview = null;
    renderAdmin();
    return;
  }

  adminRefreshButton.disabled = true;
  try {
    state.adminOverview = await apiFetch(adminOverviewUrl());
    renderAdmin();
    setAdminMessage("Admin data refreshed.", false);
  } catch (error) {
    setAdminMessage(formatError(error), true);
  } finally {
    adminRefreshButton.disabled = false;
  }
}

function adminOverviewUrl() {
  const params = new URLSearchParams({
    userPage: String(state.adminUserPage),
    userPageSize: "25"
  });
  return `/api/admin/overview?${params.toString()}`;
}

async function saveAdminUser(userId) {
  const row = [...adminUserList.querySelectorAll("[data-admin-user]")].find(
    (item) => item.dataset.adminUser === userId
  );
  if (!row) {
    return;
  }

  const role = row.querySelector("[data-admin-role]")?.value || "user";
  const status = row.querySelector("[data-admin-status]")?.value || "active";

  try {
    await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role, status })
    });
    await refreshAdminOverview();
    setAdminMessage("Account permissions updated.", false);
  } catch (error) {
    setAdminMessage(formatError(error), true);
  }
}

async function blockAdminUserIp(userId) {
  const reason = window.prompt("Block reason", "Suspicious activity");
  if (reason === null) {
    return;
  }

  try {
    const result = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/block-ip`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
    await refreshAdminOverview();
    setAdminMessage(`Blocked ${result.blockedCount} IP fingerprint(s).`, false);
  } catch (error) {
    setAdminMessage(formatError(error), true);
  }
}

async function unblockAdminIp(blockId) {
  try {
    await apiFetch(`/api/admin/ip-blocks/${encodeURIComponent(blockId)}`, {
      method: "DELETE"
    });
    await refreshAdminOverview();
    setAdminMessage("IP block removed.", false);
  } catch (error) {
    setAdminMessage(formatError(error), true);
  }
}

async function requestRecommendation() {
  setLoading(true);

  const formData = new FormData(form);
  const ingredientsText = String(formData.get("ingredientsText") || "");
  const preferences = {
    goal: formData.get("goal"),
    servings: Number(formData.get("servings")),
    maxCookTimeMinutes: Number(formData.get("maxCookTimeMinutes")),
    priorityNotes: formData.get("priorityNotes")
  };

  if (!ingredientsText.trim()) {
    showMessage("재료를 한 가지 이상 입력해 주세요.", true);
    setLoading(false);
    return;
  }

  try {
    const data = await apiFetch("/api/recommend", {
      method: "POST",
      body: JSON.stringify({ ingredientsText, preferences })
    });

    renderRecommendation(data);
    if (state.authenticated) {
      await refreshHistory();
    }
  } catch (error) {
    recipesContainer.innerHTML = "";
    showMessage(formatError(error), true);
  } finally {
    setLoading(false);
  }
}

async function apiFetch(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const csrfToken = state.authenticated ? state.csrfToken : state.guestCsrfToken;
  if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) headers.set("X-CSRF-Token", csrfToken);

  const requestUrl = apiUrl(url);
  const requestOptions = {
    ...options,
    method,
    headers,
    credentials: "include"
  };

  if (method === "GET" && !options.body && canDedupeGet(url)) {
    const pending = pendingGetRequests.get(requestUrl);
    if (pending) {
      return pending;
    }

    const pendingRequest = requestJson(requestUrl, requestOptions).finally(() => {
      pendingGetRequests.delete(requestUrl);
    });
    pendingGetRequests.set(requestUrl, pendingRequest);
    return pendingRequest;
  }

  return requestJson(requestUrl, requestOptions);
}

function canDedupeGet(path) {
  const value = String(path || "");
  if (/^https?:\/\//i.test(value)) {
    return false;
  }
  const normalizedPath = value.split("?")[0];
  const normalized = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return DEDUPED_GET_PATHS.has(normalized);
}

async function requestJson(requestUrl, requestOptions) {
  const response = await fetch(requestUrl, requestOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "요청을 처리할 수 없습니다.");
    error.details = data.details;
    throw error;
  }

  return data;
}

function apiUrl(path) {
  const value = String(path || "");
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (API_BASE_URL) {
    return `${API_BASE_URL}${value.startsWith("/") ? value : `/${value}`}`;
  }
  return value.startsWith("/") ? value.slice(1) : value;
}

function applyAuthState(data) {
  state.authenticated = Boolean(data.authenticated);
  state.user = data.user || null;
  state.csrfToken = data.csrfToken || null;
}

function clearAuthState() {
  state.authenticated = false;
  state.user = null;
  state.csrfToken = null;
  state.pantry = [];
  state.history = [];
  state.totalSavings = 0;
  state.adminOverview = null;
  state.adminUserPage = 1;
}

function renderAll() {
  renderAuth();
  renderAdmin();
  renderPantry();
  renderHistory();
}

function renderAuth() {
  authEntry.classList.toggle("hidden", state.authenticated);
  sessionPanel.classList.toggle("hidden", !state.authenticated);

  if (state.authenticated && state.user) {
    authStatus.textContent = `${state.user.email} 로그인`;
    authStatus.className = "status-pill ready";
    accountEmail.textContent = state.user.email;
    accountName.textContent = [state.user.displayName, state.user.role === "admin" ? "Admin" : ""]
      .filter(Boolean)
      .join(" · ");
  } else {
    authStatus.textContent = "비로그인";
    authStatus.className = "status-pill fallback";
    accountEmail.textContent = "-";
    accountName.textContent = "";
  }
}

function isAdmin() {
  return state.authenticated && state.user?.role === "admin" && state.user?.status === "active";
}

function renderAdmin() {
  const visible = isAdmin();
  adminPanel.classList.toggle("hidden", !visible);

  if (!visible) {
    adminSummary.innerHTML = "";
    adminUserList.innerHTML = '<span class="empty-state">Admin access is required.</span>';
    renderAdminUserPager(null);
    adminIpBlockList.innerHTML = '<span class="empty-state">Admin access is required.</span>';
    setAdminMessage("", false);
    return;
  }

  const overview = state.adminOverview;
  if (!overview) {
    adminSummary.innerHTML = "";
    adminUserList.innerHTML = '<span class="empty-state">Loading admin data.</span>';
    renderAdminUserPager(null);
    adminIpBlockList.innerHTML = '<span class="empty-state">Loading blocked IPs.</span>';
    return;
  }

  const stats = overview.stats || {};
  adminSummary.innerHTML = [
    ["Users", stats.totalUsers],
    ["Active", stats.activeUsers],
    ["Suspended", stats.suspendedUsers],
    ["Admins", stats.adminUsers],
    ["Sessions", stats.activeSessions],
    ["Blocked IPs", stats.blockedIps]
  ]
    .map(
      ([label, value]) => `
        <div>
          <span class="metric-label">${escapeHtml(label)}</span>
          <strong>${Number(value || 0).toLocaleString("ko-KR")}</strong>
        </div>
      `
    )
    .join("");

  renderAdminUsers(overview.users || []);
  renderAdminUserPager(overview.pagination?.users || null);
  renderAdminIpBlocks(overview.ipBlocks || []);
}

function renderAdminUsers(users) {
  adminUserList.innerHTML = "";

  if (!users.length) {
    adminUserList.innerHTML = '<span class="empty-state">No users found.</span>';
    return;
  }

  for (const user of users) {
    const row = document.createElement("div");
    const isSelf = user.id === state.user?.id;
    const isAdminAccount = user.role === "admin";
    const sessionTags = (user.sessions || [])
      .map(
        (session) => `
          <span class="${session.blocked ? "blocked" : ""}">
            ${escapeHtml(session.ipFingerprint)} · ${escapeHtml(formatDateTime(session.lastSeenAt))}
          </span>
        `
      )
      .join("");

    row.className = "data-row admin-user-row";
    row.dataset.adminUser = user.id;
    row.innerHTML = `
      <div class="admin-user-main">
        <strong>${escapeHtml(user.email)}</strong>
        <span>${escapeHtml(user.displayName || "-")} · ${escapeHtml(user.role)} · ${escapeHtml(user.status)}</span>
        <span>${Number(user.recommendationCount || 0).toLocaleString("ko-KR")} recs · ${formatKrw(
          user.savingsTotal
        )} saved · ${Number(user.activeSessionCount || 0).toLocaleString("ko-KR")} active sessions</span>
        <span>Last seen ${escapeHtml(user.lastSeenAt ? formatDateTime(user.lastSeenAt) : "never")}</span>
        <div class="admin-session-list">${sessionTags || "<span>No active session IPs</span>"}</div>
      </div>
      <div class="admin-controls">
        <select data-admin-role ${isSelf ? "disabled" : ""}>
          <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
          <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
        <select data-admin-status ${isSelf ? "disabled" : ""}>
          <option value="active" ${user.status === "active" ? "selected" : ""}>Active</option>
          <option value="suspended" ${user.status === "suspended" ? "selected" : ""}>Suspended</option>
        </select>
        <button type="button" class="secondary-button" data-admin-save-user="${escapeAttr(user.id)}" ${
          isSelf ? "disabled" : ""
        }>Save</button>
        <button type="button" class="text-button" data-admin-block-ip="${escapeAttr(user.id)}" ${
          isSelf || isAdminAccount ? "disabled" : ""
        }>Block IP</button>
      </div>
    `;
    adminUserList.append(row);
  }
}

function renderAdminUserPager(pagination) {
  if (!pagination || Number(pagination.totalPages || 0) <= 1) {
    adminUserPager.classList.add("hidden");
    adminUserPager.innerHTML = "";
    return;
  }

  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  adminUserPager.classList.remove("hidden");
  adminUserPager.innerHTML = `
    <button type="button" class="secondary-button compact-button" data-admin-user-page="${page - 1}" ${
      page <= 1 ? "disabled" : ""
    }>Prev</button>
    <span>${page.toLocaleString("ko-KR")} / ${totalPages.toLocaleString("ko-KR")}</span>
    <button type="button" class="secondary-button compact-button" data-admin-user-page="${page + 1}" ${
      page >= totalPages ? "disabled" : ""
    }>Next</button>
  `;
}

function renderAdminIpBlocks(blocks) {
  adminIpBlockList.innerHTML = "";

  if (!blocks.length) {
    adminIpBlockList.innerHTML = '<span class="empty-state">No blocked IPs.</span>';
    return;
  }

  for (const block of blocks) {
    const row = document.createElement("div");
    row.className = "data-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(block.ipFingerprint)}</strong>
        <span>${escapeHtml(block.user?.email || "Unknown user")} · ${escapeHtml(
          block.reason || "No reason"
        )}</span>
        <span>${escapeHtml(formatDateTime(block.createdAt))}</span>
      </div>
      <button type="button" class="secondary-button compact-button" data-admin-unblock-ip="${escapeAttr(
        block.id
      )}">Unblock</button>
    `;
    adminIpBlockList.append(row);
  }
}

function renderPantry() {
  setFormDisabled(pantryForm, false);
  usePantryButton.disabled = state.pantry.length === 0;
  pantryList.innerHTML = "";

  if (!state.pantry.length) {
    pantryList.innerHTML = '<span class="empty-state">아직 저장된 재료가 없습니다.</span>';
    return;
  }

  for (const item of state.pantry) {
    const row = document.createElement("div");
    row.className = "data-row";
    const meta = [item.quantity, item.expiresAt ? `소비 기한 ${formatDate(item.expiresAt)}` : ""]
      .filter(Boolean)
      .join(" · ");
    row.innerHTML = `
      <div>
        <strong>${renderIngredientLink(item.name)}</strong>
        <span>${escapeHtml(meta || "수량 미입력")}</span>
      </div>
      <button type="button" class="text-button" data-delete-pantry="${escapeAttr(item.id)}">삭제</button>
    `;
    pantryList.append(row);
  }
}

function renderHistory() {
  totalSavings.textContent = formatKrw(state.totalSavings);
  historyList.innerHTML = "";

  if (!state.authenticated) {
    historyList.innerHTML = '<span class="empty-state">로그인 후 냉장고 털기 기록이 저장됩니다.</span>';
    return;
  }

  if (!state.history.length) {
    historyList.innerHTML = '<span class="empty-state">저장된 냉장고 털기 기록이 없습니다.</span>';
    return;
  }

  for (const entry of state.history) {
    const row = document.createElement("div");
    row.className = "data-row history-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(entry.recipeNames.join(", ") || "털어낸 메뉴")}</strong>
        <span>${escapeHtml(formatDateTime(entry.createdAt))} · ${formatKrw(entry.bestSavings)} 절약</span>
      </div>
    `;
    historyList.append(row);
  }
}

function renderCategoryExplorer() {
  const { major, medium, item } = getSelectedExplorer();
  renderCategoryButtons(majorCategories, CATEGORY_DATA, "major", major.id);
  renderCategoryButtons(mediumCategories, major.children, "medium", medium.id);
  renderSmallCategories(medium.items, item.id);
  renderSelectedIngredient(major, medium, item);
  renderCategoryRecipePreview(item);
}

function renderCategoryButtons(container, items, type, selectedId) {
  container.innerHTML = "";

  for (const entry of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-button ${entry.id === selectedId ? "active" : ""}`;
    button.dataset[`${type}Id`] = entry.id;
    button.innerHTML = `
      <strong>${escapeHtml(entry.label)}</strong>
      <span>${escapeHtml(entry.description)}</span>
    `;
    container.append(button);
  }
}

function renderSmallCategories(items, selectedId) {
  smallCategories.innerHTML = "";

  for (const entry of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-chip ${entry.id === selectedId ? "active" : ""}`;
    button.dataset.itemId = entry.id;
    button.textContent = entry.name;
    smallCategories.append(button);
  }
}

function renderSelectedIngredient(major, medium, item) {
  selectedIngredientSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(major.label)} / ${escapeHtml(medium.label)}</span>
    </div>
    <p>${escapeHtml(item.priorityNote)}</p>
    <div class="chip-row">
      ${item.ingredients.slice(0, 6).map((ingredient) => `<span class="chip">${escapeHtml(ingredient)}</span>`).join("")}
    </div>
    <a class="text-link" href="./ingredient.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)} 보관법과 전체 요리 보기</a>
  `;
}

function renderCategoryRecipePreview(item) {
  categoryRecipes.innerHTML = "";

  item.recipes.forEach((recipe, index) => {
    const fullRecipe = toFullCategoryRecipe(item, recipe, index);
    const article = document.createElement("article");
    article.className = "mini-recipe-card";
    article.innerHTML = `
      <div>
        <h3>${escapeHtml(fullRecipe.name)}</h3>
        <div class="recipe-meta">
          <span class="tag">약 ${fullRecipe.cookTimeMinutes}분</span>
          <span class="tag">${difficultyLabel(fullRecipe.difficulty)}</span>
        </div>
      </div>
      <p>${escapeHtml(fullRecipe.reason)}</p>
      <p class="recipe-availability">저장된 보유 재료 ${fullRecipe.ownedIngredients.length}개 · 추가 확인 필요 ${fullRecipe.missingIngredients.length}개</p>
    `;
    categoryRecipes.append(article);
  });
}

function selectMajorCategory(majorId) {
  const major = CATEGORY_DATA.find((entry) => entry.id === majorId) || CATEGORY_DATA[0];
  const medium = major.children[0];
  const item = medium.items[0];
  state.explorer = {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
  renderCategoryExplorer();
}

function selectMediumCategory(mediumId) {
  const { major } = getSelectedExplorer();
  const medium = major.children.find((entry) => entry.id === mediumId) || major.children[0];
  const item = medium.items[0];
  state.explorer = {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
  renderCategoryExplorer();
}

function selectSmallCategory(itemId) {
  const { major, medium } = getSelectedExplorer();
  const item = medium.items.find((entry) => entry.id === itemId) || medium.items[0];
  state.explorer = {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
  renderCategoryExplorer();
  renderRecommendation(buildCategoryRecommendation(item));
}

function applySelectedCategoryToForm(options = {}) {
  const { item } = getSelectedExplorer();
  const showStatus = options.showStatus !== false;
  document.querySelector("#ingredientsText").value = item.name;
  document.querySelector("#priorityNotes").value = item.priorityNote;
  document.querySelector("#goal").value = "quick";
  document.querySelector("#servings").value = "1";
  document.querySelector("#maxCookTimeMinutes").value = item.recipes.some((recipe) => recipe.cookTimeMinutes <= 10)
    ? "10"
    : "20";

  if (showStatus) {
    showMessage(`${item.name}만 입력란에 반영했습니다. 위 조합은 아이디어이며 DB 보유 재료로 처리되지 않습니다.`, false);
  }
}

function buildCategoryRecommendation(item) {
  const recipes = item.recipes.map((recipe, index) => toFullCategoryRecipe(item, recipe, index));

  return {
    recipes,
    priorityIngredients: [item.name],
    summary: `${item.name}로 바로 만들기 좋은 자취생 메뉴입니다.`,
    totals: {
      bestSavings: Math.max(...recipes.map((recipe) => recipe.estimatedSavings)),
      averageDeliveryCost: 12000,
      estimatedHomeCookingCost: 3500
    },
    meta: {
      source: "curated",
      logging: {
        stored: false
      }
    }
  };
}

function toFullCategoryRecipe(item, recipe, index) {
  const pantryNames = state.pantry.map((entry) => entry.name);
  const required = recipe.requiredIngredients || [];
  const ownedRequired = required.filter((entry) => pantryNames.some((name) => ingredientNamesMatch(name, entry.name)));
  const missingRequired = required.filter((entry) => !pantryNames.some((name) => ingredientNamesMatch(name, entry.name)));

  return {
    id: recipe.id,
    name: recipe.name,
    reason: recipe.reason,
    ownedIngredients: ownedRequired.map((entry) => entry.name),
    missingIngredients: missingRequired.map((entry) => entry.name),
    requiredIngredients: required,
    optionalIngredients: recipe.optionalIngredients || [],
    equipment: recipe.equipment || [],
    cookTimeMinutes: recipe.cookTimeMinutes,
    difficulty: recipe.difficulty,
    steps: recipe.steps,
    doneness: recipe.doneness,
    sourceRefs: recipe.sourceRefs || [],
    reviewedAt: recipe.reviewedAt,
    adaptationNote: recipe.adaptationNote,
    sourceScope: recipe.sourceScope,
    estimateNote: recipe.estimateNote,
    estimatedDeliveryCost: 12000,
    estimatedHomeCookingCost: 3500 + index * 300,
    estimatedSavings: 8500 - index * 300,
    costEstimateNote: "가격은 1인분 예시이며 실제 구매가·사용량·배달비에 따라 달라집니다."
  };
}

function renderRecommendation(data) {
  const source = data.meta?.source;
  const sourceLabel =
    source === "groq"
      ? "Groq 털기"
      : source === "openai"
        ? "OpenAI 털기"
        : source === "curated"
          ? "분류 기반 털기"
          : source === "local"
            ? "정적 데모 털기"
          : "데모 fallback 털기";
  const loggingLabel =
    source === "curated"
      ? "AI 털기 전 미저장"
      : data.meta?.logging?.stored
        ? "털기 기록 저장됨"
        : "로그인 시 털기 기록 저장";
  showMessage(`${sourceLabel} · ${loggingLabel} · ${data.summary}`, false);

  const totals = data.totals || {};
  bestSavings.textContent = formatKrw(totals.bestSavings || 0);
  deliveryCost.textContent = formatKrw(totals.averageDeliveryCost || 12000);
  homeCost.textContent = formatKrw(totals.estimatedHomeCookingCost || 3500);
  savingsBarFill.style.width = `${Math.min(100, Math.round(((totals.bestSavings || 0) / 12000) * 100))}%`;

  state.latestRecommendationId = data.recommendationId || null;
  renderPriorityIngredients(data.priorityIngredients || []);
  renderRecipes(data.recipes || [], state.latestRecommendationId);
}

function renderPriorityIngredients(items) {
  priorityIngredients.innerHTML = "";

  if (!items.length) {
    priorityIngredients.innerHTML = '<span class="empty-state">털기 후 표시됩니다.</span>';
    return;
  }

  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    priorityIngredients.append(chip);
  }
}

function renderRecipes(recipes, recommendationId) {
  recipesContainer.innerHTML = "";

  for (const recipe of recipes) {
    const article = document.createElement("article");
    article.className = "recipe-card";

    const missing = recipe.missingIngredients?.length
      ? recipe.missingIngredients.map(escapeHtml).join(", ")
      : "추가로 확인할 필수 재료 없음";
    const requiredIngredients = normalizeIngredientEntries(recipe.requiredIngredients);
    const optionalIngredients = normalizeIngredientEntries(recipe.optionalIngredients);
    const sourceLinks = renderSourceLinks(recipe.sourceRefs);
    const costNote = recipe.costEstimateNote || "가격은 1인분 예시이며 실제 구매가·사용량·배달비에 따라 달라집니다.";

    article.innerHTML = `
      <div class="recipe-topline">
        <div>
          <h3>${escapeHtml(recipe.name)}</h3>
          <div class="recipe-meta">
            <span class="tag">약 ${recipe.cookTimeMinutes}분</span>
            <span class="tag">${difficultyLabel(recipe.difficulty)}</span>
            <span class="tag money">${formatKrw(recipe.estimatedSavings)} 절약</span>
          </div>
        </div>
      </div>
      <p>${escapeHtml(recipe.reason)}</p>
      <div>
        <strong>저장된 보유 재료</strong>
        <ul class="ingredient-list">
          ${(recipe.ownedIngredients || []).length ? recipe.ownedIngredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : '<li class="empty-state">확인된 보유 재료 없음</li>'}
        </ul>
      </div>
      ${(recipe.inputIngredients || []).length ? `<div><strong>직접 입력한 재료 (보유 미확인)</strong><ul class="ingredient-list">${recipe.inputIngredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
      <p class="ingredient-match-note">보유 여부는 재료 이름만 대조했습니다. 저장 수량이 아래 필요량보다 충분한지는 직접 확인해 주세요.</p>
      <div>
        <strong>필수 재료</strong>
        <ul class="ingredient-list">
          ${requiredIngredients.map((item) => `<li>${escapeHtml(formatIngredientAmount(item))}</li>`).join("") || '<li class="empty-state">필수 재료 정보 없음</li>'}
        </ul>
      </div>
      <div>
        <strong>선택 재료</strong>
        ${optionalIngredients.length ? `<p class="muted-copy">${escapeHtml(OPTIONAL_INGREDIENT_NOTE)}</p>` : ""}
        <ul class="ingredient-list">
          ${optionalIngredients.map((item) => `<li>${escapeHtml(formatIngredientAmount(item))}</li>`).join("") || '<li class="empty-state">선택 재료 없음</li>'}
        </ul>
      </div>
      <div>
        <strong>추가로 확인할 필수 재료</strong>
        <p>${missing}</p>
      </div>
      ${recipe.equipment?.length ? `<div><strong>조리도구</strong><p>${recipe.equipment.map(escapeHtml).join(", ")}</p></div>` : ""}
      <div>
        <strong>조리 순서</strong>
        <ol class="steps">
          ${(recipe.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
      </div>
      ${recipe.doneness ? `<div><strong>완료 기준</strong><p>${escapeHtml(recipe.doneness)}</p></div>` : ""}
      <div class="recipe-notes">
        <p>${escapeHtml(costNote)}</p>
        ${recipe.adaptationNote ? `<p>${escapeHtml(recipe.adaptationNote)}</p>` : ""}
        ${recipe.estimateNote ? `<p>${escapeHtml(recipe.estimateNote)}</p>` : ""}
        ${recipe.sourceScope ? `<p>${escapeHtml(recipe.sourceScope)}</p>` : ""}
        ${sourceLinks ? `<p class="source-links">근거: ${sourceLinks}</p>` : ""}
        ${recipe.reviewedAt ? `<p>검토일 ${escapeHtml(recipe.reviewedAt)}</p>` : ""}
      </div>
      <button class="primary-button choose-recipe" type="button">이 요리 할래요</button>
      <div class="selection-status" role="status"></div>
    `;
    article.querySelector(".choose-recipe").addEventListener("click", () => selectRecipe(recommendationId, recipe, article));
    recipesContainer.append(article);
  }
}

async function selectRecipe(recommendationId, recipe, article) {
  if (!recommendationId || !recipe.id) { showMessage("선택 가능한 추천 정보가 없습니다. 다시 추천받아 주세요.", true); return; }
  const button = article.querySelector(".choose-recipe");
  const status = article.querySelector(".selection-status");
  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "선택을 저장하는 중입니다.";
  try {
    // Retrying a card must replay the same mutation if only its response was lost.
    const idempotencyKey = article.dataset.selectionKey ||= crypto.randomUUID();
    const data = await apiFetch("/api/menu-selections", { method: "POST", body: JSON.stringify({ recommendationId, recipeId: recipe.id, idempotencyKey }) });
    status.textContent = `${recipe.name} 선택 완료 · 예상 절약 ${formatKrw(data.recipeSnapshot?.estimatedSavings ?? recipe.estimatedSavings)}`;
    button.textContent = "선택 완료";
    if (!state.authenticated) showMessage("메뉴 선택은 저장되었습니다. 재료와 기록을 다른 기기와 동기화하려면 내 정보에서 로그인하세요.", false);
  } catch (error) {
    button.disabled = false;
    status.textContent = formatError(error);
    status.classList.add("error");
    return;
  }
  if (state.authenticated) {
    try {
      await refreshHistory();
    } catch (error) {
      showMessage(`메뉴는 저장되었지만 내역을 새로 불러오지 못했습니다. ${formatError(error)}`, true);
    }
  }
}

function normalizeIngredientEntries(items) {
  return (Array.isArray(items) ? items : []).map((item) => typeof item === "string" ? { name: item, amount: "" } : item).filter((item) => item?.name);
}

function formatIngredientAmount(item) {
  if (typeof item === "string") return item;
  return [item.name, item.amount].filter(Boolean).join(" · ");
}

function renderSourceLinks(refs) {
  return uniqueValues(Array.isArray(refs) ? refs : []).map((ref) => {
    const source = FOOD_CATALOG_SOURCES[ref];
    return source ? `<a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>` : "";
  }).filter(Boolean).join(" · ");
}

function renderIngredientLink(name) {
  const item = findCatalogItemByIngredientName(name);
  return item
    ? `<a class="text-link" href="./ingredient.html?id=${encodeURIComponent(item.id)}">${escapeHtml(name)}</a>`
    : escapeHtml(name);
}

function findCatalogItemByIngredientName(name) {
  return CATEGORY_DATA.flatMap((major) => major.children).flatMap((medium) => medium.items)
    .find((item) => [item.name, ...item.aliases].some((candidate) => ingredientNamesMatch(candidate, name))) || null;
}

function setAuthMessage(text, isError) {
  if (!authMessage) {
    return;
  }
  authMessage.textContent = text;
  authMessage.classList.toggle("error", Boolean(isError));
}

function setAdminMessage(text, isError) {
  adminMessage.textContent = text;
  adminMessage.classList.toggle("error", Boolean(isError));
}

function showMessage(text, isError) {
  message.textContent = text;
  message.classList.toggle("error", Boolean(isError));
}

function setLoading(isLoading) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "냉장고 털이 중" : "냉장고 털기 시작";
}

function setFormLoading(targetForm, isLoading) {
  const submitButton = targetForm.querySelector('button[type="submit"]');
  targetForm.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = isLoading;
  });
  if (submitButton) {
    submitButton.dataset.originalText ||= submitButton.textContent;
    submitButton.textContent = isLoading ? "처리 중" : submitButton.dataset.originalText;
  }
}

function setFormDisabled(targetForm, isDisabled) {
  targetForm.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = isDisabled;
  });
}

function getDefaultExplorerSelection() {
  const major = CATEGORY_DATA[0];
  const medium = major.children[0];
  const item = medium.items[0];
  return {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
}

function getSelectedExplorer() {
  const major = CATEGORY_DATA.find((entry) => entry.id === state.explorer.majorId) || CATEGORY_DATA[0];
  const medium = major.children.find((entry) => entry.id === state.explorer.mediumId) || major.children[0];
  const item = medium.items.find((entry) => entry.id === state.explorer.itemId) || medium.items[0];
  return { major, medium, item };
}

function foodItem(id, name, ingredients, priorityNote, recipes) {
  return {
    id,
    name,
    ingredients: uniqueValues(ingredients),
    priorityNote,
    recipes
  };
}

function dish(name, cookTimeMinutes, reason, extraIngredients = []) {
  return {
    name,
    cookTimeMinutes,
    reason,
    extraIngredients
  };
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function difficultyLabel(value) {
  return {
    easy: "쉬움",
    medium: "보통",
    hard: "어려움"
  }[value] || "쉬움";
}

function formatKrw(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatError(error) {
  const details = Array.isArray(error.details) ? ` ${error.details.join(" ")}` : "";
  return `${error.message}${details}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
