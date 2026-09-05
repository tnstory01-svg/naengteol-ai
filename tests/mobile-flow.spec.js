import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`mobile flow remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.locator("#recommendForm")).toBeVisible();
    await page.locator("#ingredientsText").fill("계란, 김치, 밥");
    await page.getByRole("button", { name: "냉장고 털기 시작" }).click();
    await expect(page.locator("#recipes .choose-recipe")).toHaveCount(3);

    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));
    expect(layout.content, "the page must not overflow horizontally").toBeLessThanOrEqual(layout.viewport);

    const targets = await page.locator("#recommendForm button, #recommendForm input, #recommendForm select, #recommendForm textarea").evaluateAll((elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      }).map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, width: rect.width, height: rect.height };
      })
    );
    for (const target of targets) {
      expect(target.height, `${target.tag} touch target is below 44px`).toBeGreaterThanOrEqual(44);
      expect(target.width, `${target.tag} touch target has no usable width`).toBeGreaterThanOrEqual(44);
    }
  });
}

test("same-origin guest data and menu selection survive registration and a new login", async ({ page }, testInfo) => {
  const email = `browser-${testInfo.project.name}-${Date.now()}@example.com`;
  const password = "BrowserContract!234";
  await page.goto("/");
  await page.locator("#pantryName").fill("계란");
  await page.locator("#pantryQuantity").fill("2개");
  await page.locator("#pantryForm button[type=submit]").click();
  await expect(page.locator("#pantryList")).toContainText("계란");
  await page.locator("#ingredientsText").fill("계란, 김치, 밥");
  const recommended = page.waitForResponse((response) => response.url().endsWith("/api/recommend") && response.request().method() === "POST");
  await page.locator("#recommendForm button[type=submit]").click();
  expect((await (await recommended).json()).meta.source).toBe("fallback");
  await expect(page.locator("#recipes .choose-recipe")).toHaveCount(3);
  await page.locator("#recipes .choose-recipe").first().click();
  await expect(page.locator("#recipes .selection-status").first()).toContainText("선택 완료");

  await page.goto("/me.html#register");
  await page.locator("#registerEmail").fill(email);
  await page.locator("#registerDisplayName").fill("브라우저 검증");
  await page.locator("#registerPassword").fill(password);
  await page.locator("#registerForm button[type=submit]").click();
  await expect(page.locator("#sessionEmail")).toHaveText(email);
  await expect(page.locator("#pantryList")).toContainText("계란");
  await expect(page.locator("#historyList li")).toHaveCount(1);
  const history = await page.locator("#historyList").innerText();
  await page.reload();
  await expect(page.locator("#sessionEmail")).toHaveText(email);
  await page.locator("#logoutButton").click();
  await expect(page.locator("#loginForm")).toBeVisible();
  expect((await page.request.get("/api/recommendations")).status()).toBe(401);
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#loginForm button[type=submit]").click();
  await expect(page.locator("#sessionEmail")).toHaveText(email);
  await expect(page.locator("#pantryList")).toContainText("계란");
  await expect(page.locator("#historyList")).toHaveText(history);
});

test("health failure is never displayed as a ready database", async ({ page }) => {
  await page.route("**/health", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable", details: { code: "DATABASE_UNAVAILABLE" } }) }));
  await page.goto("/");
  await expect(page.locator("#dbStatus")).toHaveText("DB 연결 불가");
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  test(`device-local tools persist at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tools.html");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator("#shoppingName").fill("달걀");
    await page.locator("#shoppingForm button[type=submit]").click();
    await expect(page.locator("#shoppingList")).toContainText("달걀");
    await page.locator("#noteTitle").fill("이번 주 장보기");
    await page.locator("#noteBody").fill("김치와 두부");
    await page.locator("#noteForm button[type=submit]").click();
    await page.reload();
    await expect(page.locator("#shoppingList")).toContainText("달걀");
    await expect(page.locator("#noteList")).toContainText("이번 주 장보기");
    const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(layout.content).toBeLessThanOrEqual(layout.viewport);
    await page.locator("#shoppingList button", { hasText: "삭제" }).click();
    await page.locator("#noteList button", { hasText: "삭제" }).click();
    await expect(page.locator("#shoppingEmpty")).toBeVisible();
    await expect(page.locator("#noteEmpty")).toBeVisible();
  });
}
