import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const nodeBin = path.dirname(process.execPath);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: externalBaseURL ? undefined : {
    command: `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost PATH=${nodeBin}:$PATH E2E_LISTING_FIXTURES=1 scripts/start-e2e-server.sh`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
