import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";

export interface Workspace {
  id: string;
  name: string;
  role: "owner" | "member";
  createdAt: string;
  active: boolean;
}

export interface WorkspaceMember {
  id: string;
  role: "owner" | "member";
  joinedAt: string;
  user: { id: string; email: string; name: string | null };
}

const ACTIVE_KEY = "workspace.active";

@Injectable({ providedIn: "root" })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly workspaces = signal<Workspace[]>([]);
  readonly active = signal<Workspace | null>(this.readStoredActive());

  async list(): Promise<Workspace[]> {
    const res = await firstValueFrom(
      this.http.get<{ workspaces: Workspace[] }>(`${this.api}/workspaces`)
    );
    this.workspaces.set(res.workspaces);
    const act = res.workspaces.find((w) => w.active) ?? res.workspaces[0] ?? null;
    this.active.set(act);
    if (act) localStorage.setItem(ACTIVE_KEY, JSON.stringify(act));
    return res.workspaces;
  }

  async create(name: string): Promise<Workspace> {
    const res = await firstValueFrom(
      this.http.post<{ workspace: Workspace }>(`${this.api}/workspaces`, { name })
    );
    return res.workspace;
  }

  async switchTo(workspaceId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/workspaces/switch`, { workspaceId })
    );
    await this.list();
  }

  async rename(id: string, name: string): Promise<void> {
    await firstValueFrom(this.http.patch(`${this.api}/workspaces/${id}`, { name }));
    await this.list();
  }

  async members(id: string): Promise<WorkspaceMember[]> {
    const res = await firstValueFrom(
      this.http.get<{ members: WorkspaceMember[] }>(`${this.api}/workspaces/${id}/members`)
    );
    return res.members;
  }

  private readStoredActive(): Workspace | null {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as Workspace; } catch { return null; }
  }
}
