const tool = document.body.dataset.tool;

function initSupportWidget() {
  if (document.querySelector("#supportWidget")) {
    return;
  }

  const widget = document.createElement("section");
  widget.id = "supportWidget";
  widget.className = "support-widget";
  widget.innerHTML = `
    <button type="button" id="supportWidgetToggle" class="support-widget-toggle" aria-expanded="false">
      문의
    </button>
    <div id="supportWidgetPanel" class="support-widget-panel hidden" aria-label="문의 챗봇">
      <div class="support-widget-head">
        <strong>문의 챗봇</strong>
        <button type="button" id="supportWidgetClose" class="secondary-button compact-button">닫기</button>
      </div>
      <div id="supportWidgetMessages" class="chat-window compact-chat" aria-live="polite"></div>
      <form id="supportWidgetForm" class="chat-form">
        <label for="supportWidgetInput">질문</label>
        <div class="chat-input-row">
          <input id="supportWidgetInput" name="message" type="text" maxlength="500" autocomplete="off" required />
          <button type="submit" class="primary-button">전송</button>
        </div>
      </form>
    </div>
  `;
  document.body.append(widget);

  const toggle = widget.querySelector("#supportWidgetToggle");
  const close = widget.querySelector("#supportWidgetClose");
  const panel = widget.querySelector("#supportWidgetPanel");
  const form = widget.querySelector("#supportWidgetForm");
  const input = widget.querySelector("#supportWidgetInput");
  const messages = widget.querySelector("#supportWidgetMessages");

  appendChatMessage(messages, "bot", "어떤 화면에서든 질문할 수 있습니다. 검색 가능한 질문은 관련 링크와 함께 답합니다.");

  toggle.addEventListener("click", () => {
    const visible = panel.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", String(!visible));
    if (!visible) {
      input.focus();
    }
  });

  close.addEventListener("click", () => {
    panel.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      return;
    }
    input.value = "";
    await sendChatMessage(messages, text);
  });
}

function initChatbot() {
  const form = document.querySelector("#chatForm");
  const input = document.querySelector("#chatInput");
  const messages = document.querySelector("#chatMessages");

  appendChatMessage(
    messages,
    "bot",
    "로그인, 냉장고 재료 털기, 재료 DB, 관리자 기능, 메모장, 자취 장바구니, 놀곳추천에 대해 물어보세요."
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      return;
    }
    input.value = "";
    await sendChatMessage(messages, text);
  });

  document.querySelectorAll("[data-chat-prompt]").forEach((button) => {
    button.addEventListener("click", async () => {
      await sendChatMessage(messages, button.dataset.chatPrompt);
    });
  });
}

async function sendChatMessage(messages, text) {
  appendChatMessage(messages, "user", text);
  const pending = appendChatMessage(messages, "bot", "검색과 기본 도움말을 확인하고 있습니다.");

  try {
    const response = await fetch("/api/support/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({ message: text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "문의 응답을 만들 수 없습니다.");
    }
    pending.querySelector("p").textContent = data.answer;
    renderSuggestions(pending, data.suggestions || []);
    renderChatLinks(pending, data.links || []);
  } catch (error) {
    pending.querySelector("p").textContent = `${error.message} 잠시 후 다시 시도해주세요.`;
  }

  messages.scrollTop = messages.scrollHeight;
}

function appendChatMessage(container, sender, text) {
  const row = document.createElement("div");
  row.className = `chat-message ${sender}`;
  row.innerHTML = `
    <span>${sender === "user" ? "나" : "봇"}</span>
    <p>${escapeHtml(text)}</p>
  `;
  container.append(row);
  container.scrollTop = container.scrollHeight;
  return row;
}

function renderSuggestions(container, suggestions) {
  if (!suggestions.length) {
    return;
  }
  const chips = document.createElement("div");
  chips.className = "chat-suggestions";
  chips.innerHTML = suggestions.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  container.append(chips);
}

function renderChatLinks(container, links) {
  if (!links.length) {
    return;
  }

  const linkRow = document.createElement("div");
  linkRow.className = "chat-link-row";
  linkRow.innerHTML = links
    .map(
      (link) =>
        `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a>`
    )
    .join("");
  container.append(linkRow);
}

