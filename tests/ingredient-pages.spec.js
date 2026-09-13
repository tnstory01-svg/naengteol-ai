import { test as base, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flattenCatalog } from "../public/food-catalog.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalog = flattenCatalog();

// Every browser test owns a temporary local DB and never reads the developer's app.db.json.
const test = base.extend({
  baseURL: async ({}, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), "naengteol-ingredient-pages-"));
    const entry = `import http from "node:http";
      import { handleRequest } from "./server.js";
      const server = http.createServer(handleRequest);
      server.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", entry], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        VERCEL: "",
        FRONTEND_ORIGIN: "",
        SUPABASE_DB_ENABLED: "false",
        SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        GROQ_API_KEY: "",
        GROQ_MODEL: "",
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD: "",
        SESSION_COOKIE_SECURE: "false",
        LOCAL_DB_PATH: path.join(directory, "app.db.json")
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.stderr.resume();
    try {
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("ingredient pages server startup timed out")), 5000);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("exit", () => { clearTimeout(timer); reject(new Error("ingredient pages server exited before listening")); });
        child.once("message", (message) => {
          clearTimeout(timer);
          if (Number.isInteger(message.port) && message.port > 0 && message.port < 65536) resolve(message.port);
          else reject(new Error("ingredient pages server reported an invalid port"));
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

test("all 48 ingredient detail pages render three recipes without browser errors", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  for (const item of catalog) {
    await page.goto(`/ingredient.html?id=${encodeURIComponent(item.id)}`);
    await expect(page.locator("#ingredientPageTitle")).toHaveText(item.name);
    await expect(page.locator(".ingredient-recipe-card")).toHaveCount(3);
    await expect(page.locator(".ingredient-recipe-card h3")).toHaveCount(3);
    await expect(page.locator(".ingredient-recipe-card .steps")).toHaveCount(3);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("ingredient list supports aliases, recipe search, empty results, and safe unknown IDs", async ({ page }) => {
  await page.goto("/ingredients.html");
  await expect(page.locator(".ingredient-catalog-card")).toHaveCount(48);
  await expect(page.locator("#catalogCount")).toHaveText("전체 48개 중 48개 표시");

  await page.locator("#ingredientSearch").fill("달걀");
  await expect(page.locator(".ingredient-catalog-card")).toHaveCount(1);
  await expect(page.locator(".ingredient-catalog-card")).toContainText("계란");

  await page.locator("#ingredientSearch").fill("김치볶음우동");
  await expect(page.locator(".ingredient-catalog-card")).toHaveCount(1);
  await expect(page.locator(".ingredient-catalog-card")).toContainText("냉동우동");

  await page.locator("#ingredientSearch").fill("이재료는-존재하지-않음");
  await expect(page.locator(".ingredient-catalog-card")).toHaveCount(0);
  await expect(page.locator("#catalogEmpty")).toBeVisible();

  const payload = "<script>window.__ingredientXss=1</script>";
  await page.goto(`/ingredient.html?id=${encodeURIComponent(payload)}`);
  await expect(page.locator("#ingredientPageTitle")).toHaveText("재료를 찾을 수 없습니다");
  await expect(page.locator(".missing-ingredient-card")).toContainText("재료 도감으로 돌아가기");
  expect(await page.evaluate(() => window.__ingredientXss)).toBeUndefined();
  expect(await page.locator("body").innerText()).not.toContain(payload);
});

test("main category, pantry, and detail navigation remain connected", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#categoryTitle")).toBeVisible();
  await expect(page.locator("#pantryTitle")).toBeVisible();
  await expect(page.locator('a[href="./ingredients.html"]')).toBeVisible();
  await page.locator('a[href="./ingredients.html"]').first().click();
  await expect(page).toHaveURL(/\/ingredients\.html$/);
  await page.locator('.ingredient-catalog-card a[href*="ingredient.html?id="]').first().click();
  await expect(page).toHaveURL(/\/ingredient\.html\?id=/);
  await expect(page.locator(".detail-back-row a[href=\"./ingredients.html\"]")).toBeVisible();
  await expect(page.locator('a[href="./"]').first()).toBeVisible();
  await expect(page.locator('a[href="./me.html"]').first()).toBeVisible();
});

test("ingredient list and detail stay within 360/390 mobile viewport", async ({ page }, testInfo) => {
  await page.goto("/ingredients.html");
  const listLayout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(listLayout.content, "ingredient list overflows horizontally").toBeLessThanOrEqual(listLayout.viewport);
  await page.screenshot({ path: testInfo.outputPath(`ingredients-list-${testInfo.project.name}.png`), fullPage: true, scale: "css" });

  await page.goto(`/ingredient.html?id=${encodeURIComponent(catalog[47].id)}`);
  await expect(page.locator(".ingredient-recipe-card")).toHaveCount(3);
  const detailLayout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(detailLayout.content, "ingredient detail overflows horizontally").toBeLessThanOrEqual(detailLayout.viewport);
  await page.screenshot({ path: testInfo.outputPath(`ingredient-detail-${testInfo.project.name}.png`), fullPage: true, scale: "css" });
});
