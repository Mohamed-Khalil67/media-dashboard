import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import { AdminUserDto, CreateUserPayload, DeletePreviewResponse, UpdateUserPayload } from "./models/admin.models";

@Injectable({ providedIn: "root" })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/admin`;

  async listUsers(): Promise<AdminUserDto[]> {
    const res = await firstValueFrom(this.http.get<{ users: AdminUserDto[] }>(`${this.api}/users`));
    return res.users;
  }

  async createUser(payload: CreateUserPayload): Promise<AdminUserDto> {
    const res = await firstValueFrom(this.http.post<{ user: AdminUserDto }>(`${this.api}/users`, payload));
    return res.user;
  }

  async updateUser(id: string, patch: UpdateUserPayload): Promise<AdminUserDto> {
    const res = await firstValueFrom(this.http.patch<{ user: AdminUserDto }>(`${this.api}/users/${id}`, patch));
    return res.user;
  }

  async setPassword(id: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/users/${id}/password`, { password }));
  }

  async deleteUser(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/users/${id}`));
  }

  /** Counts every row the cascade will wipe — shown in the delete confirmation. */
  async previewDelete(id: string): Promise<DeletePreviewResponse> {
    return firstValueFrom(
      this.http.get<DeletePreviewResponse>(`${this.api}/users/${id}/delete-preview`),
    );
  }
}
