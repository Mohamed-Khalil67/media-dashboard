import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

@Component({
  selector: "app-dashboard-tabs",
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tabs">
      <a routerLink="/dashboard/facebook" routerLinkActive="active">
        <span class="dot dot--fb"></span> Facebook
      </a>
      <a routerLink="/dashboard/tiktok" routerLinkActive="active">
        <span class="dot dot--tk"></span> TikTok
      </a>
      <a routerLink="/dashboard/shopify" routerLinkActive="active">
        <span class="dot dot--sh"></span> Shopify
      </a>
    </nav>
  `,
  styles: [`
    .tabs { display: flex; gap: .25rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--card-bd); padding-bottom: 0; }
    a {
      display: flex; align-items: center; gap: .5rem;
      padding: .55rem 1rem; text-decoration: none; color: var(--text-muted); font-size: .9rem; font-weight: 500;
      border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s, border-color .15s;
    }
    a:hover { color: var(--text); }
    a.active { color: var(--accent); border-bottom-color: var(--accent); }
    .dot { width: .55rem; height: .55rem; border-radius: 999px; display: inline-block; }
    .dot--fb { background: #1e40af; }
    .dot--tk { background: #ec4899; }
    .dot--sh { background: #16a34a; }
  `],
})
export class DashboardTabsComponent {}
