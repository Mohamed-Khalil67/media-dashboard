import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../core/auth.service";

@Component({
  selector: "app-shell",
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="shell-header">
      <div class="brand">📊 Media Dashboard</div>
      <nav>
        <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
        <a routerLink="/connections" routerLinkActive="active">Connections</a>
        <a routerLink="/alerts" routerLinkActive="active">Alerts</a>
      </nav>
      <div class="user">
        <span>{{ auth.user()?.email }}</span>
        <button type="button" (click)="auth.logout()">Log out</button>
      </div>
    </header>
    <main class="shell-main">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; background: #f8fafc; }
    .shell-header {
      display: flex; align-items: center; gap: 2rem;
      padding: .75rem 1.5rem; background: #fff;
      border-bottom: 1px solid #e2e8f0;
    }
    .brand { font-weight: 600; font-size: 1.05rem; }
    nav { display: flex; gap: 1rem; flex: 1; }
    nav a {
      text-decoration: none; color: #475569; padding: .35rem .75rem; border-radius: .375rem;
    }
    nav a.active { background: #eef2ff; color: #4338ca; font-weight: 500; }
    .user { display: flex; align-items: center; gap: .75rem; color: #64748b; font-size: .9rem; }
    .user button {
      background: transparent; border: 1px solid #cbd5e1; padding: .35rem .75rem;
      border-radius: .375rem; cursor: pointer; color: #334155;
    }
    .user button:hover { background: #f1f5f9; }
    .shell-main { flex: 1; padding: 1.5rem; max-width: 1200px; margin: 0 auto; width: 100%; }
  `],
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
}
