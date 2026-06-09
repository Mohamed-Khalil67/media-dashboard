import { Component, inject } from "@angular/core";
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
        <button type="button" class="theme" (click)="theme.toggle()" [title]="theme.dark() ? 'Light mode' : 'Dark mode'">
          {{ theme.dark() ? '☀' : '🌙' }}
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
      display: flex; align-items: center; gap: 2rem;
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
  `],
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
}
