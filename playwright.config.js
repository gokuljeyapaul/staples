import { defineConfig, devices } from "@playwright/test";

// CHROMIUM_PATH lets you point at a system Chromium (CI images, sandboxes).
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] } : {};
// Every test gets a video in CI (or locally with VIDEO=1); otherwise keep only failures'.
const video = process.env.CI || process.env.VIDEO ? "on" : "retain-on-failure";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    acceptDownloads: true,
    serviceWorkers: "block",   // keep tests deterministic; the SW is an offline rescue, not under test
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video,
  },
  webServer: {
    command: "node scripts/serve.js",
    url: "http://127.0.0.1:4173/staple.html",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, grep: /@mobile/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
