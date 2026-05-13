const form = document.querySelector("#recommendForm");
const demoButton = document.querySelector("#demoButton");
const message = document.querySelector("#message");
const recipesContainer = document.querySelector("#recipes");
const aiStatus = document.querySelector("#aiStatus");
const dbStatus = document.querySelector("#dbStatus");
const bestSavings = document.querySelector("#bestSavings");
const deliveryCost = document.querySelector("#deliveryCost");
const homeCost = document.querySelector("#homeCost");
const savingsBarFill = document.querySelector("#savingsBarFill");
const priorityIngredients = document.querySelector("#priorityIngredients");

const anonymousId = getAnonymousId();

demoButton.addEventListener("click", () => {
  document.querySelector("#ingredientsText").value = "계란, 김치, 두부, 밥, 대파";
  document.querySelector("#priorityNotes").value = "두부 유통기한 임박";
  document.querySelector("#goal").value = "save_money";
  document.querySelector("#servings").value = "1";
  document.querySelector("#maxCookTimeMinutes").value = "20";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoading(true);

  const formData = new FormData(form);
  const ingredientsText = String(formData.get("ingredientsText") || "");

  try {
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        anonymousId,
        ingredientsText,
        preferences: {
          goal: formData.get("goal"),
          servings: Number(formData.get("servings")),
          maxCookTimeMinutes: Number(formData.get("maxCookTimeMinutes")),
          priorityNotes: formData.get("priorityNotes")
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "추천을 만들 수 없습니다.");
    }

    renderRecommendation(data);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setLoading(false);
  }
});

await hydrateHealth();

async function hydrateHealth() {
  try {
    const response = await fetch("/health");
    const data = await response.json();

    aiStatus.textContent = data.openaiConfigured ? "OpenAI 연결 준비" : "Fallback 데모 모드";
    aiStatus.className = `status-pill ${data.openaiConfigured ? "ready" : "fallback"}`;

    dbStatus.textContent = data.supabaseConfigured ? "Supabase 저장 준비" : "로컬 데모 저장";
    dbStatus.className = `status-pill ${data.supabaseConfigured ? "ready" : "fallback"}`;
  } catch {
    aiStatus.textContent = "상태 확인 실패";
    dbStatus.textContent = "상태 확인 실패";
  }
}

function renderRecommendation(data) {
  const sourceLabel = data.meta?.source === "openai" ? "OpenAI 추천" : "데모 fallback 추천";
  const loggingLabel = data.meta?.logging?.stored ? "추천 기록 저장됨" : "추천 기록 미저장";
  showMessage(`${sourceLabel} · ${loggingLabel} · ${data.summary}`, false);

  const totals = data.totals || {};
  bestSavings.textContent = formatKrw(totals.bestSavings || 0);
  deliveryCost.textContent = formatKrw(totals.averageDeliveryCost || 12000);
  homeCost.textContent = formatKrw(totals.estimatedHomeCookingCost || 3500);
  savingsBarFill.style.width = `${Math.min(100, Math.round(((totals.bestSavings || 0) / 12000) * 100))}%`;

  renderPriorityIngredients(data.priorityIngredients || []);
  renderRecipes(data.recipes || []);
}

function renderPriorityIngredients(items) {
  priorityIngredients.innerHTML = "";

  if (!items.length) {
    priorityIngredients.innerHTML = '<span class="empty-state">추천 후 표시됩니다.</span>';
    return;
  }

  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    priorityIngredients.append(chip);
  }
}

function renderRecipes(recipes) {
  recipesContainer.innerHTML = "";

  for (const recipe of recipes) {
    const article = document.createElement("article");
    article.className = "recipe-card";

    const missing = recipe.missingIngredients?.length
      ? recipe.missingIngredients.map(escapeHtml).join(", ")
      : "추가 구매 없음";

    article.innerHTML = `
      <div class="recipe-topline">
        <div>
          <h3>${escapeHtml(recipe.name)}</h3>
          <div class="recipe-meta">
            <span class="tag">${recipe.cookTimeMinutes}분</span>
            <span class="tag">${difficultyLabel(recipe.difficulty)}</span>
            <span class="tag money">${formatKrw(recipe.estimatedSavings)} 절약</span>
          </div>
        </div>
      </div>
      <p>${escapeHtml(recipe.reason)}</p>
      <div>
        <strong>사용 재료</strong>
        <ul class="ingredient-list">
          ${(recipe.ownedIngredients || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
      <div>
        <strong>부족한 재료</strong>
        <p>${missing}</p>
      </div>
      <div>
        <strong>조리 순서</strong>
        <ol class="steps">
          ${(recipe.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
      </div>
    `;

    recipesContainer.append(article);
  }
}

function showMessage(text, isError) {
  message.textContent = text;
  message.classList.toggle("error", Boolean(isError));
}

function setLoading(isLoading) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "추천 생성 중" : "메뉴 추천받기";
}

function getAnonymousId() {
  const key = "naengteol_anonymous_id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const generated =
    crypto.randomUUID?.() ||
    `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

