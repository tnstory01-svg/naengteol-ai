const authForm = document.querySelector("#authPageForm");
const authMessage = document.querySelector("#authPageMessage");
const sessionPanel = document.querySelector("#authPageSession");
const sessionEmail = document.querySelector("#authPageEmail");
const sessionName = document.querySelector("#authPageName");
const logoutButton = document.querySelector("#authPageLogout");
const API_BASE_URL = String(window.NAENGTEOL_API_BASE_URL || "").replace(/\/+$/, "");

const state = {
  authenticated: false,
  user: null,
  csrfToken: null
};

await hydrateSession();
bindAuthPage();

function bindAuthPage() {
  if (authForm) {
    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitAuthPageForm();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" });
        clearAuthState();
        renderSession();
        setMessage("로그아웃되었습니다.", false);
      } catch (error) {
        setMessage(formatError(error), true);
      }
    });
  }
}

async function submitAuthPageForm() {
  const endpoint = authForm.dataset.authEndpoint;
  const successMessage = authForm.dataset.authSuccess || "처리되었습니다.";

  setFormLoading(authForm, true);
  setMessage("", false);

  try {
    const formData = new FormData(authForm);
    const payload = Object.fromEntries(formData.entries());
    const data = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    applyAuthState(data);
    renderSession();
    authForm.reset();
    setMessage(successMessage, false);
  } catch (error) {
    setMessage(formatError(error), true);
  } finally {
    setFormLoading(authForm, false);
  }
}

async function hydrateSession() {
  try {
    const data = await apiFetch("/api/auth/session");
    if (data.authenticated) {
      applyAuthState(data);
    } else {
      clearAuthState();
    }
  } catch {
    clearAuthState();
  }
  renderSession();
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
}

function renderSession() {
  if (!sessionPanel || !sessionEmail || !sessionName || !logoutButton) {
    return;
  }

  sessionPanel.classList.toggle("hidden", !state.authenticated);
  logoutButton.classList.toggle("hidden", !state.authenticated);

  if (state.authenticated && state.user) {
    sessionEmail.textContent = state.user.email;
    sessionName.textContent = [state.user.displayName, state.user.role === "admin" ? "Admin" : ""]
      .filter(Boolean)
      .join(" · ");
  } else {
    sessionEmail.textContent = "-";
    sessionName.textContent = "";
  }
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (state.csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers.set("X-CSRF-Token", state.csrfToken);
  }

  const response = await fetch(apiUrl(url), {
    ...options,
    headers,
    credentials: "same-origin"
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    throw new Error(data.error || data.message || `요청 실패 (${response.status})`);
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

function setMessage(text, isError) {
  if (!authMessage) {
    return;
  }
  authMessage.textContent = text;
  authMessage.classList.toggle("error", Boolean(isError));
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

function formatError(error) {
  return error?.message || "요청을 처리하지 못했습니다.";
}
