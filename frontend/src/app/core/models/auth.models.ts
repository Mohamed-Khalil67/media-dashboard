export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
