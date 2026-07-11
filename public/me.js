const API_BASE_URL = String(window.NAENGTEOL_API_BASE_URL || "").replace(/\/+$/, "");
const state = { authenticated: false, user: null, csrfToken: null, guestCsrfToken: null, lastMerge: null };

const $ = (selector) => document.querySelector(selector);
const loginForm = $("#loginForm");
const registerForm = $("#registerForm");
const hubStatus = $("#hubStatus");

bind();
await hydrate();

function bind() {
  $("#showLogin").addEventListener("click", () => showForm("login"));
  $("#showRegister").addEventListener("click", () => showForm("register"));
  loginForm.addEventListener("submit", (event) => submitLogin(event));
  registerForm.addEventListener("submit", (event) => submitRegister(event));
  $("#logoutButton").addEventListener("click", logout);
  $("#retryMergeButton").addEventListener("click", retryMerge);
}

async function hydrate() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!state.authenticated) showForm(hash === "register" ? "register" : "login");
  try {
    const session = await apiFetch("/api/auth/session");
    applySession(session);
    if (state.authenticated) await loadAccountData();
    else if (hash === "register") await ensureGuestSession();
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

function showForm(kind) {
  const register = kind === "register";
  loginForm.classList.toggle("hidden", register);
  registerForm.classList.toggle("hidden", !register);
  window.history.replaceState(null, "", `${window.location.pathname}#${register ? "register" : "login"}`);
}

async function ensureGuestSession() {
  const data = await apiFetch("/api/guest/session", { method: "POST" });
  state.guestCsrfToken = data.csrfToken || null;
}

async function submitLogin(event) {
  event.preventDefault();
  if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }
  await submitForm(loginForm, "/api/auth/login", "로그인되었습니다.", false);
}

async function submitRegister(event) {
  event.preventDefault();
  if (!registerForm.checkValidity()) { registerForm.reportValidity(); return; }
  if (!state.guestCsrfToken) {
    try { await ensureGuestSession(); } catch (error) { setStatus(formatError(error), true); return; }
  }
  const payload = formPayload(registerForm);
  payload.guestMergeIdempotencyKey = freshKey();
  await submitForm(registerForm, "/api/auth/register", "회원가입되었습니다.", true, payload);
}

async function submitForm(form, endpoint, success, guestMutation, payload = formPayload(form)) {
  setLoading(form, true);
  setStatus("");
  try {
    const data = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken: guestMutation ? state.guestCsrfToken : null
    });
    applySession(data);
    form.reset();
    setStatus(success);
    if (data.merge) renderMerge(data.merge);
    await loadAccountData();
  } catch (error) {
    setStatus(formatError(error), true);
  } finally { setLoading(form, false); }
}

async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
    state.authenticated = false; state.user = null; state.csrfToken = null;
    $("#sessionSummary").classList.add("hidden");
    clearList("#pantryList"); clearList("#historyList");
    $("#pantryStatus").textContent = "로그인하면 저장한 재료를 확인할 수 있습니다.";
    $("#historyStatus").textContent = "‘이 요리 할래요’로 선택한 메뉴만 표시됩니다.";
    showForm("login"); setStatus("로그아웃되었습니다.");
  } catch (error) { setStatus(formatError(error), true); }
}

async function retryMerge() {
  const button = $("#retryMergeButton");
  button.disabled = true; setStatus("");
  try {
    const data = await apiFetch("/api/guest/merge", {
      method: "POST", body: JSON.stringify({ idempotencyKey: freshKey() })
    });
    renderMerge(data.merge || data); setStatus("게스트 데이터 병합을 다시 요청했습니다.");
  } catch (error) { setStatus(formatError(error), true); }
  finally { button.disabled = false; }
}

async function loadAccountData() {
  if (!state.authenticated) return;
  const results = await Promise.allSettled([apiFetch("/api/pantry"), apiFetch("/api/recommendations")]);
  renderPantry(results[0]); renderHistory(results[1]);
}

