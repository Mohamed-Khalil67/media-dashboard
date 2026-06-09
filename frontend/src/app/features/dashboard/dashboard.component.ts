import { Component, OnDestroy, OnInit, computed, effect, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { AuthService } from "../../core/auth.service";
import { ConnectionsService } from "../../core/connections.service";
import { DashboardService, AdPlatform } from "../../core/dashboard.service";
import { AlertsService } from "../../core/alerts.service";
import { ToastService } from "../../core/toast.service";
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
import { DropdownComponent } from "../../shared/dropdown.component";
import { DashboardTabsComponent } from "./dashboard-tabs.component";

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

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
          @if (lastUpdated()) {
            <span class="pill" [class.pill--refreshing]="refreshing()" [title]="lastUpdated()!.toISOString()">
              @if (refreshing()) {
                <span class="dot-anim"></span> Refreshing…
              } @else {
                <span class="dot dot--ok"></span> Last updated {{ lastUpdatedRel() }}
              }
            </span>
          }
          @if (kpis() && campaigns().length > 0) {
            <span class="pill pill--info">
              {{ campaigns().length }} campaigns • {{ activeAccountCount() }} {{ activeAccountCount() === 1 ? 'account' : 'accounts' }}
            </span>
          }
        </div>
      </div>
      <div class="actions">

        <!-- Date range dropdown -->
        <app-dropdown #dateDD>
          <span trigger>
            <span class="ico">📅</span>
            <span class="lbl">{{ dateLabel() }}</span>
          </span>
          <div menu class="date-menu">
            <div class="presets">
              @for (p of presets; track p.value) {
                <button
                  class="preset"
                  [class.active]="!customMode() && range() === p.value"
                  (click)="pickPreset(p.value); dateDD.close()">{{ p.label }}</button>
              }
            </div>
            <div class="custom-zone">
              <p class="muted">Custom range</p>
              <div class="dates">
                <input type="date" [value]="customSince()" (change)="customSince.set($any($event.target).value)" />
                <span>→</span>
                <input type="date" [value]="customUntil()" (change)="customUntil.set($any($event.target).value)" />
              </div>
              <button class="apply" (click)="applyCustom(); dateDD.close()">Apply</button>
            </div>
          </div>
        </app-dropdown>

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

        <!-- Settings dropdown -->
        <app-dropdown align="right">
          <span trigger>
            <span class="ico">⚙</span>
          </span>
          <div menu class="settings-menu">
            <label class="settings-item">
              <input type="checkbox" [checked]="autoRefresh()" (change)="toggleAuto($any($event.target).checked)" />
              <span>Auto-refresh (5 min)</span>
            </label>
          </div>
        </app-dropdown>

        <button class="sync" (click)="syncNow()" [disabled]="syncing()">
          {{ syncing() ? "Syncing…" : "Sync now" }}
        </button>
      </div>
    </header>

    @if (expiredConnections().length > 0) {
      <div class="health-banner">
        <strong>{{ expiredConnections().length }} account{{ expiredConnections().length > 1 ? 's' : '' }} expired.</strong>
        Data may be out of date. <a routerLink="/connections">Reconnect →</a>
      </div>
    }

    @if (loading()) {
      <div class="kpi-grid">
        @for (i of [1,2,3,4,5,6]; track i) {<div class="skeleton skeleton-card"></div>}
      </div>
    } @else if (!kpis()) {
      <section class="empty">
        <h2>No data yet</h2>
        <p>Connect a platform and run a sync to populate your KPIs.</p>
        <a routerLink="/connections" class="primary-link">Go to Connections →</a>
      </section>
    } @else {
      <section class="kpi-grid">
        <app-kpi-card label="Spend"   [value]="kpis()!.spend"     prefix="E£" [delta]="kpis()!.delta.spend"   [previous]="kpis()!.previous.spend" />
        <app-kpi-card label="Revenue" [value]="kpis()!.revenue"   prefix="E£" [delta]="kpis()!.delta.revenue" [previous]="kpis()!.previous.revenue" />
        <app-kpi-card label="ROAS"    [value]="kpis()!.roas"      suffix="x" format="1.2-2" [delta]="kpis()!.delta.roas" [previous]="kpis()!.previous.roas" />
        <app-kpi-card label="Orders"  [value]="kpis()!.orders"               [delta]="kpis()!.delta.orders" [previous]="kpis()!.previous.orders" />
        <app-kpi-card label="AOV"     [value]="kpis()!.aov"       prefix="E£" format="1.2-2" />
        <app-kpi-card label="CTR"     [value]="kpis()!.ctr * 100" suffix="%" format="1.2-2" />
      </section>

      <section class="insights-row">
        <article class="card pacing">
          <h3>Pacing</h3>
          <div class="big">{{ pacing().dailyAvg | currency: "EGP":"symbol":"1.0-0" }} <small>/ day</small></div>
          <p class="muted">Projected {{ pacing().days }}-day total: <strong>{{ pacing().projected | currency: "EGP":"symbol":"1.0-0" }}</strong></p>
        </article>
        <article class="card top">
          <h3>Top performers</h3>
          @if (topPerformers().length === 0) {
            <p class="muted">No campaigns with spend yet.</p>
          } @else {
            <ol>
              @for (c of topPerformers(); track c.campaignId) {
                <li>
                  <span class="rank">{{ $index + 1 }}</span>
                  <span class="t-name">{{ c.name }}</span>
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
    .page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .page-head h1 { margin: 0 0 .25rem; color: var(--text); }
    .muted { color: var(--text-muted); margin: 0; }
    .status-row { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; }
    .pill { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .55rem; background: var(--ghost-bg); border: 1px solid var(--card-bd); border-radius: 999px; font-size: .75rem; color: var(--text-muted); }
    .pill--info { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
    .pill--refreshing { background: #fef3c7; color: #92400e; border-color: #fbbf24; }
    :host-context(html.dark) .pill--refreshing { background: #78350f; color: #fcd34d; }
    .pill .dot { width: .45rem; height: .45rem; border-radius: 999px; }
    .pill .dot--ok { background: #16a34a; }
    .dot-anim { width: .55rem; height: .55rem; border-radius: 999px; background: currentColor; animation: pulse 1s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
    .actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .ico { font-size: .95rem; }
    .lbl { font-weight: 500; color: var(--text); }
    .sync { background: #4f46e5; color: #fff; border: 0; padding: .5rem 1rem; border-radius: .5rem; cursor: pointer; font-weight: 500; font-size: .85rem; }
    .sync:hover:not(:disabled) { background: #4338ca; }
    .sync:disabled { opacity: .55; cursor: not-allowed; }

    .date-menu { padding: 0; min-width: 18rem; }
    .presets { display: flex; flex-direction: column; padding: .25rem; }
    .preset { background: transparent; border: 0; padding: .5rem .75rem; border-radius: .375rem; cursor: pointer; text-align: left; color: var(--text); font-size: .85rem; }
    .preset:hover { background: var(--ghost-bg); }
    .preset.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    .custom-zone { border-top: 1px solid var(--card-bd); padding: .65rem .75rem .75rem; }
    .custom-zone p { font-size: .75rem; margin: 0 0 .35rem; text-transform: uppercase; letter-spacing: .04em; }
    .dates { display: flex; align-items: center; gap: .35rem; margin-bottom: .5rem; }
    .dates input { flex: 1; border: 1px solid var(--input-bd); border-radius: .375rem; padding: .35rem .5rem; background: var(--card-bg); color: var(--text); font-size: .85rem; outline: none; }
    .dates span { color: var(--muted); }
    .apply { width: 100%; background: #4f46e5; color: #fff; border: 0; padding: .4rem; border-radius: .375rem; cursor: pointer; font-size: .85rem; font-weight: 500; }
    .apply:hover { background: #4338ca; }

    .acct-menu { padding: .25rem; min-width: 18rem; }
    .acct-search { width: 100%; border: 1px solid var(--input-bd); border-radius: .375rem; padding: .4rem .55rem; background: var(--card-bg); color: var(--text); font-size: .85rem; outline: none; margin-bottom: .25rem; }
    .acct-search:focus { border-color: #4f46e5; }
    .acct-list { max-height: 16rem; overflow-y: auto; }
    .acct-item { width: 100%; display: flex; justify-content: space-between; align-items: center; background: transparent; border: 0; padding: .45rem .55rem; border-radius: .375rem; cursor: pointer; color: var(--text); font-size: .85rem; text-align: left; }
    .acct-item:hover { background: var(--ghost-bg); }
    .acct-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    .acct-name { display: flex; align-items: center; gap: .35rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .check { color: #4f46e5; font-weight: 600; }
    .divider { height: 1px; background: var(--card-bd); margin: .25rem .25rem; }
    .exp-dot { color: #f59e0b; font-size: .6rem; }
    .empty-small { padding: 1rem; text-align: center; color: var(--text-muted); font-size: .85rem; }

    .settings-menu { padding: .25rem; min-width: 13rem; }
    .settings-item { display: flex; align-items: center; gap: .5rem; padding: .45rem .55rem; border-radius: .375rem; cursor: pointer; color: var(--text); font-size: .85rem; user-select: none; }
    .settings-item:hover { background: var(--ghost-bg); }

    .health-banner { background: #fef3c7; border: 1px solid #fbbf24; color: #92400e; padding: .65rem 1rem; border-radius: .5rem; margin-bottom: 1rem; font-size: .9rem; }
    .health-banner a { color: #b45309; font-weight: 500; text-decoration: none; margin-left: .25rem; }
    :host-context(html.dark) .health-banner { background: #78350f; border-color: #f59e0b; color: #fcd34d; }
    :host-context(html.dark) .health-banner a { color: #fbbf24; }
    .health-banner a:hover { text-decoration: underline; }

    .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 600px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    .insights-row { display: grid; grid-template-columns: 1fr 2fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 900px) { .insights-row { grid-template-columns: 1fr; } }
    .card { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; padding: 1rem 1.25rem; }
    .card h3 { margin: 0 0 .5rem; font-size: 1rem; color: var(--text); }
    .pacing .big { font-size: 1.75rem; font-weight: 600; color: var(--text); }
    .pacing .big small { font-size: .9rem; color: var(--muted); font-weight: 400; }
    .pacing p { margin: .25rem 0 0; font-size: .85rem; color: var(--text-muted); }
    .top ol { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .35rem; }
    .top li { display: grid; grid-template-columns: auto 1fr auto; gap: .75rem; align-items: center; font-size: .9rem; }
    .top .rank { width: 1.5rem; height: 1.5rem; border-radius: 999px; background: var(--ghost-bg); color: var(--accent); text-align: center; line-height: 1.5rem; font-size: .75rem; font-weight: 600; }
    .top .t-name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .top .t-roas { color: #16a34a; font-weight: 500; font-variant-numeric: tabular-nums; }
    .row { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
    .col--wide { min-width: 0; }
    .col--stack { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
    .full { margin-bottom: 1rem; }
    .empty { background: var(--card-bg); border: 1px dashed var(--input-bd); border-radius: .75rem; padding: 3rem 2rem; text-align: center; color: var(--text-muted); }
    .empty h2 { margin-top: 0; color: var(--text); }
    .primary-link { color: var(--accent); font-weight: 500; text-decoration: none; }
    .primary-link:hover { text-decoration: underline; }
    .skeleton-card { height: 7.5rem; background: var(--card-bg); border-radius: .75rem; border: 1px solid var(--card-bd); background-image: linear-gradient(90deg, var(--card-bg) 0%, var(--ghost-bg) 50%, var(--card-bg) 100%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly api = inject(DashboardService);
  private readonly conns = inject(ConnectionsService);
  private readonly alertsApi = inject(AlertsService);
  private readonly toast = inject(ToastService);

  /** Bound from the route param /dashboard/:platform — "facebook" or "tiktok". */
  readonly platform = input<AdPlatform>("facebook");
  readonly platformLabel = computed(() => this.platform() === "tiktok" ? "TikTok" : "Facebook");

  readonly presets: { value: Range; label: string }[] = [
    { value: "7d",  label: "Last 7 days" },
    { value: "14d", label: "Last 14 days" },
    { value: "30d", label: "Last 30 days" },
  ];
  readonly range = signal<Range>("7d");
  readonly customMode = signal(false);
  readonly customSince = signal(this.daysAgoISO(7));
  readonly customUntil = signal(this.todayISO());
  readonly autoRefresh = signal(true);
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

  /** Connections relevant to the current platform tab. */
  readonly fbConnections = computed(() =>
    this.connections().filter((c) => c.platform === this.platform())
  );

  readonly filteredAccounts = computed(() => {
    const q = this.acctSearch().trim().toLowerCase();
    if (!q) return this.fbConnections();
    return this.fbConnections().filter((c) => (c.accountName ?? c.accountId).toLowerCase().includes(q));
  });

  readonly expiredConnections = computed(() =>
    this.connections().filter((c) => c.status === "expired")
  );

  readonly topPerformers = computed(() =>
    [...this.campaigns()]
      .filter((c) => c.spend > 0 && c.roas > 0)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 3)
  );

  readonly pacing = computed(() => {
    const points = this.timeseries();
    const totalSpend = points.reduce((s, p) => s + p.spend, 0);
    const daysWithSpend = points.filter((p) => p.spend > 0).length || 1;
    const dailyAvg = totalSpend / daysWithSpend;
    const days = points.length || 7;
    return { dailyAvg, days, projected: dailyAvg * days };
  });

  readonly dateLabel = computed(() => {
    if (this.customMode()) return `${this.customSince()} → ${this.customUntil()}`;
    return this.presets.find((p) => p.value === this.range())?.label ?? this.range();
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

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

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

  ngOnInit(): void {
    this.loadConnections();
    this.reload();
    this.startAutoRefresh();
    // Tick every 10s to keep "Last updated Xs ago" fresh without re-fetching data.
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 10_000);
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer || !this.autoRefresh()) return;
    this.refreshTimer = setInterval(() => this.reload(), REFRESH_MS);
  }
  private stopAutoRefresh(): void {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
  }
  toggleAuto(on: boolean): void {
    this.autoRefresh.set(on);
    if (on) this.startAutoRefresh(); else this.stopAutoRefresh();
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
      const empty = kpis.spend === 0 && kpis.revenue === 0 && campaigns.length === 0;
      this.kpis.set(empty ? null : kpis);
      this.timeseries.set(points);
      this.campaigns.set(campaigns);
      this.alerts.set(alerts);
      this.lastUpdated.set(new Date());
      this.nowTick.set(Date.now());
    } catch {
      this.toast.error("Could not load dashboard data");
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  async syncNow(): Promise<void> {
    this.syncing.set(true);
    const platform = this.platform();
    this.toast.info(`Syncing ${platform === "tiktok" ? "TikTok" : "Facebook"}…`);
    try {
      const res = await this.conns.syncNow(platform);
      const okResults = res.results.filter((r) => r.ok);
      const failResults = res.results.filter((r) => !r.ok);
      const campaigns = okResults.reduce((sum, r) => sum + (Number(r.details?.campaigns) || 0), 0);

      if (okResults.length === 0 && failResults.length === 0) {
        this.toast.info(`No active ${platform} connections to sync. Connect one first.`);
      } else if (failResults.length === 0) {
        this.toast.success(`✓ Synced ${campaigns} campaigns across ${okResults.length} ${okResults.length === 1 ? "account" : "accounts"}`);
      } else if (okResults.length === 0) {
        this.toast.error(`Sync failed for all ${failResults.length} ${failResults.length === 1 ? "account" : "accounts"}. Check Connections.`);
      } else {
        this.toast.error(`Partial sync: ${okResults.length} ok, ${failResults.length} failed (${campaigns} campaigns). Check Connections for expired accounts.`);
      }

      await Promise.all([this.loadConnections(), this.reload()]);
    } catch {
      this.toast.error("Sync request failed — backend may be down");
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