function initNotes() {
  const form = document.querySelector("#noteForm");
  const noteId = document.querySelector("#noteId");
  const title = document.querySelector("#noteTitle");
  const body = document.querySelector("#noteBody");
  const list = document.querySelector("#noteList");
  const search = document.querySelector("#noteSearch");
  const newButton = document.querySelector("#newNoteButton");
  const deleteButton = document.querySelector("#deleteNoteButton");
  const message = document.querySelector("#noteMessage");
  let notes = loadNotes();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const existingId = noteId.value;
    const existing = notes.find((note) => note.id === existingId);
    const record = createNoteRecord({
      id: existingId || undefined,
      title: title.value.trim(),
      body: body.value.trim(),
      pinned: existing?.pinned || false,
      createdAt: existing?.createdAt
    });

    notes = [record, ...notes.filter((note) => note.id !== record.id)];
    saveNotes(notes);
    selectNote(record);
    renderNotes();
    setInlineMessage(message, "메모가 저장되었습니다.", false);
  });

  newButton.addEventListener("click", () => {
    clearNoteForm();
    setInlineMessage(message, "", false);
  });

  deleteButton.addEventListener("click", () => {
    if (!noteId.value) {
      return;
    }
    notes = notes.filter((note) => note.id !== noteId.value);
    saveNotes(notes);
    clearNoteForm();
    renderNotes();
    setInlineMessage(message, "메모를 삭제했습니다.", false);
  });

  search.addEventListener("input", renderNotes);

  list.addEventListener("click", (event) => {
    const noteButton = event.target.closest("[data-note-id]");
    const pinButton = event.target.closest("[data-pin-note]");

    if (pinButton) {
      const target = notes.find((note) => note.id === pinButton.dataset.pinNote);
      if (target) {
        target.pinned = !target.pinned;
        target.updatedAt = new Date().toISOString();
        saveNotes(notes);
        renderNotes();
      }
      return;
    }

    if (noteButton) {
      const target = notes.find((note) => note.id === noteButton.dataset.noteId);
      if (target) {
        selectNote(target);
      }
    }
  });

  renderNotes();

  function selectNote(note) {
    noteId.value = note.id;
    title.value = note.title;
    body.value = note.body;
    deleteButton.disabled = false;
  }

  function clearNoteForm() {
    noteId.value = "";
    title.value = "";
    body.value = "";
    deleteButton.disabled = true;
    title.focus();
  }

  function renderNotes() {
    const query = search.value.trim().toLowerCase();
    const visible = notes
      .filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));

    list.innerHTML = "";
    if (!visible.length) {
      list.innerHTML = '<span class="empty-state">저장된 메모가 없습니다.</span>';
      return;
    }

    for (const note of visible) {
      const row = document.createElement("div");
      row.className = "data-row note-row";
      row.innerHTML = `
        <button type="button" class="note-select" data-note-id="${escapeAttr(note.id)}">
          <strong>${escapeHtml(note.pinned ? `★ ${note.title}` : note.title)}</strong>
          <span>${escapeHtml(note.body.slice(0, 90) || "내용 없음")}</span>
          <span>${escapeHtml(formatDateTime(note.updatedAt))}</span>
        </button>
        <button type="button" class="secondary-button compact-button" data-pin-note="${escapeAttr(note.id)}">${
          note.pinned ? "고정 해제" : "고정"
        }</button>
      `;
      list.append(row);
    }
  }
}

