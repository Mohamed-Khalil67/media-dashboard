import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

/**
 * Sub-navigation between the Shopify dashboard's two pages: Overview (KPIs + chart)
 * and Orders (the paginated orders list). Lives below the top-level
 * dashboard tabs and inside both Shopify-side pages so the layout stays
 * symmetric — same chrome, just different content below.
 */
@Component({
  selector: "app-shopify-subtabs",
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="subtabs" aria-label="Shopify section">
      <a routerLink="/dashboard/shopify" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        Overview
      </a>
      <a routerLink="/dashboard/shopify/orders" routerLinkActive="active">
        Orders
      </a>
    </nav>
  `,
  styles: [`
    .subtabs {
      display: inline-flex; gap: .15rem;
      padding: .2rem;
      background: var(--ghost-bg, #f1f5f9);
      border-radius: .5rem;
      margin-bottom: 1rem;
    }
    a {
      text-decoration: none; color: var(--text-muted);
      padding: .35rem .85rem; border-radius: .375rem;
      font-size: .85rem; font-weight: 500;
    }
    a:hover { color: var(--text); }
    a.active { background: var(--card-bg); color: var(--text); box-shadow: 0 1px 2px rgba(15,23,42,.06); }
  `],
})
export class ShopifySubtabsComponent {}
