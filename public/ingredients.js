import { flattenCatalog } from "./food-catalog.js";

const search = document.querySelector("#ingredientSearch");
const container = document.querySelector("#ingredientCatalog");
const count = document.querySelector("#catalogCount");
const empty = document.querySelector("#catalogEmpty");
const items = flattenCatalog();

render(items);
search.addEventListener("input", () => {
  const query = normalize(search.value);
  const filtered = query
    ? items.filter((item) => searchableText(item).includes(query))
    : items;
  render(filtered);
});

function render(results) {
  container.innerHTML = "";
  count.textContent = `전체 ${items.length}개 중 ${results.length}개 표시`;
  empty.classList.toggle("hidden", results.length > 0);
  for (const item of results) {
    const article = document.createElement("article");
    article.className = "ingredient-catalog-card";
    article.innerHTML = `
      <div>
        <span class="ingredient-breadcrumb">${escapeHtml(item.major.label)} · ${escapeHtml(item.medium.label)}</span>
        <h2><a href="./ingredient.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a></h2>
      </div>
      <p>${escapeHtml(item.details.summary)}</p>
      <div class="chip-row" aria-label="요리 예시">
        ${item.recipes.map((recipe) => `<span class="chip">${escapeHtml(recipe.name)}</span>`).join("")}
      </div>
      <a class="secondary-button link-button" href="./ingredient.html?id=${encodeURIComponent(item.id)}" aria-label="${escapeHtml(item.name)} 상세 보기">보관법과 요리 보기</a>
    `;
    container.append(article);
  }
}

function searchableText(item) {
  return normalize([item.name, ...item.aliases, item.major.label, item.medium.label, ...item.recipes.map((recipe) => recipe.name)].join(" "));
}

function normalize(value) {
  return String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
