# Self-host installation

This guide walks a new operator from a fresh machine to a working dashboard.
It assumes you want a single instance for your own team. (Multi-tenant or public
SaaS deployment is a separate plan.)

## Prerequisites

- **Node.js 20+** (`node --version`)
- **npm 10+** (ships with Node)
- **PostgreSQL 15+** running locally or on a reachable host
- **Firebase project** (free tier is fine) for authentication
- A **Facebook Developer account**, **Shopify Partner or store admin**, and/or **TikTok Business** account for the integrations you plan to use

You do *not* need to create the platform OAuth apps before installing — the
first-run setup wizard handles those credentials interactively.

## 1. Clone and configure

```bash
git clone <your-fork> media-dashboard
cd media-dashboard
cp backend/.env.example backend/.env
```

Edit `backend/.env`. Fill in:

```
DATABASE_URL="postgresql://USER:PASS@HOST:5432/media_dashboard"
JWT_SECRET="<32+ random chars>"
ENCRYPTION_KEY="<64-hex-char string — used to AES-encrypt OAuth tokens>"
BOOTSTRAP_ADMIN_EMAIL="you@example.com"
```

Everything below the `# Platform credentials` comment in `.env.example` is
**optional**. The first-run `/setup` wizard collects those values via the UI and
stores them encrypted in the `SystemConfig` table. Leave them blank unless you
prefer file-based config.

Generate `ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Install + migrate

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
cd ../frontend
npm install
```

The migrations create every table including `SystemConfig` (used by the wizard).

## 3. Firebase setup

1. Create a Firebase project at <https://console.firebase.google.com>.
2. Enable **Authentication → Email/Password** (and Google if you want SSO).
3. Project settings → **Service accounts → Generate new private key** → save the
   JSON file as `backend/serviceAccount.json` (gitignored).
4. Copy the **Web app** config snippet from project settings → general into
   `frontend/src/environments/environment.ts`.

## 4. First run

In two terminals:

```bash
# Terminal 1 — backend
cd backend
npm run dev
```

```bash
# Terminal 2 — frontend
cd frontend
npm start
```

Visit <http://localhost:4200>. You'll be redirected to **`/setup`** — the first-run wizard.

### The wizard

You'll see three steps: **Facebook → Shopify → TikTok**. For each platform you use:

1. Follow the linked guide in the wizard to create the developer app.
2. Paste the **App ID / Client ID** and **App Secret / Client Secret**.
3. Confirm the **Redirect URL** matches what you registered with the platform.
4. Click **Test connection**. Green pill = you're good.

Click **Skip this platform** for any platform you don't use. Click **Finish setup**
on the last step. You'll land on `/login`.

The bootstrap admin (from `BOOTSTRAP_ADMIN_EMAIL`) is auto-allowed; sign up at
`/register` with that email and you'll have admin privileges.

## 5. Connecting actual accounts

Once setup is complete, you (or your media buyers) go to **Connections** and click
**Connect Facebook / Shopify / TikTok** for each ad account or store.
This uses normal OAuth — every customer's tokens are stored encrypted in the
`Connection` table, isolated by workspace.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 setup_required` on every API call | The wizard hasn't been completed. Visit `/setup`. |
| Wizard is locked after first run, but I need to change credentials | You're an admin → sign in, visit `/setup` directly. The endpoints flip to `requireRole("admin")` after the initial completion. |
| Tokens won't decrypt after server restart | `ENCRYPTION_KEY` changed between runs. Restore the original key or you'll need to re-connect every account. |
| `Cannot find module '@prisma/client'` | Re-run `npx prisma generate` in `backend/`. |

## Updating

```bash
git pull
cd backend && npm install && npx prisma migrate deploy && npx prisma generate
cd ../frontend && npm install && npm run build
```

Settings stored by the wizard persist across upgrades — they live in the
`SystemConfig` table, not in code or `.env`.
