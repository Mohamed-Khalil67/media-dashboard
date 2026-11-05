import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { NgApexchartsModule, ApexOptions } from "ng-apexcharts";
import { AuthService } from "../../../core/auth.service";
import { ConnectionsService } from "../../../core/connections.service";
import { DashboardService } from "../../../core/dashboard.service";
import { StatusBarService } from "../../../core/status-bar.service";
import { ThemeService } from "../../../core/theme.service";
import {
  Range,
  ShopifyDailyPoint,
  ShopifyOverview,
  ShopifyTopProduct,
  ShopifyTopCustomer,
} from "../../../core/models/metrics.models";
import { Connection } from "../../../core/models/connection.models";
import { KpiCardComponent } from "../components/kpi-card/kpi-card.component";
import { RefreshBarComponent } from "../components/refresh-bar/refresh-bar.component";
import { RangeSelectorComponent } from "../components/range-selector/range-selector.component";
import { DropdownComponent } from "../../../shared/dropdown/dropdown.component";
import { DashboardTabsComponent } from "../dashboard-tabs/dashboard-tabs.component";
import { ShopifySubtabsComponent } from "../shopify-subtabs/shopify-subtabs.component";


@Component({
  selector: "app-shopify-dashboard",
  imports: [
    RouterLink, CurrencyPipe, DecimalPipe, NgApexchartsModule,
    KpiCardComponent, RefreshBarComponent, RangeSelectorComponent, DropdownComponent,
    DashboardTabsComponent, ShopifySubtabsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./shopify-dashboard.component.html",
  styleUrl: "./shopify-dashboard.component.css",
})
export class ShopifyDashboardComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly api = inject(DashboardService);
  private readonly conns = inject(ConnectionsService);
  private readonly status = inject(StatusBarService);
  private readonly theme = inject(ThemeService);

  readonly range = signal<Range>("7d");
  readonly customMode = signal(false);
  readonly customSince = signal(this.daysAgoISO(7));
  readonly customUntil = signal(this.todayISO());
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  readonly syncing = signal(false);
  readonly kpis = signal<ShopifyOverview | null>(null);
  readonly points = signal<ShopifyDailyPoint[]>([]);
  readonly topProducts = signal<ShopifyTopProduct[]>([]);
  readonly topCustomers = signal<ShopifyTopCustomer[]>([]);
  readonly connections = signal<Connection[]>([]);
  readonly selectedConn = signal<string | null>(null);

  readonly shopifyConns = computed(() => this.connections().filter((c) => c.platform === "shopify"));

  readonly conversionSubtext = computed(() => {
    const k = this.kpis();
    if (!k) return null;
    return `across ${k.orders.toLocaleString()} ${k.orders === 1 ? "order" : "orders"}`;
  });

  readonly insights = computed(() => {
    const pts = this.points();
    if (pts.length === 0) {
      return { dailyRevenue: 0, dailyOrders: 0, bestDate: null as string | null, bestRevenue: 0 };
    }
    const totalRev = pts.reduce((s, p) => s + p.revenue, 0);
    const totalOrd = pts.reduce((s, p) => s + p.orders, 0);
    const days = pts.length;
    const best = pts.reduce((acc, p) => (p.revenue > acc.revenue ? p : acc), pts[0]);
    return {
      dailyRevenue: totalRev / days,
      dailyOrders: totalOrd / days,
      bestDate: best.date,
      bestRevenue: best.revenue,
    };
  });

  readonly shopLabel = computed(() => {
    const id = this.selectedConn();
    if (id === null) return "All stores";
    const c = this.shopifyConns().find((x) => x.id === id);
    return c?.accountName ?? c?.accountId ?? "Store";
  });

  readonly chartOpts = computed<ApexOptions>(() => {
    const data = this.points();
    const dark = this.theme.dark();
    const axisColor = dark ? "#94a3b8" : "#64748b";
    const gridColor = dark ? "#334155" : "#e2e8f0";
    return {
      series: [
        { name: "Revenue", type: "area",   data: data.map((p) => p.revenue) },
        { name: "Orders",  type: "column", data: data.map((p) => p.orders) },
      ],
      chart: { type: "line", height: 320, toolbar: { show: false }, fontFamily: "inherit", background: "transparent" },
      theme: { mode: dark ? "dark" : "light" },
      xaxis: { categories: data.map((p) => p.date.slice(5)), labels: { style: { colors: axisColor } } },
      yaxis: [
        { title: { text: "Revenue (E£)", style: { color: axisColor } }, labels: { formatter: (v: number) => `E£${v.toFixed(0)}`, style: { colors: axisColor } } },
        { opposite: true, title: { text: "Orders", style: { color: axisColor } }, labels: { style: { colors: axisColor } } },
      ],
      stroke: { curve: "smooth", width: [2, 0] },
      colors: ["#16a34a", "#a5b4fc"],
      tooltip: { theme: dark ? "dark" : "light" },
      legend: { position: "top", horizontalAlign: "right", labels: { colors: axisColor } },
      dataLabels: { enabled: false },
      grid: { borderColor: gridColor, strokeDashArray: 4 },
    };
  });

  ngOnInit(): void {
    this.loadConnections();
    this.reload();
  }
  ngOnDestroy(): void {
    // Hook kept for symmetry with the FB dashboard; nothing to clean up
    // now that auto-refresh is gone.
  }

  async loadConnections(): Promise<void> {
    try { this.connections.set(await this.conns.list()); } catch { /* non-critical */ }
  }

  selectConn(id: string | null): void {
    this.selectedConn.set(id);
    this.reload();
  }

  pickPreset(r: Range): void {
    this.customMode.set(false);
    this.range.set(r);
    this.reload();
  }

  applyCustomFromShared(ev: { since: string; until: string }): void {
    this.customSince.set(ev.since);
    this.customUntil.set(ev.until);
    this.customMode.set(true);
    this.reload();
  }

  private queryOpts(): { since?: string; until?: string; connectionId?: string } {
    const opts: { since?: string; until?: string; connectionId?: string } = {};
    if (this.customMode()) { opts.since = this.customSince(); opts.until = this.customUntil(); }
    const id = this.selectedConn();
    if (id) opts.connectionId = id;
    return opts;
  }

  async reload(): Promise<void> {
    // First load shows skeletons; subsequent refreshes only toggle the bar
    // pill so the chart and KPIs don't flash empty on every reload.
    if (this.lastUpdated() === null) this.loading.set(true);
    this.refreshing.set(true);
    try {
      const r = this.range();
      const opts = this.queryOpts();
      const [kpis, points, top, customers] = await Promise.all([
        this.api.getShopifyOverview(r, opts),
        this.api.getShopifyTimeseries(r, opts),
        this.api.getShopifyTopProducts(r, opts),
        this.api.getShopifyTopCustomers(r, opts),
      ]);
      this.kpis.set(kpis);
      this.points.set(points);
      this.topProducts.set(top);
      this.topCustomers.set(customers);
      this.lastUpdated.set(new Date());
    } catch {
      this.status.error("Could not load Shopify data");
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  async syncNow(): Promise<void> {
    this.syncing.set(true);
    this.status.info("Syncing Shopify…");
    try {
      const res = await this.conns.syncNow("shopify");
      const ok = res.results.filter((r) => r.ok);
      const fail = res.results.filter((r) => !r.ok);
      const orders = ok.reduce((s, r) => s + (Number(r.details?.orders) || 0), 0);
      if (ok.length === 0 && fail.length === 0) {
        this.status.info("No active Shopify stores to sync.");
      } else if (fail.length === 0) {
        this.status.success(`✓ Synced ${orders} new orders across ${ok.length} ${ok.length === 1 ? "store" : "stores"}`);
      } else {
        this.status.error(`Partial sync: ${ok.length} ok, ${fail.length} failed`);
      }
      await this.reload();
    } catch {
      this.status.error("Sync request failed");
    } finally {
      this.syncing.set(false);
    }
  }

  private todayISO(): string { return new Date().toISOString().slice(0, 10); }
  private daysAgoISO(days: number): string {
    const d = new Date(); d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
