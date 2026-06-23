import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../core/auth.service";
import { ThemeService } from "../core/theme.service";

@Component({
  selector: "app-shell",
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="shell-header">
      <div class="brand">
        <span class="signal-dot" aria-hidden="true"></span>
        <span class="brand-name">Media Dashboard</span>
      </div>
      <nav>
        <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">Dashboard</a>
        <a routerLink="/connections" routerLinkActive="active">Connections</a>
        <a class="feedback-link" href="https://docs.google.com/forms/d/e/1FAIpQLScPwD2rY6vZ7549D9Aw0JC-OooPdzE_JpZrpicPMuOZzCTEAA/viewform" target="_blank" rel="noopener">Feedback</a>
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
          <div class="modal-icon" aria-hidden="true">⚠</div>
          <h2 id="logout-title">Log out & erase synced data?</h2>
          <p>
            We'll <strong>permanently delete every connection</strong> and all the data we've pulled for you
            from Facebook and Shopify. Your account stays intact — but the next dashboard starts empty until
            you reconnect.
          </p>
          <ul class="wipe-list">
            <li>Connections & access tokens</li>
            <li>Campaigns, insights & spend history</li>
            <li>Shopify orders & alert rules</li>
          </ul>
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
    .brand { display: flex; align-items: center; gap: .5rem; font-weight: 700; font-size: 1rem; color: var(--text); font-family: var(--font-display, "Space Grotesk", system-ui, sans-serif); letter-spacing: -.01em; }
    .signal-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: var(--accent);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent);
      animation: signal-pulse 2.5s ease-in-out infinite;
    }
    @keyframes signal-pulse {
      0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
      60%  { box-shadow: 0 0 0 5px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    .brand-name { line-height: 1; }
    nav { display: flex; gap: 1rem; flex: 1; }
    nav a { text-decoration: none; color: var(--text-muted); padding: .35rem .75rem; border-radius: .375rem; }
    nav a:hover { background: var(--ghost-bg); }
    nav a.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    nav a.feedback-link { color: var(--accent); border: 1px solid var(--accent-soft); }
    nav a.feedback-link:hover { background: var(--accent-soft); }
    .user { display: flex; align-items: center; gap: .75rem; color: var(--text-muted); font-size: .9rem; }
    .user button { background: transparent; border: 1px solid var(--card-bd); padding: .35rem .75rem; border-radius: .375rem; cursor: pointer; color: var(--text); }
    .user button:hover { background: var(--ghost-bg); }
    .theme { font-size: 1rem; padding: .35rem .65rem !important; }
    .shell-main { flex: 1; padding: 1.5rem; max-width: 1280px; margin: 0 auto; width: 100%; }

    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .65); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
    .modal { background: var(--card-bg); border: 1px solid var(--card-bd); border-top: 3px solid var(--danger); border-radius: .75rem; padding: 1.75rem; max-width: 30rem; width: 100%; box-shadow: 0 24px 64px rgba(0, 0, 0, .35); }
    .modal-icon { width: 2.5rem; height: 2.5rem; border-radius: 50%; background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; margin-bottom: .85rem; }
    .modal h2 { margin: 0 0 .65rem; color: var(--text); font-size: 1.2rem; font-weight: 600; }
    .modal p { color: var(--text-muted); line-height: 1.55; margin: 0 0 1rem; font-size: .9rem; }
    .wipe-list { list-style: none; padding: 0; margin: 0 0 1.25rem; font-size: .82rem; color: var(--text-muted); }
    .wipe-list li { padding: .3rem 0 .3rem 1.25rem; position: relative; }
    .wipe-list li::before { content: "×"; position: absolute; left: 0; color: var(--danger); font-weight: 700; }
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
