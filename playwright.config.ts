import { defineConfig, devices } from "@playwright/test";

// Env (DATABASE_URL, DATABASE_ADMIN_URL, BETTER_AUTH_*, ...) comes from .env locally or from CI.
try {
  process.loadEnvFile(".env");
} catch {
  /* CI provides the environment */
}

const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "tests-e2e",
  // The release acceptance runs on its own against a container (playwright.abnahme.config.ts);
  // together with the other specs it would exceed the sign-up limit per address (10 in 15 min).
  testIgnore: /abnahme-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}/anmelden`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ...(process.env as Record<string, string>), BETTER_AUTH_URL: `http://localhost:${port}`,
      PORT: String(port),
      // Placeholder recipient: the E2E test reads the feedback mail from Mailpit.
      FEEDBACK_MAIL_TO: process.env.E2E_FEEDBACK_MAIL_TO ?? "feedback-e2e@example.org",
    },
  },
});
