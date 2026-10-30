import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [["./tests/redact-reporter.ts"], ["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
    browserName: "chromium",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    screenshot: "only-on-failure",
    trace: "off",
  },
});
