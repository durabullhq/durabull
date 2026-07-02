import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultE2ERedisUrlEncryptionKey =
  "9e6ef92b4f3f1e0e067b0a1c3e928f77c14f357205f143e1e152b95f2d1f7a4c";

function isAuthlessE2EMode(): boolean {
  const value = process.env.DURABULL_AUTHLESS?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

/**
 * Playwright configuration for E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  
  // Ignore the global-setup.ts file as a test file
  testIgnore: [
    "**/global-setup.ts",
    "**/fixtures/**",
    ...(isAuthlessE2EMode() ? [] : ["**/authless.spec.ts", "**/alerts.spec.ts"]),
  ],
  
  // Run tests serially for stability
  fullyParallel: false,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on failures - helps with flakiness
  retries: 1,
  
  // Opt out of parallel tests on CI for more stable results
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: process.env.CI 
    ? [["html", { open: "never" }], ["github"]] 
    : [["html", { open: "on-failure" }]],
  
  // Global setup for seeding database and creating auth state
  globalSetup: "./e2e/global-setup.ts",
  
  // Shared settings for all projects
  use: {
    // Base URL for all tests (dev server on 5173)
    baseURL: "http://localhost:5173",

    // Use data-testid for getByTestId selectors
    testIdAttribute: "data-testid",
    
    // Collect trace when retrying the failed test
    trace: "on-first-retry",
    
    // Capture screenshot only on failure
    screenshot: "only-on-failure",
    
    // Record video only on failure
    video: "on-first-retry",
  },

  // Configure projects - just Chromium for now
  projects: [
    {
      name: "chromium",
      use: { 
        ...devices["Desktop Chrome"],
        // Use stored auth state
        storageState: "./e2e/.auth/admin.json",
      },
    },
  ],

  // Start the dev servers before running tests
  // .env is loaded from repo root (see tooling/env + Vite envDir)
  webServer: {
    // Run only API + Web for deterministic E2E behavior.
    // The fleet demo workload mutates Redis continuously and can race with seed setup.
    command: "turbo dev --ui tui --filter=@durabull/api --filter=@durabull/web",
    cwd: path.resolve(__dirname, "../.."), // repo root
    url: "http://localhost:5173",
    reuseExistingServer: process.env.PW_REUSE_SERVER === "true",
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
    env: (() => {
      const nodeBin = path.join(
        process.env.HOME ?? "",
        ".asdf",
        "installs",
        "nodejs",
        "22.18.0",
        "bin"
      );
      const prepend = fs.existsSync(nodeBin) ? `${nodeBin}${path.delimiter}` : "";
      return {
        ...process.env,
        SKIP_CLEAR_PORT_3001: "1",
        APP_BASE_URL: "http://localhost:5173",
        VITE_PUBLIC_APP_URL: "http://localhost:5173",
        DURABULL_REDIS_URL_ENCRYPTION_KEY:
          process.env.DURABULL_REDIS_URL_ENCRYPTION_KEY ?? defaultE2ERedisUrlEncryptionKey,
        PATH: `${prepend}${process.env.PATH ?? ""}`,
      };
    })(),
  },

  // Test timeout
  timeout: 30 * 1000,
  
  // Expect timeout
  expect: {
    timeout: 10 * 1000,
  },
});
