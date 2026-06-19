# End-to-end tests

Playwright-driven smoke tests for the media-dashboard. Each spec lives under `tests/`.

## What this suite covers

Today's suite covers the invite-acceptance UI flow:

- Visiting `/register?invite=<token>` triggers the preview call.
- The "joining <workspace>" banner renders with the correct text.
- Email field is pre-filled and read-only when the token is valid.
- Expired (`410`) and invalid (`400`) tokens render the right error banners.
- The page falls back to the normal register form when no token is present.

The backend is **route-mocked** via `page.route()`, so this suite needs neither
a Postgres database nor a Firebase project. It catches frontend wiring bugs
(query-param parsing, interceptor behaviour, signal updates) but not
database-level invite acceptance.

## Run it locally

```bash
# One-time setup (downloads Chromium, ~150 MB)
cd e2e
npm install
npm run install:browsers

# Start the frontend in a separate terminal:
cd ../frontend
npm start

# Then run the suite:
cd ../e2e
npm test            # headless
npm run test:headed # watch it execute in a real browser
npm run test:debug  # step through with the inspector
```

The frontend dev server URL is read from `E2E_BASE_URL` (default
`http://localhost:4200`).

## Extending toward a full end-to-end with real backend

For higher-confidence tests that exercise the database and Firebase token
verification, you'll need:

1. **A test Postgres database.** Either a dedicated `media_dashboard_e2e`
   schema or a fresh container. The fixture should run
   `npx prisma migrate reset --force` before each suite.
2. **A way to authenticate without real Firebase.** Two options:
   - **Firebase Auth Emulator suite** — run alongside the backend, pointed at
     by `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`.
   - **Backend test-mode flag** — accept a stub bearer token when
     `NODE_ENV=test`. NOTE: only safe if the flag is enforced never to ship to
     production builds; current code does not include this and adding it would
     widen the security surface.
3. **A seed step** that creates the bootstrap admin + a workspace + a
   `Connection` row with some sample insights before each suite.

A future spec exercising the full flow would look like:

```ts
test("full invite flow with real backend", async ({ browser, page }) => {
  await resetAndSeed();                                       // SQL helpers
  const buyer  = await browser.newContext({ storageState: "buyer.json" });
  const client = await browser.newContext();

  const a = await buyer.newPage();
  await a.goto("/workspaces");
  await a.locator("#invite-email").fill("client@acme.com");
  await a.getByRole("button", { name: /generate link/i }).click();
  const inviteUrl = await a.locator(".invite-url").innerText();

  const b = await client.newPage();
  await b.goto(inviteUrl);
  await expect(b.getByText("You're joining Acme Co")).toBeVisible();
  await b.locator("#password").fill("StrongPass123!");
  await b.getByRole("button", { name: /create free account/i }).click();
  await expect(b).toHaveURL(/\/dashboard/);
});
```

The DB + Firebase plumbing for that path is its own task.

## CI

For GitHub Actions, the canonical run is:

```yaml
- run: npm ci
  working-directory: frontend
- run: npm run build
  working-directory: frontend
- run: npx http-server frontend/dist/frontend/browser -p 4200 &
- run: |
    cd e2e
    npm ci
    npx playwright install --with-deps chromium
    npm test
```

This is not wired up yet; add when CI infrastructure lands.
