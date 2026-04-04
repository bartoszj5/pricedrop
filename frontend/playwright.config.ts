import { defineConfig } from "@playwright/test";

const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3456";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;

/** When `PLAYWRIGHT_BASE_URL` is set, you must start the app yourself. Otherwise we run `next build` + `next start` (avoids Turbopack dev quirks in client navigation tests). */
const useAutoServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: useAutoServer
    ? {
        command: `npm run build && npx next start -H 127.0.0.1 -p ${e2ePort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
