import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { AuthService } from "../../../core/auth.service";
import { ConnectionsService } from "../../../core/connections.service";
import { DashboardService, AdPlatform } from "../../../core/dashboard.service";
import { AlertsService } from "../../../core/alerts.service";
import { StatusBarService } from "../../../core/status-bar.service";
import {
  CampaignAggregate,
  OverviewKpis,
  Range,
  TimeseriesPoint,
} from "../../../core/models/metrics.models";
import { EvaluatedAlert } from "../../../core/models/alerts.models";
import { Connection } from "../../../core/models/connection.models";
import { KpiCardComponent } from "../components/kpi-card/kpi-card.component";
import { RoasChartComponent } from "../components/roas-chart/roas-chart.component";
import { CampaignTableComponent } from "../components/campaign-table/campaign-table.component";
import { FunnelComponent } from "../components/funnel/funnel.component";
import { AlertsPanelComponent } from "../components/alerts-panel/alerts-panel.component";
import { RefreshBarComponent } from "../components/refresh-bar/refresh-bar.component";
import { RangeSelectorComponent } from "../components/range-selector/range-selector.component";
import { DropdownComponent } from "../../../shared/dropdown/dropdown.component";
import { DashboardTabsComponent } from "../dashboard-tabs/dashboard-tabs.component";


@Component({
  selector: "app-dashboard",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(document:keydown)": "onKeydown($event)",
  },
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
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.css",
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

  onAcctSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.acctSearch.set(target.value);
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
