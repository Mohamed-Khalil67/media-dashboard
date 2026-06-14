import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { CurrencyPipe } from "@angular/common";
import { NgApexchartsModule, ApexOptions } from "ng-apexcharts";
import { AuthService } from "../../core/auth.service";
import { ConnectionsService } from "../../core/connections.service";
import { DashboardService } from "../../core/dashboard.service";
import { StatusBarService } from "../../core/status-bar.service";
import { ThemeService } from "../../core/theme.service";
import {
  Range,
  ShopifyDailyPoint,
  ShopifyOverview,
  ShopifyTopProduct,
  ShopifyTopCustomer,
} from "../../core/models/metrics.models";
import { Connection } from "../../core/models/connection.models";
import { KpiCardComponent } from "./components/kpi-card.component";
import { RefreshBarComponent } from "./components/refresh-bar.component";
import { RangeSelectorComponent } from "./components/range-selector.component";
import { DropdownComponent } from "../../shared/dropdown.component";
import { DashboardTabsComponent } from "./dashboard-tabs.component";
import { ShopifySubtabsComponent } from "./shopify-subtabs.component";


@Component({
  selector: "app-shopify-dashboard",
  imports: [
    RouterLink, CurrencyPipe, NgApexchartsModule,
    KpiCardComponent, RefreshBarComponent, RangeSelectorComponent, DropdownComponent,
    DashboardTabsComponent, ShopifySubtabsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dashboard-tabs />
    <app-shopify-subtabs />

    <header class="page-head">
      <div>
        <h1>Shopify Dashboard</h1>
        <p class="muted">Real orders + revenue, separate from ad-attributed numbers.</p>
      </div>
      <div class="actions">
        <app-refresh-bar [lastUpdated]="lastUpdated()" [refreshing]="refreshing()" (refresh)="reload()" />

        <app-range-selector
          [range]="range()"
          [customMode]="customMode()"
          [customSince]="customSince()"
          [customUntil]="customUntil()"
          (pickPreset)="pickPreset($event)"
          (updateCustomSince)="customSince.set($event)"
          (updateCustomUntil)="customUntil.set($event)"
          (applyCustom)="applyCustomFromShared($event)" />

        @if (shopifyConns().length > 0) {
          <app-dropdown #shopDD>
            <span trigger>
              <span class="ico">🛒</span>
              <span class="lbl">{{ shopLabel() }}</span>
            </span>
            <div menu class="acct-menu">
              <button class="acct-item" [class.active]="selectedConn() === null" (click)="selectConn(null); shopDD.close()">
                <span>All stores</span>
                <span class="check">{{ selectedConn() === null ? '✓' : '' }}</span>
              </button>
              <div class="divider"></div>
              @for (c of shopifyConns(); track c.id) {
                <button class="acct-item" [class.active]="selectedConn() === c.id" (click)="selectConn(c.id); shopDD.close()">
                  <span>{{ c.accountName ?? c.accountId }}</span>
                  <span class="check">{{ selectedConn() === c.id ? '✓' : '' }}</span>
                </button>
              }
            </div>
          </app-dropdown>
        }

        <button class="sync" (click)="syncNow()" [disabled]="syncing()">
          {{ syncing() ? "Syncing…" : "Sync now" }}
        </button>
      </div>
    </header>

    @if (loading()) {
      <div class="kpi-grid">
        @for (i of [1,2,3,4]; track i) {<div class="skeleton-card"></div>}
      </div>
    } @else if (shopifyConns().length === 0) {
      <section class="empty">
        <h2>No Shopify store connected</h2>
        <p>Connect a Shopify store to see orders, revenue, and conversion data here.</p>
        <a routerLink="/connections" class="primary-link">Go to Connections →</a>
      </section>
    } @else if (!kpis() || kpis()!.orders === 0) {
      <section class="empty">
        <h2>No orders yet in this period</h2>
        <p>Try a longer date range, or sync to pull the latest orders.</p>
      </section>
    } @else {
      <section class="kpi-grid">
        <app-kpi-card label="Revenue"          [value]="kpis()!.revenue" prefix="E£" [delta]="kpis()!.delta.revenue" [previous]="kpis()!.previous.revenue" />
        <app-kpi-card label="Orders"           [value]="kpis()!.orders"               [delta]="kpis()!.delta.orders"  [previous]="kpis()!.previous.orders" />
        <app-kpi-card label="AOV"              [value]="kpis()!.aov"      prefix="E£" format="1.2-2" [delta]="kpis()!.delta.aov" [previous]="kpis()!.previous.aov" />
        <app-kpi-card label="Conversion rate"  [value]="kpis()!.conversionRate * 100" suffix="%" format="1.2-2" />
      </section>

      <section class="card">
        <header class="card-head">
          <h3>Revenue & orders over time</h3>
          <p class="muted">{{ points().length }} day window</p>
        </header>
        @if (points().length === 0) {
          <div class="empty-small">No data for this period.</div>
        } @else {
          <apx-chart
            [series]="chartOpts().series!"
            [chart]="chartOpts().chart!"
            [xaxis]="chartOpts().xaxis!"
            [yaxis]="chartOpts().yaxis!"
            [stroke]="chartOpts().stroke!"
            [colors]="chartOpts().colors!"
            [tooltip]="chartOpts().tooltip!"
            [legend]="chartOpts().legend!"
            [dataLabels]="chartOpts().dataLabels!"
            [grid]="chartOpts().grid!"
            [theme]="chartOpts().theme!"
          />
        }
      </section>

      <div class="two-col">
        <section class="card list-card">
          <header class="card-head">
            <h3>Top products</h3>
            <p class="muted">By revenue</p>
          </header>
          @if (topProducts().length === 0) {
            <div class="empty-small">No products sold in this period.</div>
          } @else {
            <ol class="rank-list">
              @for (p of topProducts(); track p.title; let i = $index) {
                <li>
                  <span class="rank">{{ i + 1 }}</span>
                  <span class="rank-title" [title]="p.sku ?? ''">{{ p.title }}</span>
                  <span class="rank-meta">{{ p.units }} units</span>
                  <span class="rank-num"><strong>{{ p.revenue | currency: "USD":"symbol":"1.0-0" }}</strong></span>
                </li>
              }
            </ol>
          }
        </section>

        <section class="card list-card">
          <header class="card-head">
            <h3>Top customers</h3>
            <p class="muted">By spend</p>
          </header>
          @if (topCustomers().length === 0) {
            <div class="empty-small">No customers yet in this period.</div>
          } @else {
            <ol class="rank-list">
              @for (c of topCustomers(); track c.email; let i = $index) {
                <li>
                  <span class="rank">{{ i + 1 }}</span>
                  <span class="rank-title">{{ c.email }}</span>
                  <span class="rank-meta">{{ c.orders }} {{ c.orders === 1 ? "order" : "orders" }}</span>
                  <span class="rank-num"><strong>{{ c.revenue | currency: "USD":"symbol":"1.0-0" }}</strong></span>
                </li>
              }
            </ol>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .page-head h1 { margin: 0 0 .25rem; color: var(--text); }
    .muted { color: var(--text-muted); margin: 0; }
    .actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .ico { font-size: .95rem; }
    .lbl { font-weight: 500; color: var(--text); }
    .sync { background: #16a34a; color: #fff; border: 0; padding: .5rem 1rem; border-radius: .5rem; cursor: pointer; font-weight: 500; font-size: .85rem; }
    .sync:hover:not(:disabled) { background: #15803d; }
    .sync:disabled { opacity: .55; cursor: not-allowed; }

    .acct-menu { padding: .25rem; min-width: 18rem; }
    .acct-item { width: 100%; display: flex; justify-content: space-between; align-items: center; background: transparent; border: 0; padding: .45rem .55rem; border-radius: .375rem; cursor: pointer; color: var(--text); font-size: .85rem; text-align: left; }
    .acct-item:hover { background: var(--ghost-bg); }
    .acct-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    .check { color: #16a34a; font-weight: 600; }
    .divider { height: 1px; background: var(--card-bd); margin: .25rem .25rem; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 900px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    .card { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    .card-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .5rem; }
    .card-head h3 { margin: 0; font-size: 1rem; color: var(--text); }
    .empty { background: var(--card-bg); border: 1px dashed var(--input-bd); border-radius: .75rem; padding: 3rem 2rem; text-align: center; color: var(--text-muted); }
    .empty h2 { margin-top: 0; color: var(--text); }
    .empty-small { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: .9rem; }
    .primary-link { color: var(--accent); font-weight: 500; text-decoration: none; }
    .primary-link:hover { text-decoration: underline; }
    .skeleton-card { height: 7.5rem; background: var(--card-bg); border-radius: .75rem; border: 1px solid var(--card-bd); background-image: linear-gradient(90deg, var(--card-bg) 0%, var(--ghost-bg) 50%, var(--card-bg) 100%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
    .list-card { padding: 1.1rem 1.25rem; }
    .rank-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .4rem; }
    .rank-list li {
      display: grid;
      grid-template-columns: 1.4rem 1fr auto auto;
      gap: .65rem; align-items: baseline;
      padding: .5rem .15rem;
      border-bottom: 1px solid var(--card-bd);
    }
    .rank-list li:last-child { border-bottom: 0; }
    .rank { color: var(--text-muted); font-size: .8rem; font-variant-numeric: tabular-nums; text-align: right; }
    .rank-title { color: var(--text); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rank-meta { color: var(--text-muted); font-size: .78rem; }
    .rank-num { font-variant-numeric: tabular-nums; color: var(--text); }
  `],
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
