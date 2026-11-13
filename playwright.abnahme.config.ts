import { defineConfig, devices } from "@playwright/test";

// Acceptance run against an already running production container (docker compose --profile app).
// No webServer: the app under test is the image, not a dev build. Base URL from E2E_BASE_URL.
// Only the acceptance spec; run the other specs one file at a time (sign-up limit per address).
try {
  process.loadEnvFile(".env");
} catch {
  /* environment provided by the caller */
}

export default defineConfig({
  testDir: "tests-e2e",
  testMatch: /abnahme-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
