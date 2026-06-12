import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";

let cached: { app: App; auth: Auth } | null = null;

/**
 * Lazy-init the firebase-admin SDK.
 *
 * Reads the service account from either:
 *  - FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON), or
 *  - GOOGLE_APPLICATION_CREDENTIALS (file path; admin SDK reads it automatically).
 *
 * Throws on first use if neither is configured. The app boots fine without it —
 * any authed route just fails until you provide credentials.
 */
export function firebaseAuth(): Auth {
  if (cached) return cached.auth;

  if (getApps().length > 0) {
    const app = getApps()[0]!;
    cached = { app, auth: getAuth(app) };
    return cached.auth;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let app: App;
  if (json) {
    const credentials = JSON.parse(json);
    app = initializeApp({ credential: cert(credentials) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // ADC: firebase-admin reads the env var automatically.
    app = initializeApp();
  } else {
    throw new Error(
      "Firebase not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (stringified) or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }

  cached = { app, auth: getAuth(app) };
  return cached.auth;
}
