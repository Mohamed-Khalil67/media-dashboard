import { test, expect, type Route } from "@playwright/test";

/**
 * Invite flow UI smoke.
 *
 * Validates the wiring between the wizard-issued URL → register page →
 * invite preview banner → accept call. Backend responses are mocked via
 * `page.route()` so this test does NOT require:
 *   - a running backend
 *   - a Postgres database
 *   - a Firebase project
 *
 * What it catches:
 *   - The frontend reading `?invite=<token>` from the URL.
 *   - The preview endpoint being called with the correct path.
 *   - The "joining <workspace>" banner rendering with the right text.
 *   - The email field being pre-filled and read-only.
 *   - Expired-invite handling routing to the error banner.
 *
 * What it does NOT cover (needs a "full E2E" follow-up with Firebase emulator):
 *   - The actual Firebase signup call.
 *   - The accept transaction at the database level.
 *   - Cross-workspace data isolation in the dashboard.
 */

const FAKE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImNsaWVudEBhY21lLmNvbSIsIndvcmtzcGFjZUlkIjoid3NfMSJ9.fake";
const EXPIRED_TOKEN = "expired-token";

test.describe("Invite acceptance — register page", () => {
  test("renders the workspace banner and pre-fills the email when invite token is valid", async ({ page }) => {
    await page.route(`**/api/invites/${encodeURIComponent(FAKE_TOKEN)}/preview`, (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: "client@acme.com",
          role: "client",
          workspaceId: "ws_1",
          workspaceName: "Acme Co",
          invitedByName: "Jane Smith",
        }),
      });
    });
    // Setup status endpoint may fire on bootstrap; mock as completed so guards pass.
    await page.route("**/api/setup/status", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          completed: true,
          platforms: { facebook: false, shopify: false, tiktok: false },
        }),
      }),
    );

    await page.goto(`/register?invite=${encodeURIComponent(FAKE_TOKEN)}`);

    await expect(page.getByText("You're joining Acme Co", { exact: false })).toBeVisible();
    await expect(page.getByText("Jane Smith", { exact: false })).toBeVisible();

    const emailInput = page.locator("#email");
    await expect(emailInput).toHaveValue("client@acme.com");
    await expect(emailInput).toHaveAttribute("readonly", "");
  });

  test("shows the expired-invite error when the preview endpoint returns 410", async ({ page }) => {
    await page.route(`**/api/invites/${EXPIRED_TOKEN}/preview`, (route: Route) =>
      route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ error: "invite_expired" }),
      }),
    );
    await page.route("**/api/setup/status", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          completed: true,
          platforms: { facebook: false, shopify: false, tiktok: false },
        }),
      }),
    );

    await page.goto(`/register?invite=${EXPIRED_TOKEN}`);

    await expect(page.getByText(/expired/i)).toBeVisible();
    // The "joining…" banner should NOT render when the token is invalid.
    await expect(page.getByText(/You're joining/i)).toHaveCount(0);
  });

  test("shows a generic invalid-link message on a 400 from the preview endpoint", async ({ page }) => {
    await page.route(`**/api/invites/bad-token/preview`, (route: Route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invite_invalid" }),
      }),
    );
    await page.route("**/api/setup/status", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          completed: true,
          platforms: { facebook: false, shopify: false, tiktok: false },
        }),
      }),
    );

    await page.goto(`/register?invite=bad-token`);

    await expect(page.getByText(/invalid|revoked/i)).toBeVisible();
  });

  test("loads the normal register page without invite UI when no token is present", async ({ page }) => {
    await page.route("**/api/setup/status", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          completed: true,
          platforms: { facebook: false, shopify: false, tiktok: false },
        }),
      }),
    );

    await page.goto("/register");

    await expect(page.getByText(/You're joining/i)).toHaveCount(0);
    const emailInput = page.locator("#email");
    await expect(emailInput).toHaveValue("");
    await expect(emailInput).not.toHaveAttribute("readonly", "");
  });
});
