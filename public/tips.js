const searchInput = document.querySelector("#tipSearch");
const filterButtons = [...document.querySelectorAll("[data-tip-filter]")];
const cards = [...document.querySelectorAll("[data-tip-card]")];
const tipCount = document.querySelector("#tipCount");
const tipsEmpty = document.querySelector("#tipsEmpty");
const seasonSelect = document.querySelector("#seasonSelect");
const weatherSelect = document.querySelector("#weatherSelect");
const temperatureInput = document.querySelector("#temperatureInput");
const styleRecommendation = document.querySelector("#styleRecommendation");

const STYLE_SEASONS = {
  spring: {
    label: "봄",
    summary: "일교차가 커서 얇은 겉옷을 챙기는 조합이 좋습니다.",
    items: ["긴팔 티셔츠", "가벼운 셔츠", "면바지나 데님", "얇은 재킷"]
  },
  summer: {
    label: "여름",
    summary: "통풍과 땀 관리가 핵심이라 밝고 얇은 소재를 우선합니다.",
    items: ["반팔 티셔츠", "린넨 셔츠", "반바지나 얇은 팬츠", "샌들 또는 통풍 좋은 운동화"]
  },
  autumn: {
    label: "가을",
    summary: "아침저녁 쌀쌀함에 대비해 겹쳐 입기 쉬운 옷이 편합니다.",
    items: ["긴팔 티셔츠", "니트 또는 맨투맨", "데님이나 슬랙스", "가디건 또는 바람막이"]
  },
  winter: {
    label: "겨울",
    summary: "체온 보온과 미끄럼 방지가 중요하니 안쪽 보온 레이어를 먼저 잡습니다.",
    items: ["발열 내의", "니트나 후드", "기모 하의", "패딩 또는 코트"]
  }
};

const STYLE_WEATHER = {
  sunny: {
    label: "맑음",
    items: ["모자나 선글라스", "자외선 차단제", "밝은 색 상의"]
  },
  cloudy: {
    label: "흐림",
    items: ["얇은 겉옷", "구김 적은 상의", "무난한 운동화"]
  },
  rain: {
    label: "비",
    items: ["접이식 우산", "방수 겉옷", "젖어도 티 덜 나는 어두운 하의"]
  },
  wind: {
    label: "바람",
    items: ["바람막이", "목을 덮는 이너", "잘 벗겨지지 않는 신발"]
  },
  snow: {
    label: "눈",
    items: ["미끄럼 방지 신발", "장갑", "젖어도 마르기 쉬운 겉옷"]
  }
};

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

[seasonSelect, weatherSelect, temperatureInput].filter(Boolean).forEach((element) => {
  element.addEventListener("input", renderStyleRecommendation);
  element.addEventListener("change", renderStyleRecommendation);
});

renderStyleRecommendation();
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

function renderStyleRecommendation() {
  if (!styleRecommendation || !seasonSelect || !weatherSelect || !temperatureInput) {
    return;
  }

  const seasonKey = seasonSelect.value === "auto" ? getCurrentSeason() : seasonSelect.value;
  const season = STYLE_SEASONS[seasonKey] || STYLE_SEASONS.spring;
  const weather = STYLE_WEATHER[weatherSelect.value] || STYLE_WEATHER.sunny;
  const temperature = Number(temperatureInput.value);
  const tempAdvice = getTemperatureAdvice(Number.isFinite(temperature) ? temperature : 22);
  const itemChips = uniqueValues([...season.items, ...weather.items, ...tempAdvice.items]).slice(0, 10);
  const tempLabel = Number.isFinite(temperature) ? `${temperature}°C` : "기온 미입력";

  styleRecommendation.innerHTML = `
    <div class="style-result-topline">
      <div>
        <strong>${escapeHtml(season.label)} · ${escapeHtml(weather.label)} · ${escapeHtml(tempLabel)}</strong>
        <p>${escapeHtml(season.summary)} ${escapeHtml(tempAdvice.summary)}</p>
      </div>
      <span class="tag">${escapeHtml(tempAdvice.label)}</span>
    </div>
    <div class="chip-row">
      ${itemChips.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
    </div>
    <ul class="tip-list style-tip-list">
      <li>${escapeHtml(weather.items[0])}은 오늘 외출 가방에 먼저 넣어두세요.</li>
      <li>자취방 세탁 주기를 생각해 땀이 많이 나는 날은 세탁이 쉬운 소재를 고르세요.</li>
      <li>실내 냉난방 차이가 큰 날은 벗고 입기 쉬운 겉옷을 우선하세요.</li>
    </ul>
  `;
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) {
    return "spring";
  }
  if (month >= 6 && month <= 8) {
    return "summer";
  }
  if (month >= 9 && month <= 11) {
    return "autumn";
  }
  return "winter";
}

function getTemperatureAdvice(temperature) {
  if (temperature <= 0) {
    return {
      label: "강한 보온",
      summary: "영하권에는 보온 이너와 두꺼운 겉옷 조합이 안전합니다.",
      items: ["발열 내의", "두꺼운 양말", "목도리", "장갑"]
    };
  }
  if (temperature <= 9) {
    return {
      label: "겉옷 필수",
      summary: "한 자리 기온은 체감이 낮아 긴 외출에는 두꺼운 겉옷이 필요합니다.",
      items: ["니트", "두꺼운 재킷", "긴 양말"]
    };
  }
  if (temperature <= 17) {
    return {
      label: "얇은 겹입기",
      summary: "낮과 밤 차이가 커서 가디건이나 셔츠처럼 조절 쉬운 옷이 좋습니다.",
      items: ["긴팔 이너", "가디건", "가벼운 재킷"]
    };
  }
  if (temperature <= 25) {
    return {
      label: "가벼운 외출",
      summary: "낮에는 가볍게 입되 저녁 귀가가 늦다면 얇은 겉옷 하나가 편합니다.",
      items: ["얇은 셔츠", "면바지", "가벼운 운동화"]
    };
  }
  return {
    label: "통풍 우선",
    summary: "더운 날에는 땀 배출과 세탁 편의성을 기준으로 고르는 편이 실용적입니다.",
    items: ["흡습 빠른 티셔츠", "얇은 하의", "여분 양말"]
  };
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