function renderPantry(result) {
  const list = $("#pantryList"); clearList("#pantryList");
  if (result.status === "rejected") {
    $("#pantryStatus").textContent = formatError(result.reason);
    $("#pantryStatus").setAttribute("role", "alert");
    return;
  }
  $("#pantryStatus").setAttribute("role", "status");
  const items = result.value.items || [];
  $("#pantryStatus").textContent = items.length ? `${items.length}개 재료` : "저장한 재료가 없습니다.";
  items.forEach((item) => addItem(list, item.name || item.ingredient || "이름 없는 재료"));
}

function renderHistory(result) {
  const list = $("#historyList"); clearList("#historyList");
  if (result.status === "rejected") {
    $("#historyStatus").textContent = formatError(result.reason);
    $("#historyStatus").setAttribute("role", "alert");
    return;
  }
  $("#historyStatus").setAttribute("role", "status");
  const logs = result.value.selections || result.value.logs || [];
  $("#historyStatus").textContent = logs.length ? `${logs.length}개 선택 기록 · 절약 ${Number(result.value.totalSavings || 0).toLocaleString()}원` : "선택한 메뉴가 없습니다.";
  logs.forEach((entry) => {
    const snapshot = entry.recipeSnapshot || entry.snapshot || {};
    addItem(list, snapshot.title || snapshot.name || entry.recipeId || "선택한 메뉴");
  });
}

function renderMerge(merge) {
  state.lastMerge = merge;
  const container = $("#mergeSummary"); const list = $("#mergeSteps");
  container.classList.remove("hidden"); list.replaceChildren();
  const steps = Array.isArray(merge.steps) ? merge.steps : Object.entries(merge.steps || {}).map(([name, status]) => ({ name, status }));
  const normalized = steps.length ? steps : [{ name: "전체 데이터", status: merge.status || "failed" }];
  normalized.forEach((step) => {
    const item = document.createElement("li");
    const status = String(step.status || "failed").toLowerCase();
    const label = status === "completed" || status === "succeeded" ? "완료" : status === "partial" ? "부분 완료" : "실패";
    const name = step.name || step.type || step.entity || step.category || "데이터";
    item.textContent = `${name}: ${label}${step.message || step.errorCode ? ` — ${step.message || step.errorCode}` : ""}`;
    list.append(item);
  });
  const complete = ["completed", "succeeded"].includes(String(merge.status).toLowerCase());
  $("#retryMergeButton").classList.toggle("hidden", complete);
}

function applySession(data) {
  state.authenticated = Boolean(data.authenticated); state.user = data.user || null; state.csrfToken = data.csrfToken || null;
  $("#sessionSummary").classList.toggle("hidden", !state.authenticated);
  if (state.authenticated) { loginForm.classList.add("hidden"); registerForm.classList.add("hidden"); }
  if (state.user) { $("#sessionName").textContent = state.user.displayName || "사용자"; $("#sessionEmail").textContent = state.user.email || ""; }
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {}); const method = String(options.method || "GET").toUpperCase();
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = options.csrfToken === undefined ? state.csrfToken : options.csrfToken;
  if (token && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) headers.set("X-CSRF-Token", token);
  const response = await fetch(apiUrl(path), { ...options, headers, credentials: "same-origin" });
  const data = (response.headers.get("content-type") || "").includes("json") ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || data.message || `요청 실패 (${response.status})`);
  return data;
}

function apiUrl(path) { return API_BASE_URL ? `${API_BASE_URL}${path}` : path; }
function formPayload(form) { return Object.fromEntries(new FormData(form).entries()); }
function freshKey() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function addItem(list, text) { const item = document.createElement("li"); item.textContent = text; list.append(item); }
function clearList(selector) { $(selector).replaceChildren(); }
function setLoading(form, loading) { form.querySelectorAll("input,button").forEach((element) => { element.disabled = loading; }); }
function setStatus(text, error = false) { hubStatus.textContent = text; hubStatus.setAttribute("role", error ? "alert" : "status"); hubStatus.classList.toggle("error", error); }
function formatError(error) { return error?.message || "요청을 처리하지 못했습니다."; }

export { renderMerge };
