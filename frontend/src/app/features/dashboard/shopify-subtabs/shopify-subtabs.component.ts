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
  templateUrl: "./shopify-subtabs.component.html",
  styleUrl: "./shopify-subtabs.component.css",
})
export class ShopifySubtabsComponent {}
