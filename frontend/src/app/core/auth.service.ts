import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import { AuthResponse, AuthUser } from "./models/auth.models";

const TOKEN_KEY = "auth.token";
const USER_KEY = "auth.user";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<AuthUser | null>(this.readStoredUser());
  readonly isLoggedIn = computed(() => !!this.token());

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password })
    );
    this.persist(res);
  }

  async register(email: string, password: string, name?: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, { email, password, name })
    );
    this.persist(res);
  }

  async refreshMe(): Promise<void> {
    const res = await firstValueFrom(
      this.http.get<{ user: AuthUser }>(`${environment.apiUrl}/auth/me`)
    );
    this.user.set(res.user);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
    this.router.navigate(["/login"]);
  }

  private persist(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.token.set(res.token);
    this.user.set(res.user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
