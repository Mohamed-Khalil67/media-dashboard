import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import type { User as FbUser } from "firebase/auth";
import { environment } from "../../environments/environment";
import { FIREBASE_AUTH_GATEWAY } from "./firebase-auth.gateway";
import { AuthUser } from "./models/auth.models";

const USER_KEY = "auth.user";

/**
 * Wraps Firebase Authentication.
 *
 * - The Firebase SDK persists its own session in IndexedDB and auto-refreshes ID tokens.
 * - We keep a cached `AuthUser` snapshot (our DB profile from `/api/auth/me`) in localStorage
 *   so the UI can render immediately on reload while Firebase hydrates.
 *
 * All Firebase access goes through `FIREBASE_AUTH_GATEWAY` — see
 * `firebase-auth.gateway.ts` for the rationale (test-ability via TestBed).
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly fbAuth = inject(FIREBASE_AUTH_GATEWAY);

  readonly fbUser = signal<FbUser | null>(this.fbAuth.currentUser);
  readonly user = signal<AuthUser | null>(this.readStoredUser());
  readonly isLoggedIn = computed(() => !!this.fbUser());
  readonly authReady = signal(false);

  constructor() {
    this.fbAuth.onAuthStateChanged(async (fb) => {
      this.fbUser.set(fb);
      this.authReady.set(true);
      if (fb) {
        await this.refreshMe().catch(() => {});
      } else {
        this.user.set(null);
        localStorage.removeItem(USER_KEY);
      }
    });
  }

  /** Compatibility shim — auth.interceptor reads it for the Bearer header. */
  token(): Promise<string | null> {
    return this.fbAuth.getIdToken();
  }

  async login(email: string, password: string): Promise<void> {
    await this.fbAuth.signIn(email, password);
  }

  async register(email: string, password: string, name?: string): Promise<void> {
    await this.fbAuth.register(email, password, name);
  }

  async resetPassword(email: string): Promise<void> {
    await this.fbAuth.sendPasswordResetEmail(email);
  }

  /**
   * Calls the backend admin endpoint which:
   *  - Verifies the email is on the allowlist + has a Firebase account
   *  - Logs the reset link server-side so the operator can verify Firebase accepted it
   *  - Returns the reset link in dev mode for direct use when email delivery is blocked
   */
  async requestPasswordResetWithVerification(email: string): Promise<{ emailSent: boolean; devLink?: string; needsRegistration?: boolean }> {
    return firstValueFrom(
      this.http.post<{ emailSent: boolean; devLink?: string; needsRegistration?: boolean }>(
        `${environment.apiUrl}/auth/password-reset`,
        { email },
      ),
    );
  }

  async refreshMe(): Promise<void> {
    const res = await firstValueFrom(
      this.http.get<{ user: AuthUser }>(`${environment.apiUrl}/auth/me`)
    );
    this.user.set(res.user);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }

  async checkMigration(email: string): Promise<{ exists: boolean; pendingMigration: boolean }> {
    const res = await firstValueFrom(
      this.http.get<{ exists: boolean; pendingMigration: boolean }>(
        `${environment.apiUrl}/auth/check-migration?email=${encodeURIComponent(email)}`,
      ),
    );
    return res;
  }

  async logout(): Promise<void> {
    await this.fbAuth.signOut();
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigate(["/login"]);
  }

  /**
   * Called by the interceptor when the backend returns 403 `access_denied`
   * (email isn't on the invite-only allowlist). Sign the user out of Firebase
   * so they aren't stuck in a half-authenticated state, then bounce them to
   * /login with a query flag so the login page shows the denied banner.
   */
  async signOutAndRedirectDenied(): Promise<void> {
    await this.fbAuth.signOut().catch(() => {});
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigate(["/login"], { queryParams: { denied: 1 } });
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; } catch { return null; }
  }
}
