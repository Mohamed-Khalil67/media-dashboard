export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: "trial" | "starter" | "pro" | "agency";
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
