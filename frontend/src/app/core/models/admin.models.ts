import { UserRole } from "./auth.models";

export interface AdminUserDto {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  firebaseUid: string | null;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name?: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  disabled?: boolean;
}

/**
 * Row counts of everything that will be cascade-deleted along with a user.
 * Returned by GET /admin/users/:id/delete-preview and surfaced in the delete
 * confirmation modal so an admin can see the blast radius before confirming.
 */
export interface CascadeSummary {
  connections: number;
  campaigns: number;
  insights: number;
  syncRuns: number;
  shopifyOrders: number;
  alertRules: number;
  workspaceMembers: number;
}

export interface DeletePreviewResponse {
  user: { id: string; email: string; name: string | null; role: UserRole };
  cascade: CascadeSummary;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  media_buyer: "Media buyer",
  client: "Client",
};

export const ROLE_OPTIONS: ReadonlyArray<UserRole> = ["admin", "media_buyer", "client"];
