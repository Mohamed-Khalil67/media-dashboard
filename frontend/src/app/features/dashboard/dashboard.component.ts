import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { AuthService } from "../../core/auth.service";
import { ConnectionsService } from "../../core/connections.service";
import { DashboardService, AdPlatform } from "../../core/dashboard.service";
import { AlertsService } from "../../core/alerts.service";
import { StatusBarService } from "../../core/status-bar.service";
import {
  CampaignAggregate,
  OverviewKpis,
  Range,
  TimeseriesPoint,
} from "../../core/models/metrics.models";
import { EvaluatedAlert } from "../../core/models/alerts.models";
import { Connection } from "../../core/models/connection.models";
import { KpiCardComponent } from "./components/kpi-card.component";
import { RoasChartComponent } from "./components/roas-chart.component";
import { CampaignTableComponent } from "./components/campaign-table.component";
import { FunnelComponent } from "./components/funnel.component";
import { AlertsPanelComponent } from "./components/alerts-panel.component";
import { RefreshBarComponent } from "./components/refresh-bar.component";
import { RangeSelectorComponent } from "./components/range-selector.component";
import { DropdownComponent } from "../../shared/dropdown.component";
import { DashboardTabsComponent } from "./dashboard-tabs.component";


@Component({
  selector: "app-dashboard",
  imports: [
    RouterLink,
    CurrencyPipe,
    DecimalPipe,
    KpiCardComponent,
    RoasChartComponent,
    CampaignTableComponent,
    FunnelComponent,
    AlertsPanelComponent,
    RefreshBarComponent,
    RangeSelectorComponent,
    DropdownComponent,
    DashboardTabsComponent,
  ],
  template: `
    <app-dashboard-tabs />

    <header class="page-head">
      <div>
        <h1>{{ platformLabel() }} Dashboard</h1>
        <div class="status-row">
          <span class="muted">Welcome back, {{ auth.user()?.name ?? auth.user()?.email }}.</span>
          <app-refresh-bar [lastUpdated]="lastUpdated()" [refreshing]="refreshing()" [nextRefreshIn]="nextRefreshIn()" (refresh)="reload()" />
          @if (kpis() && campaigns().length > 0) {
            <span class="pill pill--info">
              {{ campaigns().length }} campaigns • {{ activeAccountCount() }} {{ activeAccountCount() === 1 ? 'account' : 'accounts' }}
            </span>
          }
        </div>
      </div>
      <div class="actions">

        <!-- Date range dropdown — shared with the Shopify dashboard -->
        <app-range-selector
          [range]="range()"
          [customMode]="customMode()"
          [customSince]="customSince()"
          [customUntil]="customUntil()"
          (pickPreset)="pickPreset($event)"
          (updateCustomSince)="customSince.set($event)"
          (updateCustomUntil)="customUntil.set($event)"
          (applyCustom)="applyCustomFromShared($event)" />

        <!-- Account selector dropdown -->
        @if (fbConnections().length > 0) {
          <app-dropdown #acctDD>
            <span trigger>
              <span class="ico">🏢</span>
              <span class="lbl">{{ accountLabel() }}</span>
            </span>
            <div menu class="acct-menu">
              <input
                class="acct-search"
                type="search"
                placeholder="Search accounts…"
                [value]="acctSearch()"
                (input)="acctSearch.set($any($event.target).value)" />
              <button
                class="acct-item"
                [class.active]="selectedConn() === null"
                (click)="selectConn(null); acctDD.close()">
                <span>All accounts</span>
                <span class="check">{{ selectedConn() === null ? '✓' : '' }}</span>
              </button>
              <div class="divider"></div>
              <div class="acct-list">
                @for (c of filteredAccounts(); track c.id) {
                  <button
                    class="acct-item"
                    [class.active]="selectedConn() === c.id"
                    (click)="selectConn(c.id); acctDD.close()">
                    <span class="acct-name">
                      {{ c.accountName ?? c.accountId }}
                      @if (c.status === 'expired') { <span class="exp-dot" title="Expired">●</span> }
                    </span>
                    <span class="check">{{ selectedConn() === c.id ? '✓' : '' }}</span>
                  </button>
                }
                @if (filteredAccounts().length === 0) {
                  <div class="empty-small">No matches</div>
                }
              </div>
            </div>
          </app-dropdown>
        }

        <button class="sync" (click)="syncNow()" [disabled]="syncing()">
          {{ syncing() ? "Syncing…" : "Sync now" }}
        </button>
      </div>
    </header>

    @if (loadError(); as msg) {
      <div class="health-banner health-banner--err">
        <strong>{{ msg }}</strong>
        <a (click)="reload()" style="cursor: pointer">Retry →</a>
      </div>
    }
    @if (isStale()) {
      <div class="health-banner health-banner--stale">
        <strong>Data is from {{ lastUpdatedRel() }} — syncing paused.</strong>
        <span>Fresh data syncs only while your media buyer is active. You can still browse and filter what's already loaded.</span>
      </div>
    }
    @if (expiredConnections().length > 0) {
      <div class="health-banner">
        <strong>{{ expiredConnections().length }} account{{ expiredConnections().length > 1 ? 's' : '' }} expired.</strong>
        Data may be out of date. <a routerLink="/connections">Reconnect →</a>
      </div>
    }
    @if (failedConnections().length > 0) {
      <div class="health-banner health-banner--err">
        <strong>{{ failedConnections().length }} account{{ failedConnections().length > 1 ? 's' : '' }} failing to sync.</strong>
        {{ failedConnections()[0].lastSyncError ?? 'Unknown error' }}
        <a routerLink="/connections">View details →</a>
      </div>
    }

    @if (loading()) {
      <div class="kpi-grid">
        @for (i of [1,2,3,4,5,6]; track i) {<div class="skeleton skeleton-card"></div>}
      </div>
    } @else if (!kpis() && fbConnections().length === 0) {
      <section class="empty">
        <div class="empty-art" aria-hidden="true">📡</div>
        <h2>Let's pull in your first numbers</h2>
        <p>Connect a Facebook ad account with your own app credentials and we'll start syncing spend, ROAS and orders every couple of minutes — automatically.</p>
        <div class="empty-actions">
          <a routerLink="/connections" class="cta-primary">Connect Facebook Ads →</a>
          <a routerLink="/connections" class="cta-ghost">or connect Shopify</a>
        </div>
        <p class="empty-hint">You'll need your own Facebook App ID + App Secret. We'll walk you through it.</p>
      </section>
    } @else if (!kpis() && fbConnections().length > 0) {
      <section class="empty">
        <div class="empty-art" aria-hidden="true">⏳</div>
        <h2>Syncing your first data…</h2>
        <p>Your account is connected. We're pulling in campaigns and insights — this usually takes under a minute.</p>
        <p class="empty-hint">The dashboard updates automatically. You can also hit <strong>Sync now</strong> above to trigger it immediately.</p>
      </section>
    } @else {
      <section class="kpi-grid">
        <app-kpi-card label="Spend"   [value]="kpis()!.spend"     prefix="E£" [delta]="kpis()!.delta.spend"   [previous]="kpis()!.previous.spend"   [trend]="spendTrend()" />
        <app-kpi-card label="Revenue" [value]="kpis()!.revenue"   prefix="E£" [delta]="kpis()!.delta.revenue" [previous]="kpis()!.previous.revenue" [trend]="revenueTrend()" />
        <app-kpi-card label="ROAS"    [value]="kpis()!.roas"      suffix="x" format="1.2-2" [delta]="kpis()!.delta.roas" [previous]="kpis()!.previous.roas" [trend]="roasTrend()" />
        <app-kpi-card label="Orders"  [value]="kpis()!.orders"               [delta]="kpis()!.delta.orders" [previous]="kpis()!.previous.orders" />
        <app-kpi-card label="AOV"     [value]="kpis()!.aov"       prefix="E£" format="1.2-2" [subtext]="aovSubtext()" />
        <app-kpi-card label="CTR"     [value]="kpis()!.ctr * 100" suffix="%" format="1.2-2" [subtext]="ctrSubtext()" />
      </section>

      <section class="insights-row">
        <article class="card pacing">
          <h3>Pacing & health</h3>
          <div class="stat-grid">
            <div class="stat">
              <span class="stat-label">Daily spend</span>
              <span class="stat-value">{{ pacing().dailyAvg | currency: "EGP":"symbol":"1.0-0" }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ pacing().days }}-day projected</span>
              <span class="stat-value">{{ pacing().projected | currency: "EGP":"symbol":"1.0-0" }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Active campaigns</span>
              <span class="stat-value">{{ campaignStats().active }}<small> / {{ campaignStats().total }}</small></span>
              <span class="stat-sub muted">{{ campaignStats().pct }}% live</span>
            </div>
            <div class="stat">
              <span class="stat-label">Delivery stalled</span>
              <span class="stat-value" [class.warn]="campaignStats().stalled > 0">{{ campaignStats().stalled }}</span>
              <span class="stat-sub muted">{{ campaignStats().stalled === 0 ? "All running" : "needs attention" }}</span>
            </div>
          </div>
        </article>
        <article class="card top">
          <h3>Top performers <small class="muted">by ROAS</small></h3>
          @if (topPerformers().length === 0) {
            <p class="muted">No campaigns with spend yet.</p>
          } @else {
            <ol>
              @for (c of topPerformers(); track c.campaignId) {
                <li>
                  <span class="rank">{{ $index + 1 }}</span>
                  <span class="t-name" [title]="c.name">{{ c.name }}</span>
                  <span class="t-spend muted">{{ c.spend | currency: "EGP":"symbol":"1.0-0" }}</span>
                  <span class="t-roas">{{ c.roas | number: "1.2-2" }}x</span>
                </li>
              }
            </ol>
          }
        </article>
      </section>

      <section class="row">
        <div class="col col--wide">
          <app-roas-chart [points]="timeseries()" />
        </div>
        <div class="col col--stack">
          <app-funnel [kpis]="kpis()" />
          <app-alerts-panel [alerts]="alerts()" />
        </div>
      </section>

      <section class="full"><app-campaign-table [campaigns]="campaigns()" (changed)="reload()" /></section>
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .page-head h1 { margin: 0 0 .25rem; color: var(--text); font-family: var(--font-display, "Space Grotesk", system-ui, sans-serif); letter-spacing: -.02em; }
    .muted { color: var(--text-muted); margin: 0; }
    .status-row { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; }
    .pill { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .55rem; background: var(--ghost-bg); border: 1px solid var(--card-bd); border-radius: 999px; font-size: .75rem; color: var(--text-muted); }
    .pill--info { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
    .actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .ico { font-size: .95rem; }
    .lbl { font-weight: 500; color: var(--text); }
    .sync { background: var(--accent); color: var(--accent-on); border: 0; padding: .5rem 1rem; border-radius: .5rem; cursor: pointer; font-weight: 500; font-size: .85rem; font-family: var(--font-display, "Space Grotesk", system-ui, sans-serif); }
    .sync:hover:not(:disabled) { opacity: .88; }
    .sync:disabled { opacity: .55; cursor: not-allowed; }

    .acct-menu { padding: .25rem; min-width: 18rem; }
    .acct-search { width: 100%; border: 1px solid var(--input-bd); border-radius: .375rem; padding: .4rem .55rem; background: var(--card-bg); color: var(--text); font-size: .85rem; outline: none; margin-bottom: .25rem; }
    .acct-search:focus { border-color: var(--accent); outline: none; }
    .acct-list { max-height: 16rem; overflow-y: auto; }
    .acct-item { width: 100%; display: flex; justify-content: space-between; align-items: center; background: transparent; border: 0; padding: .45rem .55rem; border-radius: .375rem; cursor: pointer; color: var(--text); font-size: .85rem; text-align: left; }
    .acct-item:hover { background: var(--ghost-bg); }
    .acct-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    .acct-name { display: flex; align-items: center; gap: .35rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .check { color: var(--accent); font-weight: 600; }
    .divider { height: 1px; background: var(--card-bd); margin: .25rem .25rem; }
    .exp-dot { color: #f59e0b; font-size: .6rem; }
    .empty-small { padding: 1rem; text-align: center; color: var(--text-muted); font-size: .85rem; }


    .health-banner { background: #fef3c7; border: 1px solid #fbbf24; color: #92400e; padding: .65rem 1rem; border-radius: .5rem; margin-bottom: 1rem; font-size: .9rem; }
    .health-banner a { color: #b45309; font-weight: 500; text-decoration: none; margin-left: .25rem; }
    :host-context(html.dark) .health-banner { background: #78350f; border-color: #f59e0b; color: #fcd34d; }
    :host-context(html.dark) .health-banner a { color: #fbbf24; }
    .health-banner a:hover { text-decoration: underline; }
    .health-banner--err { background: #fee2e2; border-color: #f87171; color: #991b1b; }
    .health-banner--err a { color: #b91c1c; }
    :host-context(html.dark) .health-banner--err { background: #7f1d1d; border-color: #b91c1c; color: #fca5a5; }
    :host-context(html.dark) .health-banner--err a { color: #fca5a5; }
    .health-banner--stale { display: flex; flex-direction: column; gap: .2rem; }
    .health-banner--stale span { font-size: .8rem; opacity: .9; font-weight: 400; }

    .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 600px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    .insights-row { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 900px) { .insights-row { grid-template-columns: 1fr; } }
    .card { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; padding: 1rem 1.25rem; }
    .card h3 { margin: 0 0 .65rem; font-size: 1rem; color: var(--text); display: flex; align-items: baseline; gap: .4rem; }
    .card h3 small { font-size: .75rem; font-weight: 400; }

    /* Pacing — compact 2x2 stat grid so the card fills its height instead of leaving white space */
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem .9rem; }
    .stat { display: flex; flex-direction: column; gap: .1rem; padding: .35rem 0; }
    .stat-label { font-size: .72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; font-weight: 500; }
    .stat-value { font-size: 1.35rem; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1.15; }
    .stat-value small { font-size: .85rem; color: var(--muted); font-weight: 400; }
    .stat-value.warn { color: #dc2626; }
    .stat-sub { font-size: .72rem; }

    .top ol { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .25rem; }
    .top li { display: grid; grid-template-columns: 1.4rem 1fr auto auto; gap: .65rem; align-items: center; font-size: .85rem; padding: .15rem 0; }
    .top .rank { width: 1.4rem; height: 1.4rem; border-radius: 999px; background: var(--ghost-bg); color: var(--accent); text-align: center; line-height: 1.4rem; font-size: .7rem; font-weight: 600; }
    .top .t-name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .top .t-spend { font-size: .78rem; font-variant-numeric: tabular-nums; }
    .top .t-roas { color: #16a34a; font-weight: 500; font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: right; }
    .row { display: grid; grid-template-columns: 2fr 1fr; gap: .85rem; margin-bottom: .85rem; align-items: stretch; }
    @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
    .col--wide { min-width: 0; display: flex; flex-direction: column; min-height: 28rem; }
    .col--wide > app-roas-chart { flex: 1 1 0; min-height: 0; }
    @media (max-width: 900px) { .col--wide { min-height: 22rem; } }
    .col--stack { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
    .col--stack > app-funnel { flex: 0 0 auto; }
    .col--stack > app-alerts-panel { flex: 1 1 0; min-height: 18rem; }
    @media (max-width: 900px) {
      .col--stack > app-alerts-panel { flex: 0 0 auto; max-height: 26rem; }
    }
    .full { margin-bottom: 1rem; }
    .empty {
      background: linear-gradient(160deg, var(--card-bg) 0%, color-mix(in srgb, var(--accent) 6%, var(--card-bg)) 100%);
      border: 1px solid var(--card-bd); border-radius: 1rem;
      padding: 3.5rem 2rem; text-align: center; color: var(--text-muted);
      max-width: 36rem; margin: 1rem auto;
    }
    .empty-art { font-size: 2.75rem; margin-bottom: .75rem; opacity: .9; }
    .empty h2 { margin: 0 0 .75rem; color: var(--text); font-size: 1.35rem; font-weight: 600; }
    .empty p { margin: 0 auto 1.5rem; max-width: 28rem; line-height: 1.55; }
    .empty-actions { display: flex; gap: .65rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem; }
    .cta-primary {
      background: var(--accent); color: #fff; padding: .65rem 1.25rem;
      border-radius: .55rem; font-weight: 500; text-decoration: none; font-size: .92rem;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 32%, transparent);
      transition: opacity .15s, transform .1s;
    }
    .cta-primary:hover { opacity: .92; transform: translateY(-1px); }
    .cta-ghost { color: var(--text-muted); padding: .65rem 1rem; text-decoration: none; font-size: .9rem; }
    .cta-ghost:hover { color: var(--text); text-decoration: underline; }
    .empty-hint { font-size: .78rem; color: var(--text-muted); margin: 0; opacity: .8; }
    .skeleton-card { height: 7.5rem; background: var(--card-bg); border-radius: .75rem; border: 1px solid var(--card-bd); background-image: linear-gradient(90deg, var(--card-bg) 0%, var(--ghost-bg) 50%, var(--card-bg) 100%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly api = inject(DashboardService);
  private readonly conns = inject(ConnectionsService);
  private readonly alertsApi = inject(AlertsService);
  private readonly status = inject(StatusBarService);
  /** Only media buyers can trigger writes (sync, connect, delete). Clients are read-only. */
  readonly loadError = signal<string | null>(null);

  /** Bound from the route param /dashboard/:platform — "facebook" or "shopify". */
  readonly platform = input<AdPlatform>("facebook");
  readonly platformLabel = computed(() => "Facebook");

  readonly range = signal<Range>("7d");
  readonly customMode = signal(false);
  readonly customSince = signal(this.daysAgoISO(7));
  readonly customUntil = signal(this.todayISO());
  readonly acctSearch = signal("");
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly kpis = signal<OverviewKpis | null>(null);
  readonly timeseries = signal<TimeseriesPoint[]>([]);
  readonly campaigns = signal<CampaignAggregate[]>([]);
  readonly alerts = signal<EvaluatedAlert[]>([]);
  readonly connections = signal<Connection[]>([]);
  readonly selectedConn = signal<string | null>(null);
  readonly lastUpdated = signal<Date | null>(null);
  readonly refreshing = signal(false);
  readonly nowTick = signal(Date.now());

  readonly AUTO_REFRESH_MS = 90_000;
  readonly nextRefreshAt = signal<Date | null>(null);
  readonly nextRefreshIn = computed(() => {
    const t = this.nextRefreshAt();
    if (!t) return null;
    return Math.max(0, Math.round((t.getTime() - this.nowTick()) / 1000));
  });

  /** Sparkline series derived from the timeseries signal. */
  readonly spendTrend  = computed(() => this.timeseries().map(p => p.spend));
  readonly revenueTrend = computed(() => this.timeseries().map(p => p.revenue));
  readonly roasTrend   = computed(() => this.timeseries().map(p => p.roas));

  /** Connections relevant to the current platform tab. */
  readonly fbConnections = computed(() =>
    this.connections().filter((c) => c.platform === this.platform())
  );

  readonly filteredAccounts = computed(() => {
    const q = this.acctSearch().trim().toLowerCase();
    if (!q) return this.fbConnections();
    return this.fbConnections().filter((c) => (c.accountName ?? c.accountId).toLowerCase().includes(q));
  });

  readonly failedConnections = computed(() =>
    this.connections().filter((c) => c.lastSyncOk === false && c.status !== "expired")
  );

  readonly expiredConnections = computed(() =>
    this.connections().filter((c) => c.status === "expired")
  );

  readonly topPerformers = computed(() =>
    [...this.campaigns()]
      .filter((c) => c.spend > 0 && c.roas > 0)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 5)
  );

  readonly pacing = computed(() => {
    const points = this.timeseries();
    const totalSpend = points.reduce((s, p) => s + p.spend, 0);
    const daysWithSpend = points.filter((p) => p.spend > 0).length || 1;
    const dailyAvg = totalSpend / daysWithSpend;
    const days = points.length || 7;
    return { dailyAvg, days, projected: dailyAvg * days };
  });

  readonly aovSubtext = computed(() => {
    const k = this.kpis();
    if (!k) return null;
    return `across ${k.orders.toLocaleString()} ${k.orders === 1 ? "order" : "orders"}`;
  });

  readonly ctrSubtext = computed(() => {
    const k = this.kpis();
    if (!k) return null;
    return `${k.clicks.toLocaleString()} clicks of ${k.impressions.toLocaleString()} impressions`;
  });

  readonly campaignStats = computed(() => {
    const all = this.campaigns();
    const active = all.filter((c) => c.status?.toUpperCase() === "ACTIVE").length;
    const stalled = all.filter((c) => c.deliveryStalled).length;
    const pct = all.length > 0 ? Math.round((active / all.length) * 100) : 0;
    return { active, total: all.length, stalled, pct };
  });

  readonly accountLabel = computed(() => {
    const id = this.selectedConn();
    if (id === null) return "All accounts";
    const c = this.fbConnections().find((x) => x.id === id);
    return c?.accountName ?? c?.accountId ?? "Account";
  });

  readonly activeAccountCount = computed(() => {
    if (this.selectedConn() !== null) return 1;
    const ids = new Set(this.campaigns().map((c) => c.connectionId));
    return ids.size;
  });

  readonly lastUpdatedRel = computed(() => {
    const t = this.lastUpdated();
    if (!t) return "";
    const sec = Math.floor((this.nowTick() - t.getTime()) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  });

  /**
   * True when the data hasn't refreshed in over 4 hours. We use this to show a
   * "syncing paused" banner — outside the activity window the backend cron skips
   * this user's connections, so the dashboard is stale by design.
   */
  readonly STALE_THRESHOLD_HOURS = 4;
  readonly isStale = computed(() => {
    const t = this.lastUpdated();
    if (!t) return false;
    const hours = (this.nowTick() - t.getTime()) / (1000 * 60 * 60);
    return hours >= this.STALE_THRESHOLD_HOURS;
  });

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // React to platform changes (route param change) — reset selected account + reload data.
    let prevPlatform: AdPlatform | null = null;
    effect(() => {
      const p = this.platform();
      if (prevPlatform !== null && prevPlatform !== p) {
        this.selectedConn.set(null);
        this.reload();
      }
      prevPlatform = p;
    });
  }

  @HostListener("document:keydown", ["$event"])
  onKeydown(e: KeyboardEvent): void {
    if (e.key !== "r" && e.key !== "R") return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const tag = (document.activeElement as HTMLElement)?.tagName ?? "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    this.reload();
  }

  ngOnInit(): void {
    this.loadConnections();
    this.reload();
    // Tick every second to drive the countdown + relative-time freshness.
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 1_000);
    this.scheduleAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
  }

  private scheduleAutoRefresh(): void {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
    this.nextRefreshAt.set(new Date(Date.now() + this.AUTO_REFRESH_MS));
    this.autoRefreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") this.reload();
      this.scheduleAutoRefresh();
    }, this.AUTO_REFRESH_MS);
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

  applyCustom(): void {
    this.customMode.set(true);
    this.reload();
  }

  /**
   * Handler for the shared range-selector's `applyCustom` output. The component
   * gives us the explicit since/until pair it just validated, so we commit them
   * straight into our state.
   */
  applyCustomFromShared(ev: { since: string; until: string }): void {
    this.customSince.set(ev.since);
    this.customUntil.set(ev.until);
    this.customMode.set(true);
    this.reload();
  }

  private queryOpts(): { since?: string; until?: string; connectionId?: string; platform: AdPlatform } {
    const opts: { since?: string; until?: string; connectionId?: string; platform: AdPlatform } = {
      platform: this.platform(),
    };
    if (this.customMode()) {
      opts.since = this.customSince();
      opts.until = this.customUntil();
    }
    const connId = this.selectedConn();
    if (connId) opts.connectionId = connId;
    return opts;
  }

  async reload(): Promise<void> {
    // Show skeleton only on the very first load; subsequent reloads just toggle the "Refreshing" pill.
    if (this.lastUpdated() === null) this.loading.set(true);
    this.refreshing.set(true);
    this.loadError.set(null);
    try {
      const r = this.range();
      const connId = this.selectedConn() ?? undefined;
      const opts = this.queryOpts();
      const [kpis, points, campaigns, alerts] = await Promise.all([
        this.api.getOverview(r, opts),
        this.api.getTimeseries(r, connId, opts),
        this.api.getCampaigns(r, opts),
        this.alertsApi.list(connId, this.platform()),
      ]);
      // Only treat as "no data" when there are literally no campaigns at all.
      // If campaigns exist but have 0 spend in the window, show the KPI cards
      // with zeros — the user has data, just none in this date range.
      const noData = campaigns.length === 0 && kpis.spend === 0 && kpis.impressions === 0;
      this.kpis.set(noData ? null : kpis);
      this.timeseries.set(points);
      this.campaigns.set(campaigns);
      this.alerts.set(alerts);
      this.lastUpdated.set(new Date());
      this.nowTick.set(Date.now());
      this.scheduleAutoRefresh();
    } catch {
      this.loadError.set("Could not load dashboard data. Backend may be unreachable.");
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  async syncNow(): Promise<void> {
    this.syncing.set(true);
    const platform = this.platform();
    this.status.info("Syncing Facebook…");
    try {
      const res = await this.conns.syncNow(platform);
      const okResults = res.results.filter((r) => r.ok);
      const failResults = res.results.filter((r) => !r.ok);
      const campaigns = okResults.reduce((sum, r) => sum + (Number(r.details?.campaigns) || 0), 0);

      if (okResults.length === 0 && failResults.length === 0) {
        this.status.info(`No active ${platform} connections to sync. Connect one first.`);
      } else if (failResults.length === 0) {
        this.status.success(`Synced ${campaigns} campaigns across ${okResults.length} ${okResults.length === 1 ? "account" : "accounts"}`);
      } else if (okResults.length === 0) {
        this.status.error(`Sync failed for all ${failResults.length} ${failResults.length === 1 ? "account" : "accounts"}. Check Connections.`);
      } else {
        this.status.error(`Partial sync: ${okResults.length} ok, ${failResults.length} failed (${campaigns} campaigns). Check Connections.`);
      }

      await Promise.all([this.loadConnections(), this.reload()]);
    } catch {
      this.status.error("Sync request failed — backend may be down");
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
