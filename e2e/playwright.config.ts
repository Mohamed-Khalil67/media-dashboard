import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the locally-running Angular dev server. The frontend must already be
 * started (`cd frontend && npm start`). The backend does NOT need to be running —
 * each spec uses Playwright's `page.route()` to mock the API responses it cares
 * about, so this suite is hermetic and fast (no DB, no Firebase, no migrations).
 *
 * To run a fuller backend-against-real-DB version of these specs, see e2e/README.md.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Auto-starts the Angular dev server before the suite if one isn't already
  // listening on :4200. Set E2E_SKIP_WEBSERVER=1 if you're starting the dev
  // server yourself in another terminal.
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm start",
        cwd: "../frontend",
        url: "http://localhost:4200",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
