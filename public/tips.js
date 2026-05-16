const searchInput = document.querySelector("#tipSearch");
const filterButtons = [...document.querySelectorAll("[data-tip-filter]")];
const cards = [...document.querySelectorAll("[data-tip-card]")];
const tipCount = document.querySelector("#tipCount");
const tipsEmpty = document.querySelector("#tipsEmpty");

let activeFilter = "all";

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.tipFilter || "all";
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderTips();
  });
});

if (searchInput) {
  searchInput.addEventListener("input", renderTips);
}

renderTips();

function renderTips() {
  const query = normalize(searchInput?.value || "");
  let visibleCount = 0;

  cards.forEach((card) => {
    const categories = String(card.dataset.tipCategory || "").split(/\s+/);
    const haystack = normalize(`${card.textContent || ""} ${card.dataset.tipKeywords || ""}`);
    const matchesFilter = activeFilter === "all" || categories.includes(activeFilter);
    const matchesQuery = !query || haystack.includes(query);
    const visible = matchesFilter && matchesQuery;

    card.classList.toggle("hidden", !visible);
    if (visible) {
      visibleCount += 1;
    }
  });

  if (tipCount) {
    tipCount.textContent = `${visibleCount}개`;
  }
  if (tipsEmpty) {
    tipsEmpty.classList.toggle("hidden", visibleCount !== 0);
  }
}

function normalize(value) {
  return String(value).trim().toLocaleLowerCase("ko-KR");
}
