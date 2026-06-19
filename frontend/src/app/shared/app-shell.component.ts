import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../core/auth.service";
import { ThemeService } from "../core/theme.service";

@Component({
  selector: "app-shell",
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="shell-header">
      <div class="brand">📊 Media Dashboard</div>
      <nav>
        <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">Dashboard</a>
        <a routerLink="/connections" routerLinkActive="active">Connections</a>
        <a routerLink="/alerts" routerLinkActive="active">Alerts</a>
      </nav>
      <div class="user">
        <button type="button" class="theme" (click)="theme.toggle()"
                [attr.aria-label]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
                [title]="theme.dark() ? 'Light mode' : 'Dark mode'">
          <span aria-hidden="true">{{ theme.dark() ? '☀' : '🌙' }}</span>
        </button>
        <span>{{ auth.user()?.email }}</span>
        <button type="button" (click)="confirmLogout()">Log out</button>
      </div>
    </header>

    @if (showLogoutConfirm()) {
      <div class="modal-backdrop" (click)="showLogoutConfirm.set(false)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" (click)="$event.stopPropagation()">
          <h2 id="logout-title">Log out & erase synced data?</h2>
          <p>
            Logging out will <strong>permanently delete every connection and the data we've pulled for you</strong>
            from Facebook and Shopify. Your account stays intact so you can log back in — but the next dashboard
            will start empty until you reconnect.
          </p>
          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="showLogoutConfirm.set(false)" [disabled]="loggingOut()">Cancel</button>
            <button type="button" class="btn-danger" (click)="doLogout()" [disabled]="loggingOut()">
              {{ loggingOut() ? "Logging out…" : "Yes, log out and erase data" }}
            </button>
          </div>
        </div>
      </div>
    }

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

    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .55); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; padding: 1.5rem; max-width: 28rem; }
    .modal h2 { margin: 0 0 .75rem; color: var(--text); font-size: 1.15rem; }
    .modal p { color: var(--text-muted); line-height: 1.5; margin: 0 0 1.25rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: .5rem; }
    .btn-ghost, .btn-danger { padding: .5rem 1rem; border-radius: .375rem; font-weight: 500; cursor: pointer; border: 1px solid; font-size: .875rem; }
    .btn-ghost { background: transparent; color: var(--text); border-color: var(--card-bd); }
    .btn-ghost:hover:not(:disabled) { background: var(--ghost-bg); }
    .btn-danger { background: var(--danger); color: #fff; border-color: transparent; }
    .btn-danger:hover:not(:disabled) { opacity: .9; }
    .btn-ghost:disabled, .btn-danger:disabled { opacity: .55; cursor: not-allowed; }
  `],
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  readonly showLogoutConfirm = signal(false);
  readonly loggingOut = signal(false);

  confirmLogout(): void {
    this.showLogoutConfirm.set(true);
  }

  async doLogout(): Promise<void> {
    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.loggingOut.set(false);
      this.showLogoutConfirm.set(false);
    }
  }
}
