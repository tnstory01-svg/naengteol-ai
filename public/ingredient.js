import { CATALOG_REVIEWED_AT, FOOD_CATALOG_SOURCES, OPTIONAL_INGREDIENT_NOTE, findCatalogItem } from "./food-catalog.js";

const root = document.querySelector("#ingredientDetail");
const title = document.querySelector("#ingredientPageTitle");
const item = findCatalogItem(new URLSearchParams(location.search).get("id"));

if (!item) renderMissing();
else renderItem(item);

function renderMissing() {
  document.title = "재료를 찾을 수 없습니다 | 자취생의 모든것";
  title.textContent = "재료를 찾을 수 없습니다";
  root.innerHTML = `
    <section class="panel missing-ingredient-card">
      <p class="eyebrow">Unknown ingredient</p>
      <h2>요청한 재료 ID가 없어요.</h2>
      <p class="muted-copy">주소를 다시 확인하거나 재료 도감에서 원하는 재료를 검색하세요.</p>
      <a class="primary-button link-button" href="./ingredients.html">재료 도감으로 돌아가기</a>
    </section>`;
}

function renderItem(value) {
  document.title = `${value.name} 보관법과 요리 | 자취생의 모든것`;
  title.textContent = value.name;
  root.innerHTML = `
    <nav class="detail-back-row" aria-label="현재 위치">
      <a class="text-link" href="./ingredients.html">← 재료 도감</a>
      <span>${escapeHtml(value.major.label)} / ${escapeHtml(value.medium.label)}</span>
    </nav>
    <section class="panel ingredient-detail-summary">
      <div class="section-heading">
        <p class="eyebrow">${escapeHtml(value.major.label)} · ${escapeHtml(value.medium.label)}</p>
        <h2>${escapeHtml(value.name)}</h2>
      </div>
      <p>${escapeHtml(value.details.summary)}</p>
      <dl class="ingredient-facts">
        <div><dt>1인분 시작량</dt><dd>${escapeHtml(value.details.servingGuide)}</dd></div>
        <div><dt>보관</dt><dd>${escapeHtml(value.details.storage)}</dd></div>
        <div><dt>안전·손질</dt><dd>${escapeHtml(value.details.safety)}</dd></div>
      </dl>
      <p class="source-scope">${escapeHtml(value.sourceScope)} · 검토일 ${escapeHtml(value.reviewedAt || CATALOG_REVIEWED_AT)}</p>
      ${renderSources(value.sourceRefs)}
    </section>
    <section aria-labelledby="recipeTitle">
      <div class="section-heading detail-heading">
        <p class="eyebrow">Original adaptations</p>
        <h2 id="recipeTitle">${escapeHtml(value.name)} 요리 3가지</h2>
      </div>
      <div class="ingredient-recipe-grid">
        ${value.recipes.map(renderRecipe).join("")}
      </div>
    </section>`;
  root.querySelector("section")?.setAttribute("aria-busy", "false");
}

function renderRecipe(recipe) {
  return `<article class="recipe-card ingredient-recipe-card">
    <div>
      <h3>${escapeHtml(recipe.name)}</h3>
      <div class="recipe-meta"><span class="tag">약 ${recipe.cookTimeMinutes}분</span><span class="tag">1인분</span></div>
    </div>
    <p>${escapeHtml(recipe.reason)}</p>
    ${renderIngredientGroup("필수 재료", recipe.requiredIngredients)}
    ${renderIngredientGroup("선택 재료", recipe.optionalIngredients)}
    ${recipe.optionalIngredients.length ? `<p class="muted-copy">${escapeHtml(OPTIONAL_INGREDIENT_NOTE)}</p>` : ""}
    <div><strong>조리도구</strong><p>${recipe.equipment.map(escapeHtml).join(", ")}</p></div>
    <div><strong>조리 순서</strong><ol class="steps">${recipe.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div>
    <div><strong>완료 기준</strong><p>${escapeHtml(recipe.doneness)}</p></div>
    <div class="recipe-notes">
      <p>${escapeHtml(recipe.adaptationNote)}</p>
      ${recipe.estimateNote ? `<p>${escapeHtml(recipe.estimateNote)}</p>` : ""}
      <p>${escapeHtml(recipe.sourceScope)}</p>
      <p>검토일 ${escapeHtml(recipe.reviewedAt)}</p>
      ${renderSources(recipe.sourceRefs)}
    </div>
  </article>`;
}

function renderIngredientGroup(label, entries) {
  return `<div><strong>${label}</strong><ul class="ingredient-list">${entries.length ? entries.map((entry) => `<li>${escapeHtml(entry.name)} · ${escapeHtml(entry.amount)}</li>`).join("") : '<li class="empty-state">없음</li>'}</ul></div>`;
}

function renderSources(refs) {
  const links = [...new Set(refs || [])].map((ref) => {
    const source = FOOD_CATALOG_SOURCES[ref];
    return source ? `<li><a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a><span>${escapeHtml(source.scope)}</span></li>` : "";
  }).filter(Boolean).join("");
  return links ? `<div class="source-block"><strong>근거와 적용 범위</strong><ul>${links}</ul></div>` : "";
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