function initShopping() {
  const categories = document.querySelector("#shoppingCategories");
  const basketList = document.querySelector("#basketList");
  const basketCount = document.querySelector("#basketCount");
  const addBasketNoteButton = document.querySelector("#addBasketNoteButton");
  const clearButton = document.querySelector("#clearBasketButton");
  const customForm = document.querySelector("#customShoppingForm");
  const customInput = document.querySelector("#customShoppingInput");
  const message = document.querySelector("#shoppingMessage");
  let selected = new Set(readJsonStorage("fridge_ingredients_basket", []));
  const openCategories = new Set(["category-0"]);
  const openGroups = new Set(["category-0-group-0"]);

  renderShopping();

  categories.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-shopping-item]");
    if (!checkbox) {
      return;
    }
    if (checkbox.checked) {
      selected.add(checkbox.dataset.shoppingItem);
    } else {
      selected.delete(checkbox.dataset.shoppingItem);
    }
    saveBasket();
    renderBasket();
  });

  categories.addEventListener("click", (event) => {
    const categoryToggle = event.target.closest("[data-shopping-category-toggle]");
    if (categoryToggle) {
      toggleSet(openCategories, categoryToggle.dataset.shoppingCategoryToggle);
      renderShopping();
      return;
    }

    const groupToggle = event.target.closest("[data-shopping-group-toggle]");
    if (groupToggle) {
      toggleSet(openGroups, groupToggle.dataset.shoppingGroupToggle);
      renderShopping();
      return;
    }

    const button = event.target.closest("[data-shopping-memo]");
    if (!button) {
      return;
    }

    const item = allShoppingItems().find((entry) => entry.id === button.dataset.shoppingMemo);
    if (!item) {
      return;
    }

    addShoppingNote(item);
    setInlineMessage(message, `${item.name} 항목을 메모장에 추가했습니다.`, false);
  });

  addBasketNoteButton.addEventListener("click", () => {
    const items = getSelectedShoppingItems();
    if (!items.length) {
      setInlineMessage(message, "메모장에 추가할 필수품을 먼저 체크해주세요.", true);
      return;
    }

    addBasketShoppingNote(items);
    setInlineMessage(message, `체크한 필수품 ${items.length}개를 메모장에 추가했습니다.`, false);
  });

  clearButton.addEventListener("click", () => {
    selected = new Set();
    saveBasket();
    renderShopping();
  });

  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = customInput.value.trim();
    if (!query) {
      setInlineMessage(message, "찾고 싶은 물품명을 입력해주세요.", true);
      return;
    }

    addCustomShoppingNote(query);
    customInput.value = "";
    setInlineMessage(message, `${query} 검색 메모를 메모장에 추가했습니다.`, false);
  });

  function renderShopping() {
    categories.innerHTML = SHOPPING_CATEGORIES.map(
      (category, categoryIndex) => {
        const categoryKey = `category-${categoryIndex}`;
        const isCategoryOpen = openCategories.has(categoryKey);
        const itemCount = category.groups.reduce((sum, group) => sum + group.items.length, 0);
        const checkedCount = category.groups
          .flatMap((group) => group.items)
          .filter((item) => selected.has(item.id)).length;

        return `
        <section class="shopping-category">
          <button
            type="button"
            class="shopping-category-toggle"
            data-shopping-category-toggle="${escapeAttr(categoryKey)}"
            aria-expanded="${String(isCategoryOpen)}"
          >
            <span>
              <strong>${escapeHtml(category.label)}</strong>
              <small>${escapeHtml(category.description)}</small>
            </span>
            <em>${checkedCount}/${itemCount} 선택 · ${isCategoryOpen ? "접기" : "열기"}</em>
          </button>
          <div class="shopping-category-body ${isCategoryOpen ? "" : "hidden"}">
            <div class="shopping-group-grid">
              ${category.groups
                .map((group, groupIndex) => {
                  const groupKey = `${categoryKey}-group-${groupIndex}`;
                  const isGroupOpen = openGroups.has(groupKey);
                  const groupCheckedCount = group.items.filter((item) => selected.has(item.id)).length;

                  return `
                    <section class="shopping-group">
                      <button
                        type="button"
                        class="shopping-group-toggle"
                        data-shopping-group-toggle="${escapeAttr(groupKey)}"
                        aria-expanded="${String(isGroupOpen)}"
                      >
                        <span>${escapeHtml(group.label)}</span>
                        <em>${groupCheckedCount}/${group.items.length} 선택 · ${isGroupOpen ? "접기" : "열기"}</em>
                      </button>
                      <div class="shopping-group-body ${isGroupOpen ? "" : "hidden"}">
                        <div class="shopping-item-grid">
                          ${group.items
                            .map((item) =>
                              renderShoppingItem({
                                ...item,
                                categoryLabel: category.label,
                                groupLabel: group.label
                              })
                            )
                            .join("")}
                        </div>
                      </div>
                    </section>
                  `;
                })
                .join("")}
            </div>
          </div>
        </section>
      `;
      }
    ).join("");
    renderBasket();
  }

  function renderShoppingItem(item) {
    const checked = selected.has(item.id) ? "checked" : "";
    const links = createShoppingLinks(item.query)
      .map(
        (link) =>
          `<a class="shop-link" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            link.name
          )}</a>`
      )
      .join("");
    return `
      <article class="shopping-item">
        <label class="shopping-check">
          <input type="checkbox" data-shopping-item="${escapeAttr(item.id)}" ${checked} />
          <span>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.note)}</small>
          </span>
        </label>
        <div class="shop-link-row">${links}</div>
        <button type="button" class="secondary-button compact-button" data-shopping-memo="${escapeAttr(
          item.id
        )}">메모장에 추가</button>
      </article>
    `;
  }

  function renderBasket() {
    const items = getSelectedShoppingItems();
    basketCount.textContent = `${items.length}개`;
    addBasketNoteButton.disabled = items.length === 0;
    clearButton.disabled = items.length === 0;
    basketList.innerHTML = "";

    if (!items.length) {
      basketList.innerHTML = '<span class="empty-state">체크한 필수품이 없습니다.</span>';
      return;
    }

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "data-row";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.categoryLabel)} · ${escapeHtml(item.note)}</span>
        </div>
      `;
      basketList.append(row);
    }
  }

  function saveBasket() {
    localStorage.setItem("fridge_ingredients_basket", JSON.stringify([...selected]));
  }

  function getSelectedShoppingItems() {
    return allShoppingItems().filter((item) => selected.has(item.id));
  }
}

function allShoppingItems() {
  return SHOPPING_CATEGORIES.flatMap((category) =>
    category.groups.flatMap((group) =>
      group.items.map((item) => ({
        ...item,
        categoryLabel: category.label,
        groupLabel: group.label
      }))
    )
  );
}

function addShoppingNote(item) {
  addNote({
    title: `찾아볼 물품: ${item.name}`,
    body: [
      `분야: ${item.categoryLabel} > ${item.groupLabel}`,
      `검색어: ${item.query}`,
      `메모: ${item.note}`,
      "",
      ...createShoppingLinks(item.query).map((link) => `${link.name}: ${link.url}`)
    ].join("\n")
  });
}

function addBasketShoppingNote(items) {
  addNote({
    title: "자취 장바구니",
    body: [
      "사야할 품목:",
      ...items.map((item, index) => `${index + 1}. ${item.name}`)
    ].join("\n")
  });
}

function addCustomShoppingNote(query) {
  addNote({
    title: `추가로 찾을 물품: ${query}`,
    body: [
      `검색어: ${query}`,
      "구매 전 가격, 배송비, 리뷰, 사이즈를 확인하세요.",
      "",
      ...createShoppingLinks(query).map((link) => `${link.name}: ${link.url}`)
    ].join("\n")
  });
}

function loadNotes() {
  return readJsonStorage("fridge_ingredients_notes", []);
}

function saveNotes(notes) {
  localStorage.setItem("fridge_ingredients_notes", JSON.stringify(notes));
}

function addNote(input) {
  const notes = loadNotes();
  notes.unshift(createNoteRecord(input));
  saveNotes(notes);
}

function createNoteRecord(input) {
  const now = new Date().toISOString();
  return {
    id: input.id || createId("note"),
    title: normalizeClientText(input.title, 80) || "제목 없는 메모",
    body: normalizeClientBody(input.body, 4000),
    pinned: Boolean(input.pinned),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

const SHOPPING_CATEGORIES = [
  {
    label: "1. 식비 절약 식재료",
    description: "밥, 면, 단백질, 저장식품처럼 배달을 줄이는 데 바로 쓰는 기본 재료입니다.",
    groups: [
      {
        label: "주식과 탄수화물",
        items: [
          shoppingItem("food-rice", "쌀", "집밥의 기준이 되는 가장 오래 쓰는 주식입니다.", "자취 쌀 5kg"),
          shoppingItem("food-instant-rice", "즉석밥", "밥솥이 없거나 바쁜 날 비상식으로 좋습니다.", "즉석밥 24개"),
          shoppingItem("food-ramen", "봉지라면", "야식과 비상식으로 활용도가 높습니다.", "봉지라면 멀티팩"),
          shoppingItem("food-noodle", "소면/국수", "간장국수, 비빔국수, 잔치국수로 빠르게 조리합니다.", "소면 국수"),
          shoppingItem("food-pasta", "파스타면", "소스와 냉장고 재료만 있으면 한 끼가 됩니다.", "파스타면")
        ]
      },
      {
        label: "단백질과 저장 반찬",
        items: [
          shoppingItem("food-eggs", "계란", "덮밥, 볶음밥, 국, 토스트에 모두 쓰입니다.", "계란 30구"),
          shoppingItem("food-tofu", "두부", "찌개, 구이, 샐러드로 저렴하게 단백질을 채웁니다.", "두부"),
          shoppingItem("food-tuna", "참치캔", "밥과 바로 먹거나 김치찌개에 넣기 좋습니다.", "참치캔"),
          shoppingItem("food-kimchi", "김치", "반찬, 찌개, 볶음밥의 기본 재료입니다.", "포기김치 자취"),
          shoppingItem("food-seaweed", "조미김", "간단한 밥반찬과 도시락에 편합니다.", "조미김")
        ]
      }
    ]
  },
  {
    label: "2. 조리 도구와 소형 주방기기",
    description: "최소한의 조리와 데우기를 가능하게 만드는 도구입니다.",
    groups: [
      {
        label: "기본 조리 도구",
        items: [
          shoppingItem("cook-pan", "프라이팬", "계란, 볶음밥, 냉동식품 조리에 필요합니다.", "프라이팬 24cm"),
          shoppingItem("cook-pot", "냄비", "라면, 국, 찌개, 삶기 조리에 씁니다.", "자취 냄비"),
          shoppingItem("cook-knife", "식도", "재료 손질용으로 한 자루는 필요합니다.", "주방 식도"),
          shoppingItem("cook-board", "도마", "채소와 고기를 분리하기 쉬운 제품이 좋습니다.", "도마 세트"),
          shoppingItem("cook-scissors", "주방가위", "김치, 고기, 봉지 개봉까지 자주 씁니다.", "주방가위")
        ]
      },
      {
        label: "조리 보조와 전기 제품",
        items: [
          shoppingItem("cook-spatula", "뒤집개", "팬 조리에 기본으로 필요합니다.", "실리콘 뒤집개"),
          shoppingItem("cook-tongs", "집게", "면, 고기, 냉동식품을 집을 때 편합니다.", "주방 집게"),
          shoppingItem("cook-kettle", "전기포트", "물 끓이기와 컵라면에 가장 빠릅니다.", "전기포트"),
          shoppingItem("cook-rice-cooker", "소형 밥솥", "밥을 자주 먹으면 즉석밥보다 장기적으로 절약됩니다.", "1인용 밥솥"),
          shoppingItem("cook-microwave-container", "전자레인지 용기", "남은 음식 데우기와 간편 조리에 씁니다.", "전자레인지 용기")
        ]
      }
    ]
  },
  {
    label: "3. 식기와 보관 소모품",
    description: "먹고 보관하고 버리는 일상 흐름을 만드는 기본 품목입니다.",
    groups: [
      {
        label: "식기 세트",
        items: [
          shoppingItem("dining-bowl", "밥그릇/국그릇", "밥과 국을 먹는 기본 식기입니다.", "밥그릇 국그릇 세트"),
          shoppingItem("dining-plate", "접시", "반찬, 토스트, 간단한 요리에 씁니다.", "접시 세트"),
          shoppingItem("dining-cup", "컵", "물컵과 음료컵을 겸할 수 있습니다.", "유리컵 세트"),
          shoppingItem("dining-cutlery", "수저세트", "숟가락, 젓가락, 포크를 기본으로 둡니다.", "수저세트"),
          shoppingItem("dining-dish-rack", "식기건조대", "설거지 후 물 빠짐과 정리에 필요합니다.", "식기건조대")
        ]
      },
      {
        label: "보관과 주방 소모품",
        items: [
          shoppingItem("storage-container", "밀폐용기", "남은 음식과 손질 재료를 보관합니다.", "밀폐용기 세트"),
          shoppingItem("storage-zipbag", "지퍼백", "냉동 소분과 소품 정리에 씁니다.", "지퍼백"),
          shoppingItem("storage-wrap", "랩", "그릇 덮기와 재료 보관에 필요합니다.", "주방 랩"),
          shoppingItem("storage-foil", "종이호일/쿠킹호일", "에어프라이어, 팬 조리, 포장에 유용합니다.", "종이호일 쿠킹호일"),
          shoppingItem("storage-kitchen-towel", "키친타월", "물기 제거와 기름 닦기에 자주 씁니다.", "키친타월")
        ]
      }
    ]
  },
  {
    label: "4. 양념과 기본 조미료",
    description: "같은 재료도 맛을 바꿔 오래 먹게 해주는 최소 조미료입니다.",
    groups: [
      {
        label: "기본 간",
        items: [
          shoppingItem("season-salt", "소금", "모든 기본 간의 시작입니다.", "맛소금 천일염"),
          shoppingItem("season-sugar", "설탕", "볶음, 조림, 소스에 씁니다.", "설탕"),
          shoppingItem("season-soy", "간장", "계란밥, 볶음, 조림에 가장 많이 씁니다.", "진간장"),
          shoppingItem("season-oil", "식용유", "팬 조리 기본 재료입니다.", "식용유"),
          shoppingItem("season-vinegar", "식초", "비빔, 무침, 청소 보조까지 활용됩니다.", "식초")
        ]
      },
      {
        label: "한국식과 간편 소스",
        items: [
          shoppingItem("season-sesame-oil", "참기름", "밥, 비빔, 나물의 마무리에 좋습니다.", "참기름"),
          shoppingItem("season-gochujang", "고추장", "비빔밥, 볶음, 찌개에 씁니다.", "고추장"),
          shoppingItem("season-doenjang", "된장", "된장국과 찌개 기본입니다.", "된장"),
          shoppingItem("season-pepper", "후추", "계란, 고기, 볶음요리에 씁니다.", "후추"),
          shoppingItem("season-mayo", "마요네즈", "참치마요, 샌드위치, 소스에 편합니다.", "마요네즈")
        ]
      }
    ]
  },
  {
    label: "5. 청소와 분리수거",
    description: "입주 첫 주부터 바로 필요한 바닥, 주방, 욕실 청소 품목입니다.",
    groups: [
      {
        label: "바닥과 먼지",
        items: [
          shoppingItem("clean-broom", "빗자루", "작은 먼지와 머리카락을 빠르게 정리합니다.", "빗자루 쓰레받기"),
          shoppingItem("clean-dustpan", "쓰레받기", "빗자루와 같이 필요합니다.", "쓰레받기"),
          shoppingItem("clean-mop", "밀대걸레", "바닥 물걸레질에 편합니다.", "밀대걸레"),
          shoppingItem("clean-floor-wipes", "청소포", "걸레 세탁이 번거로운 날 쓰기 좋습니다.", "물걸레 청소포"),
          shoppingItem("clean-vacuum", "소형 청소기", "머리카락과 먼지를 자주 치우는 데 좋습니다.", "소형 청소기")
        ]
      },
      {
        label: "쓰레기와 세제",
        items: [
          shoppingItem("clean-trash-can", "쓰레기통", "주방과 방에 하나씩 두면 편합니다.", "자취 쓰레기통"),
          shoppingItem("clean-trash-bag", "종량제봉투", "지역 규격을 확인해서 구매해야 합니다.", "종량제봉투"),
          shoppingItem("clean-recycle-bag", "분리수거봉투", "플라스틱, 캔, 종이 분리에 필요합니다.", "분리수거봉투"),
          shoppingItem("clean-kitchen-cleaner", "주방세정제", "기름때와 싱크대 청소에 씁니다.", "주방세정제"),
          shoppingItem("clean-bath-cleaner", "욕실세정제", "물때와 곰팡이 예방에 필요합니다.", "욕실세정제")
        ]
      }
    ]
  },
  {
    label: "6. 세탁과 의류관리",
    description: "빨래, 건조, 보풀 제거, 간단 수선을 위한 품목입니다.",
    groups: [
      {
        label: "세탁 기본",
        items: [
          shoppingItem("laundry-detergent", "세탁세제", "첫 빨래 전에 반드시 필요합니다.", "액체 세탁세제"),
          shoppingItem("laundry-softener", "섬유유연제", "수건과 옷 냄새 관리에 씁니다.", "섬유유연제"),
          shoppingItem("laundry-net", "세탁망", "속옷과 니트 손상을 줄입니다.", "세탁망"),
          shoppingItem("laundry-basket", "빨래바구니", "세탁 전후 옷을 분리해둡니다.", "빨래바구니"),
          shoppingItem("laundry-drying-rack", "빨래건조대", "자취방에는 접이식이 효율적입니다.", "접이식 빨래건조대")
        ]
      },
      {
        label: "의류 정리와 관리",
        items: [
          shoppingItem("laundry-hanger", "옷걸이", "입주 직후 옷 정리에 필요합니다.", "논슬립 옷걸이"),
          shoppingItem("laundry-lint-roller", "돌돌이", "먼지와 머리카락 제거에 편합니다.", "테이프 클리너 돌돌이"),
          shoppingItem("laundry-stain", "얼룩제거제", "음식 얼룩을 바로 처리할 때 좋습니다.", "얼룩제거제"),
          shoppingItem("laundry-steamer", "스팀다리미", "셔츠와 외출복 주름 관리에 씁니다.", "핸디 스팀다리미"),
          shoppingItem("laundry-sewing", "반짇고리", "단추와 작은 올 풀림을 직접 처리합니다.", "반짇고리")
        ]
      }
    ]
  },
  {
    label: "7. 욕실과 개인 위생",
    description: "매일 쓰는 샤워, 양치, 화장실 관리 기본 품목입니다.",
    groups: [
      {
        label: "개인 위생",
        items: [
          shoppingItem("bath-toilet-paper", "화장지", "떨어지면 가장 곤란한 필수품입니다.", "두루마리 화장지"),
          shoppingItem("bath-towel", "수건", "세탁 주기를 고려해 여러 장 준비합니다.", "수건 세트"),
          shoppingItem("bath-toothbrush", "칫솔", "여분까지 두면 좋습니다.", "칫솔 세트"),
          shoppingItem("bath-toothpaste", "치약", "양치 기본 소모품입니다.", "치약"),
          shoppingItem("bath-hand-soap", "핸드워시", "화장실과 주방 손 씻기에 씁니다.", "핸드워시")
        ]
      },
      {
        label: "샤워와 화장실 관리",
        items: [
          shoppingItem("bath-shampoo", "샴푸", "개인 두피 타입에 맞춰 고릅니다.", "샴푸"),
          shoppingItem("bath-bodywash", "바디워시", "샤워 기본품입니다.", "바디워시"),
          shoppingItem("bath-slippers", "욕실화", "미끄럼 방지와 위생에 필요합니다.", "욕실화"),
          shoppingItem("bath-toilet-brush", "변기솔", "화장실 청소 기본 도구입니다.", "변기솔"),
          shoppingItem("bath-drain-cleaner", "배수구 클리너", "머리카락과 냄새 관리를 돕습니다.", "배수구 클리너")
        ]
      }
    ]
  },
  {
    label: "8. 침구와 수면 환경",
    description: "잠을 안정적으로 자고 계절을 버티기 위한 기본 세팅입니다.",
    groups: [
      {
        label: "침구 기본",
        items: [
          shoppingItem("sleep-mattress-pad", "매트리스 패드", "매트리스 위에 깔아 세탁과 관리가 쉽습니다.", "매트리스 패드"),
          shoppingItem("sleep-sheet", "침대 시트", "교체용까지 있으면 세탁 주기가 편합니다.", "침대 시트"),
          shoppingItem("sleep-pillow", "베개", "수면 자세에 맞는 높이가 중요합니다.", "베개"),
          shoppingItem("sleep-blanket", "이불", "계절에 맞는 두께를 준비합니다.", "이불"),
          shoppingItem("sleep-protector", "방수 매트리스 커버", "오염과 습기에서 매트리스를 보호합니다.", "방수 매트리스 커버")
        ]
      },
      {
        label: "수면 보조 환경",
        items: [
          shoppingItem("sleep-curtain", "암막커튼", "빛 차단과 냉난방 보조에 좋습니다.", "암막커튼"),
          shoppingItem("sleep-lamp", "침대 옆 조명", "밤에 큰 불을 켜지 않아도 됩니다.", "침대 조명"),
          shoppingItem("sleep-humidifier", "가습기", "건조한 계절에 목과 피부 관리에 좋습니다.", "미니 가습기"),
          shoppingItem("sleep-fan", "선풍기/서큘레이터", "환기와 여름 수면에 필요합니다.", "서큘레이터"),
          shoppingItem("sleep-eye-mask", "수면안대", "빛이 많은 방에서 유용합니다.", "수면안대")
        ]
      }
    ]
  },
  {
    label: "9. 수납과 공간 정리",
    description: "작은 방에서 물건을 찾기 쉽게 유지하는 정리 품목입니다.",
    groups: [
      {
        label: "큰 수납",
        items: [
          shoppingItem("organize-box", "수납박스", "계절 옷과 잡동사니를 나눠 보관합니다.", "수납박스"),
          shoppingItem("organize-shelf", "선반", "바닥 공간을 줄이고 세로 수납을 늘립니다.", "조립식 선반"),
          shoppingItem("organize-drawer", "서랍장", "속옷, 양말, 생활용품을 나눕니다.", "플라스틱 서랍장"),
          shoppingItem("organize-closet", "옷장 정리함", "옷장 안 공간을 칸으로 나눕니다.", "옷장 정리함"),
          shoppingItem("organize-shoe-rack", "신발장/신발정리대", "현관을 좁아 보이지 않게 합니다.", "신발정리대")
        ]
      },
      {
        label: "작은 정리",
        items: [
          shoppingItem("organize-hook", "접착식 후크", "가방, 열쇠, 수건을 걸기 좋습니다.", "접착식 후크"),
          shoppingItem("organize-cable", "케이블타이/정리클립", "충전선과 멀티탭 주변을 정리합니다.", "케이블 정리 클립"),
          shoppingItem("organize-label", "라벨테이프", "수납함 내용물을 표시합니다.", "라벨테이프"),
          shoppingItem("organize-document", "서류파일", "계약서, 보증금 관련 서류를 보관합니다.", "서류파일"),
          shoppingItem("organize-tray", "현관 트레이", "열쇠와 카드 지갑을 한곳에 둡니다.", "현관 트레이")
        ]
      }
    ]
  },
  {
    label: "10. 안전, 전기, 상비약",
    description: "사고 예방과 응급 상황에 대비하는 자취방 운영 품목입니다.",
    groups: [
      {
        label: "전기와 안전",
        items: [
          shoppingItem("safe-power-strip", "과부하 차단 멀티탭", "전기 제품을 안전하게 연결합니다.", "과부하 차단 멀티탭"),
          shoppingItem("safe-flashlight", "손전등", "정전이나 야간 점검에 필요합니다.", "LED 손전등"),
          shoppingItem("safe-battery", "건전지", "리모컨, 시계, 손전등 여분입니다.", "AA AAA 건전지"),
          shoppingItem("safe-extinguisher", "소화기", "주방 화재 대비용으로 준비합니다.", "가정용 소화기"),
          shoppingItem("safe-smoke", "화재감지기", "설치 여부를 확인하고 부족하면 보완합니다.", "가정용 화재감지기")
        ]
      },
      {
        label: "응급과 수리",
        items: [
          shoppingItem("safe-first-aid", "구급함", "상처 소독과 밴드 보관에 필요합니다.", "구급함 세트"),
          shoppingItem("safe-medicine", "상비약", "두통약, 소화제, 감기약을 기본으로 둡니다.", "상비약 세트"),
          shoppingItem("safe-thermometer", "체온계", "아플 때 상태 판단에 유용합니다.", "전자 체온계"),
          shoppingItem("safe-toolkit", "공구세트", "나사 조임, 조립, 간단 수리에 씁니다.", "가정용 공구세트"),
          shoppingItem("safe-doorstop", "도어스토퍼", "환기나 짐 옮길 때 문 고정에 편합니다.", "도어스토퍼")
        ]
      }
    ]
  }
];

function shoppingItem(id, name, note, query) {
  return { id, name, note, query };
}

function createShoppingLinks(query) {
  const encoded = encodeURIComponent(query);
  return [
    {
      name: "네이버쇼핑",
      url: `https://search.shopping.naver.com/search/all?query=${encoded}`
    },
    {
      name: "쿠팡",
      url: `https://www.coupang.com/np/search?q=${encoded}`
    },
    {
      name: "11번가",
      url: `https://search.11st.co.kr/Search.tmall?kwd=${encoded}`
    },
    {
      name: "G마켓",
      url: `https://browse.gmarket.co.kr/search?keyword=${encoded}`
    }
  ];
}

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function toggleSet(set, value) {
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
}

function createId(prefix) {
  return crypto.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeClientText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeClientBody(value, maxLength) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxLength);
}

function setInlineMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("error", Boolean(isError));
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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

initSupportWidget();

if (tool === "chatbot") {
  initChatbot();
}

if (tool === "notes") {
  initNotes();
}

if (tool === "shopping") {
  initShopping();
}
