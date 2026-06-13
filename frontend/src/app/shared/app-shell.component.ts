import { Component, OnInit, inject, signal } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../core/auth.service";
import { ThemeService } from "../core/theme.service";
import { WorkspaceService } from "../core/workspace.service";
import { StatusBarService } from "../core/status-bar.service";
import { DropdownComponent } from "./dropdown.component";

@Component({
  selector: "app-shell",
  imports: [RouterLink, RouterLinkActive, RouterOutlet, DropdownComponent],
  template: `
    <header class="shell-header">
      <div class="brand">📊 Media Dashboard</div>

      <app-dropdown class="ws-switcher" #wsDd>
        <span trigger class="ws-trigger" role="button" tabindex="0"
              [attr.aria-label]="'Switch workspace, currently ' + (ws.active()?.name ?? 'none selected')">
          <span class="ws-dot" aria-hidden="true"></span>
          <span class="ws-name">{{ ws.active()?.name ?? 'Select workspace' }}</span>
        </span>
        <div menu class="ws-menu">
          <div class="ws-menu-head">
            <strong>Workspaces</strong>
            <button class="link-btn" type="button" (click)="goSettings(wsDd)">Settings</button>
          </div>
          @for (w of ws.workspaces(); track w.id) {
            <button class="ws-row" type="button" (click)="switchTo(w.id, wsDd)" [class.active]="w.active">
              <span class="ws-dot"></span>
              <span class="ws-row-name">{{ w.name }}</span>
              @if (w.role === 'owner') { <span class="badge">owner</span> }
              @if (w.active) { <span class="check">✓</span> }
            </button>
          }
          @if (auth.user()?.role !== 'client') {
            <div class="ws-sep"></div>
            <button class="ws-create" type="button" (click)="startCreate()">
              + New workspace
            </button>
          }
          @if (creating()) {
            <form class="ws-create-form" (submit)="$event.preventDefault(); createWs(wsDd)">
              <input
                type="text"
                placeholder="Workspace name"
                [value]="newName()"
                (input)="newName.set(asValue($event))"
                autofocus
              />
              <button type="submit" [disabled]="!newName().trim()">Create</button>
            </form>
          }
        </div>
      </app-dropdown>

      <nav>
        <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">Dashboard</a>
        @if (auth.user()?.role !== 'client') {
          <a routerLink="/connections" routerLinkActive="active">Connections</a>
          <a routerLink="/alerts" routerLinkActive="active">Alerts</a>
        }
        @if (auth.user()?.role === 'admin') {
          <a routerLink="/admin/access" routerLinkActive="active">Admin</a>
        }
      </nav>
      <div class="user">
        <button type="button" class="theme" (click)="theme.toggle()"
                [attr.aria-label]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
                [title]="theme.dark() ? 'Light mode' : 'Dark mode'">
          <span aria-hidden="true">{{ theme.dark() ? '☀' : '🌙' }}</span>
        </button>
        <span>{{ auth.user()?.email }}</span>
        <button type="button" (click)="auth.logout()">Log out</button>
      </div>
    </header>
    <main class="shell-main">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg); color: var(--text); }
    .shell-header {
      display: flex; align-items: center; gap: 1.25rem;
      padding: .75rem 1.5rem;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-bd);
    }
    .brand { font-weight: 600; font-size: 1.05rem; color: var(--text); }
    nav { display: flex; gap: 1rem; flex: 1; }
    nav a { text-decoration: none; color: var(--text-muted); padding: .35rem .75rem; border-radius: .375rem; }
    nav a:hover { background: var(--ghost-bg); }
    nav a.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    .user { display: flex; align-items: center; gap: .75rem; color: var(--text-muted); font-size: .9rem; }
    .user button { background: transparent; border: 1px solid var(--card-bd); padding: .35rem .75rem; border-radius: .375rem; cursor: pointer; color: var(--text); }
    .user button:hover { background: var(--ghost-bg); }
    .theme { font-size: 1rem; padding: .35rem .65rem !important; }
    .shell-main { flex: 1; padding: 1.5rem; max-width: 1280px; margin: 0 auto; width: 100%; }

    .ws-trigger { display: inline-flex; align-items: center; gap: .5rem; min-width: 8rem; font-weight: 500; }
    .ws-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
    .ws-name { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14rem; }

    .ws-menu {
      background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .5rem;
      min-width: 18rem; padding: .5rem; box-shadow: 0 8px 24px rgba(15,23,42,.1);
    }
    :host-context(html.dark) .ws-menu { box-shadow: 0 8px 24px rgba(0,0,0,.4); }
    .ws-menu-head { display: flex; justify-content: space-between; align-items: center; padding: .35rem .5rem; }
    .ws-menu-head strong { font-size: .75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .link-btn { background: transparent; border: 0; color: var(--accent); font-size: .8rem; cursor: pointer; }
    .ws-row {
      display: flex; align-items: center; gap: .5rem;
      width: 100%; padding: .5rem; border: 0; background: transparent;
      border-radius: .35rem; cursor: pointer; color: var(--text); font-size: .9rem;
    }
    .ws-row:hover { background: var(--ghost-bg); }
    .ws-row.active { background: var(--accent-soft); color: var(--accent); }
    .ws-row-name { flex: 1; text-align: left; }
    .badge { background: var(--ghost-bg); color: var(--text-muted); font-size: .65rem; padding: .1rem .4rem; border-radius: 999px; }
    .check { color: var(--accent); font-weight: 600; }
    .ws-sep { height: 1px; background: var(--card-bd); margin: .35rem 0; }
    .ws-create {
      width: 100%; text-align: left; padding: .5rem; border: 0; background: transparent;
      color: var(--text); font-size: .88rem; cursor: pointer; border-radius: .35rem;
    }
    .ws-create:hover { background: var(--ghost-bg); }
    .ws-create-form { display: flex; gap: .35rem; padding: .35rem .5rem; }
    .ws-create-form input {
      flex: 1; padding: .35rem .5rem; border: 1px solid var(--card-bd); border-radius: .35rem;
      background: var(--card-bg); color: var(--text); font-size: .85rem;
    }
    .ws-create-form button {
      background: var(--accent); color: #fff; border: 0; padding: .35rem .65rem;
      border-radius: .35rem; font-size: .8rem; font-weight: 500; cursor: pointer;
    }
    .ws-create-form button:disabled { opacity: .5; cursor: not-allowed; }
  `],
})
export class AppShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly ws = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly status = inject(StatusBarService);

  readonly creating = signal(false);
  readonly newName = signal("");

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.ws.list().catch(() => { /* logged-out flicker; ignore */ });
    }
  }

  asValue(e: Event): string { return (e.target as HTMLInputElement).value; }

  async switchTo(id: string, dd: DropdownComponent): Promise<void> {
    try {
      await this.ws.switchTo(id);
      dd.close();
      // Force a clean reload so all dashboard data reflects the new workspace.
      window.location.reload();
    } catch {
      // Don't reload on failure — keep the user in place so they can retry,
      // and surface a pill so the silent-failure case is obvious.
      this.status.error("Could not switch workspace. Please try again.");
    }
  }

  startCreate(): void {
    this.creating.set(true);
    this.newName.set("");
  }

  async createWs(dd: DropdownComponent): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;
    try {
      const ws = await this.ws.create(name);
      await this.ws.switchTo(ws.id);
      this.creating.set(false);
      dd.close();
      window.location.reload();
    } catch {
      this.status.error("Could not create workspace. Please try again.");
    }
  }

  goSettings(dd: DropdownComponent): void {
    dd.close();
    this.router.navigate(["/workspaces"]);
  }
}
