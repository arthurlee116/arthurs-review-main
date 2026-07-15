import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const nodeBin = path.dirname(process.execPath);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost PATH=${nodeBin}:$PATH E2E_LISTING_FIXTURES=1 pnpm seed && NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost PATH=${nodeBin}:$PATH pnpm exec next dev --hostname 127.0.0.1 --port 3100`,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
