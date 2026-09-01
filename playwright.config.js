import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 2,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    navigationTimeout: 15_000
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["iPhone SE"],
        viewport: { width: 360, height: 800 }
      }
    },
    {
      name: "mobile-390",
      use: {
        ...devices["iPhone 12"],
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "node server.js",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000
      }
});
