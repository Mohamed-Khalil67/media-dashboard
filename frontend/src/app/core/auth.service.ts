import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import type { User as FbUser } from "firebase/auth";
import { environment } from "../../environments/environment";
import { FIREBASE_AUTH_GATEWAY } from "./firebase-auth.gateway";
import { AuthUser } from "./models/auth.models";

const USER_KEY = "auth.user";

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

  /**
   * Ephemeral-data logout: the backend wipes every Connection (and everything
   * that cascades from it) before we sign out of Firebase. The User row
   * survives so the user can log back in to an empty dashboard.
   */
  async logout(): Promise<void> {
    // Best-effort: never block sign-out on a backend hiccup. If the call
    // fails, the data still gets wiped on next sign-in by manual sync (or
    // the user can retry logout).
    await firstValueFrom(this.http.post(`${environment.apiUrl}/auth/logout`, {})).catch(() => {});
    await this.fbAuth.signOut();
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigate(["/"]);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; } catch { return null; }
  }
}
