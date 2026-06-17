import { defineConfig } from "@playwright/test";

const port = process.env.PORT || "58173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "cd .. && rm -f target/playwright-zoo.sqlite3 && ZOO_DB_PATH=target/playwright-zoo.sqlite3 cargo run -p zoo_server",
      url: "http://127.0.0.1:8080/api/worlds",
      reuseExistingServer: false,
    },
    {
      command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
