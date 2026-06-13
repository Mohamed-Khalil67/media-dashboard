export type UserRole = "admin" | "media_buyer" | "client";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  // Billing tier; not selected by the backend /me endpoint yet, so it stays optional
  // until plan-tier UI is actually wired up.
  plan?: "trial" | "starter" | "pro" | "agency";
  role: UserRole;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
