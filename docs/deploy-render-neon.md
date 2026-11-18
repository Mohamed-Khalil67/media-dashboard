# Deploy for free: Render + Neon + Firebase

One Docker container on Render's free plan serves the API (`/api/*`) and the Angular app. Postgres runs on Neon's free plan, and auth stays on Firebase Spark. Total cost: $0.

**Free-tier trade-offs**

- Render's free service sleeps after about 15 minutes with no traffic. The first request after that takes 30–60 seconds while it wakes.
- Background sync only runs while the service is awake. It only syncs users active in the last `ACTIVITY_WINDOW_MINUTES`, and those users keep the service awake anyway.
- The retention sweep runs at every boot as well as on its daily cron, so cleanup still happens even if the daily cron never fires.
- Neon's free plan gives about 0.5 GB of storage. The database also suspends when idle and resumes on the first query.

## 1. Neon (database)

1. Sign up at neon.tech and create a project. Use PostgreSQL 17 and pick a region close to your Render region.
2. Go to **Connection details**, turn **Connection pooling off**, and copy the **direct** connection string. It should look like `postgresql://…neon.tech/neondb?sslmode=require`.
   Use the direct string because `prisma migrate deploy` runs on every boot and needs a direct connection.

## 2. Secrets to prepare

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- `ENCRYPTION_KEY`: the 64-hex-character output of the command above. Use a new key for production. If you want to copy local data over, use your local key instead, or the stored tokens won't decrypt.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: in the Firebase console, go to Project settings → Service accounts → Generate new private key. Paste the whole JSON as **one line**.

## 3. Render (app)

1. Push this branch to GitHub.
2. In Render, create a new **Blueprint**, pick the repository and branch, and Render reads [`render.yaml`](../render.yaml).
3. When Render prompts for the values marked `sync: false`, fill them in:
   - `DATABASE_URL`: the Neon direct string
   - `ENCRYPTION_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FRONTEND_URL`: `https://<service-name>.onrender.com`, with no trailing slash. If you don't know the URL yet, put in a placeholder, then fix it and redeploy once the URL appears.
4. Deploy. Check that `https://<service>.onrender.com/api/health` returns `{"status":"ok",…}`.

## 4. Allow the new domain

- **Firebase**: in Authentication → Settings → Authorized domains, add `<service>.onrender.com`.
- **Meta app** (each app ID users connect with): in Facebook Login → Settings → Valid OAuth Redirect URIs, add
  `https://<service>.onrender.com/api/facebook/callback`. Also add the domain to App settings → Basic → App domains.
- **Shopify app**: add `https://<service>.onrender.com/api/shopify/callback` to its allowed redirection URLs.

## 5. Smoke test

1. Open the site. Expect the first load to be slow if the service was asleep.
2. Sign in.
3. Go to Connections, connect Facebook, and check that the accounts appear.
4. Check that a sync runs: the Render logs should show `sync cycle complete`.
