import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Each test owns its server, DB and rate-limit buckets. Never target live accounts.
const test = base.extend({
  baseURL: async ({}, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), "naengteol-recovery-"));
    const entry = `import http from 'node:http';
      import { handleRequest } from './server.js';
      const server = http.createServer(handleRequest);
      server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", entry], {
      cwd: root,
      env: {
        ...process.env, NODE_ENV: "test", VERCEL: "", FRONTEND_ORIGIN: "",
        SUPABASE_DB_ENABLED: "false", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
        GROQ_API_KEY: "", GROQ_MODEL: "", ADMIN_EMAIL: "", ADMIN_PASSWORD: "",
        SESSION_COOKIE_SECURE: "false", LOCAL_DB_PATH: path.join(directory, "app.db.json")
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    });
    // Capture exit immediately so cleanup also handles an early startup failure.
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.stderr.resume();
    try {
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("recovery server startup timed out")), 5000);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("exit", () => { clearTimeout(timer); reject(new Error("recovery server exited before listening")); });
        child.once("message", (message) => {
          clearTimeout(timer);
          const value = message.port;
          if (Number.isInteger(value) && value > 0 && value < 65536) resolve(value);
          else reject(new Error("recovery server reported an invalid port"));
        });
      });
      await use(`http://127.0.0.1:${port}`);
    } finally {
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
      if (child.pid) await exited;
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("existing accounts explicitly import guest data and see it immediately", async ({ page }, testInfo) => {
  const email = `import-${testInfo.project.name}-${Date.now()}@example.com`;
  const password = "BrowserContract!234";
  await page.goto("/me.html#register");
  await page.locator("#registerEmail").fill(email);
  await page.locator("#registerDisplayName").fill("가져오기 검증");
  await page.locator("#registerPassword").fill(password);
  await page.locator("#registerForm button[type=submit]").click();
  await expect(page.locator("#sessionEmail")).toHaveText(email);
  await page.locator("#logoutButton").click();
  await expect(page.locator("#mergeSummary")).toBeHidden();
  await page.goto("/");
  await page.locator("#pantryName").fill("두부");
  await page.locator("#pantryForm button[type=submit]").click();
  await expect(page.locator("#pantryList")).toContainText("두부");
  await page.locator("#ingredientsText").fill("두부, 김치, 밥");
  await page.locator("#recommendForm button[type=submit]").click();
  await page.locator("#recipes .choose-recipe").first().click();
  await expect(page.locator("#recipes .selection-status").first()).toContainText("선택 완료");
  await page.goto("/me.html#login");
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#loginForm button[type=submit]").click();
  await expect(page.locator("#sessionEmail")).toHaveText(email);
  await expect(page.locator("#pantryStatus")).toHaveText("저장한 재료가 없습니다.");
  await expect(page.locator("#historyStatus")).toHaveText("선택한 메뉴가 없습니다.");
  await page.locator("#importGuestButton").click();
  await expect(page.locator("#pantryList li")).toHaveCount(1);
  await expect(page.locator("#pantryList")).toContainText("두부");
  await expect(page.locator("#historyList li")).toHaveCount(1);
  await expect(page.locator("#importGuestButton")).toBeHidden();
  await expect(page.locator("#retryMergeButton")).toBeHidden();
  await page.reload();
  await expect(page.locator("#pantryList li")).toHaveCount(1);
  await expect(page.locator("#historyList li")).toHaveCount(1);
});

test.describe("request recovery", () => {
  test.use({ serviceWorkers: "block" });
  test("late guest import responses cannot restore a logged-out account view", async ({ page }, testInfo) => {
    const email = `late-import-${testInfo.project.name}-${Date.now()}@example.com`;
    await page.goto("/me.html#register");
    await page.locator("#registerEmail").fill(email);
    await page.locator("#registerDisplayName").fill("세션 경합 검증");
    await page.locator("#registerPassword").fill("BrowserContract!234");
    await page.locator("#registerForm button[type=submit]").click();
    await expect(page.locator("#sessionEmail")).toHaveText(email);
    await page.reload();
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    let entered;
    const requested = new Promise((resolve) => { entered = resolve; });
    await page.route("**/api/guest/merge", async (route) => {
      entered();
      await delayed;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ merge: { status: "partial", steps: [{ name: "pantryItems", status: "failed" }] } }) });
    });
    await page.locator("#importGuestButton").click();
    await requested;
    await page.locator("#logoutButton").click();
    await expect(page.locator("#loginForm")).toBeVisible();
    const delivered = page.waitForResponse("**/api/guest/merge");
    release();
    await (await delivered).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator("#mergeSummary")).toBeHidden();
    await expect(page.locator("#hubStatus")).toHaveText("로그아웃되었습니다.");
  });
  test("saved menu remains successful when refreshing history fails", async ({ page }, testInfo) => {
    await page.goto("/me.html#register");
    const email = `history-outage-${testInfo.project.name}-${Date.now()}@example.com`;
    await page.locator("#registerEmail").fill(email);
    await page.locator("#registerDisplayName").fill("내역 조회 검증");
    await page.locator("#registerPassword").fill("BrowserContract!234");
    await page.locator("#registerForm button[type=submit]").click();
    await expect(page.locator("#sessionEmail")).toHaveText(email);
    await page.goto("/");
    await expect(page.locator("#accountEmail")).toHaveText(email);
    await page.locator("#ingredientsText").fill("계란, 김치, 밥");
    await page.locator("#recommendForm button[type=submit]").click();
    const card = page.locator("#recipes .recipe-card").first();
    await expect(card.locator(".choose-recipe")).toBeVisible();
    await page.route("**/api/recommendations?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "내역 조회 불가" }) }));
    await card.locator(".choose-recipe").click();
    await expect(page.locator("#message")).toContainText("내역을 새로 불러오지 못했습니다");
    await expect(card.locator(".selection-status")).toContainText("선택 완료");
    await expect(card.locator(".selection-status")).not.toHaveClass(/error/);
    await expect(card.locator(".choose-recipe")).toBeDisabled();
    await page.unroute("**/api/recommendations?*");
    await page.goto("/me.html");
    await expect(page.locator("#historyList li")).toHaveCount(1);
  });
  test("menu selection recovers a lost response without duplicating the saved selection", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.locator("#ingredientsText").fill("계란, 김치, 밥");
    await page.locator("#recommendForm button[type=submit]").click();
    const card = page.locator("#recipes .recipe-card").first();
    await expect(card.locator(".choose-recipe")).toBeVisible();
    const requests = [];
    await page.route("**/api/menu-selections", async (route) => {
      requests.push(route.request().postDataJSON());
      const response = await route.fetch();
      if (requests.length === 1) {
        expect(response.status()).toBe(201);
        await route.abort("failed");
      } else {
        expect(response.status()).toBe(200);
        await route.fulfill({ response });
      }
    });
    await card.locator(".choose-recipe").click();
    await expect(card.locator(".selection-status")).toHaveClass(/error/);
    await card.locator(".choose-recipe").click();
    await expect(card.locator(".selection-status")).toContainText("선택 완료");
    await expect(card.locator(".selection-status")).not.toHaveClass(/error/);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);

    await page.goto("/me.html#register");
    await page.locator("#registerEmail").fill(`retry-${testInfo.project.name}-${Date.now()}@example.com`);
    await page.locator("#registerDisplayName").fill("재시도 검증");
    await page.locator("#registerPassword").fill("BrowserContract!234");
    await page.locator("#registerForm button[type=submit]").click();
    await expect(page.locator("#historyList li")).toHaveCount(1);
  });
});
