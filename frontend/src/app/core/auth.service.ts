import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import {
  User as FbUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { environment } from "../../environments/environment";
import { firebaseAuth, googleProvider } from "./firebase";
import { AuthUser } from "./models/auth.models";

const USER_KEY = "auth.user";

/**
 * Wraps Firebase Authentication.
 *
 * - The Firebase SDK persists its own session in IndexedDB and auto-refreshes ID tokens.
 * - We keep a cached `AuthUser` snapshot (our DB profile from `/api/auth/me`) in localStorage
 *   so the UI can render immediately on reload while Firebase hydrates.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly fbUser = signal<FbUser | null>(firebaseAuth.currentUser);
  readonly user = signal<AuthUser | null>(this.readStoredUser());
  readonly isLoggedIn = computed(() => !!this.fbUser());
  readonly authReady = signal(false);

  constructor() {
    onAuthStateChanged(firebaseAuth, async (fb) => {
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
  async token(): Promise<string | null> {
    const fb = this.fbUser();
    if (!fb) return null;
    return fb.getIdToken();
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }

  async register(email: string, password: string, name?: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (name && cred.user) {
      await updateProfile(cred.user, { displayName: name });
    }
  }

  async loginWithGoogle(): Promise<void> {
    await signInWithPopup(firebaseAuth, googleProvider);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(firebaseAuth, email);
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
    await fbSignOut(firebaseAuth);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigate(["/login"]);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; } catch { return null; }
  }
}
