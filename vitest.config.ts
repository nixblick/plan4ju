import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  // Same "@/" alias as tsconfig, so tests can import app modules (action helpers).
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Integration tests run against the real PostgreSQL from docker-compose.yml.
    // DATABASE_URL / DATABASE_ADMIN_URL come from .env (local) or the CI environment.
    env: loadEnv(mode, process.cwd(), ""),
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
}));
