import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        bindings: {
          APP_ORIGIN: "https://ethangalea1000-svg.github.io",
          SESSION_PEPPER: "test-only-session-pepper-not-a-production-secret-123",
        },
        d1Databases: {
          DB: "wishly-isolated-auth-test-db",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30_000,
  },
});
