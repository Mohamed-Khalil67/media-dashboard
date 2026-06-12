import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { WorkspaceService, WorkspaceMember } from "../../core/workspace.service";
import { StatusBarService } from "../../core/status-bar.service";

@Component({
  selector: "app-workspaces",
  imports: [],
  template: `
    <header class="page-head">
      <h1>Workspace settings</h1>
      <p class="muted">Manage the workspace you're currently working in. Each workspace owns its own connections, alerts, and history.</p>
    </header>

    @if (active(); as ws) {
      <section class="card">
        <h3>Active workspace</h3>
        <div class="row">
          <input
            type="text"
            [value]="renameDraft()"
            (input)="renameDraft.set(asValue($event))"
            [disabled]="ws.role !== 'owner'"
          />
          <button
            class="primary"
            (click)="rename(ws.id)"
            [disabled]="ws.role !== 'owner' || !renameDraft().trim() || renameDraft().trim() === ws.name || saving()"
          >
            {{ saving() ? "Saving…" : "Rename" }}
          </button>
        </div>
        @if (ws.role !== 'owner') {
          <p class="muted-sm">Only owners can rename a workspace.</p>
        }
      </section>

      <section class="card">
        <h3>Members</h3>
        @if (membersLoading()) {
          <p class="muted-sm">Loading…</p>
        } @else {
          <ul class="members">
            @for (m of members(); track m.id) {
              <li>
                <div class="m-avatar">{{ initials(m) }}</div>
                <div class="m-meta">
                  <div class="m-name">{{ m.user.name ?? m.user.email }}</div>
                  <div class="muted-sm">{{ m.user.email }}</div>
                </div>
                <span class="role-pill" [class.role-owner]="m.role === 'owner'">{{ m.role }}</span>
              </li>
            }
          </ul>
        }
        <p class="muted-sm" style="margin-top: 1rem;">Inviting teammates by email link will be enabled when notification delivery ships.</p>
      </section>

      <section class="card">
        <h3>All your workspaces</h3>
        <ul class="ws-list">
          @for (w of ws$.workspaces(); track w.id) {
            <li>
              <div>
                <strong>{{ w.name }}</strong>
                <span class="muted-sm"> · {{ w.role }}</span>
              </div>
              @if (w.active) {
                <span class="role-pill role-owner">active</span>
              } @else {
                <button class="ghost" (click)="switchTo(w.id)">Switch</button>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [`
    .page-head h1 { margin: 0 0 .25rem; color: var(--text); }
    .muted { color: var(--text-muted); margin: 0 0 1.5rem; }
    .muted-sm { color: var(--text-muted); font-size: .8rem; }
    .card { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    h3 { margin: 0 0 .75rem; font-size: 1rem; color: var(--text); }
    .row { display: flex; gap: .5rem; }
    input { padding: .5rem .75rem; border: 1px solid var(--input-bd); border-radius: .375rem; background: var(--card-bg); color: var(--text); flex: 1; max-width: 24rem; }
    button.primary { background: var(--accent); color: #fff; border: 0; padding: .5rem 1rem; border-radius: .375rem; cursor: pointer; font-weight: 500; }
    button.primary:disabled { opacity: .5; cursor: not-allowed; }
    button.ghost { background: transparent; border: 1px solid var(--card-bd); color: var(--text); padding: .35rem .75rem; border-radius: .35rem; cursor: pointer; font-size: .82rem; }
    button.ghost:hover { background: var(--ghost-bg); }
    .members, .ws-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
    .members li, .ws-list li { display: flex; align-items: center; gap: .75rem; padding: .65rem .85rem; background: var(--ghost-bg); border-radius: .5rem; }
    .ws-list li { justify-content: space-between; }
    .m-avatar { width: 2rem; height: 2rem; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 600; }
    .m-meta { flex: 1; }
    .m-name { color: var(--text); font-weight: 500; font-size: .9rem; }
    .role-pill { background: var(--card-bd); color: var(--text-muted); padding: .2rem .55rem; border-radius: 999px; font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; }
    .role-pill.role-owner { background: var(--accent-soft); color: var(--accent); }
  `],
})
export class WorkspacesComponent implements OnInit {
  readonly ws$ = inject(WorkspaceService);
  private readonly status = inject(StatusBarService);

  readonly active = computed(() => this.ws$.active());
  readonly renameDraft = signal("");
  readonly saving = signal(false);
  readonly members = signal<WorkspaceMember[]>([]);
  readonly membersLoading = signal(false);

  async ngOnInit(): Promise<void> {
    await this.ws$.list();
    const a = this.active();
    if (a) {
      this.renameDraft.set(a.name);
      await this.loadMembers(a.id);
    }
  }

  asValue(e: Event): string { return (e.target as HTMLInputElement).value; }

  async loadMembers(id: string): Promise<void> {
    this.membersLoading.set(true);
    try {
      this.members.set(await this.ws$.members(id));
    } catch {
      this.status.error("Could not load members");
    } finally {
      this.membersLoading.set(false);
    }
  }

  initials(m: WorkspaceMember): string {
    const src = m.user.name ?? m.user.email;
    return src.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  }

  async rename(id: string): Promise<void> {
    const name = this.renameDraft().trim();
    if (!name) return;
    this.saving.set(true);
    try {
      await this.ws$.rename(id, name);
      this.status.success("Workspace renamed");
    } catch {
      this.status.error("Could not rename workspace");
    } finally {
      this.saving.set(false);
    }
  }

  async switchTo(id: string): Promise<void> {
    await this.ws$.switchTo(id);
    window.location.reload();
  }
}
