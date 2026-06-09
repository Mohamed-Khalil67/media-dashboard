import { Component, OnInit, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { ConnectionsService } from "../../core/connections.service";
import { DashboardService } from "../../core/dashboard.service";
import { AlertsService } from "../../core/alerts.service";
import { ToastService } from "../../core/toast.service";
import {
  CampaignAggregate,
  OverviewKpis,
  Range,
  TimeseriesPoint,
} from "../../core/models/metrics.models";
import { EvaluatedAlert } from "../../core/models/alerts.models";
import { KpiCardComponent } from "./components/kpi-card.component";
import { RoasChartComponent } from "./components/roas-chart.component";
import { CampaignTableComponent } from "./components/campaign-table.component";
import { FunnelComponent } from "./components/funnel.component";
import { AlertsPanelComponent } from "./components/alerts-panel.component";

@Component({
  selector: "app-dashboard",
  imports: [
    RouterLink,
    KpiCardComponent,
    RoasChartComponent,
    CampaignTableComponent,
    FunnelComponent,
    AlertsPanelComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="muted">Welcome back, {{ auth.user()?.name ?? auth.user()?.email }}.</p>
      </div>
      <div class="actions">
        <div class="range">
          @for (r of ranges; track r) {
            <button
              type="button"
              [class.active]="range() === r"
              (click)="setRange(r)">{{ r }}</button>
          }
        </div>
        <button class="sync" (click)="syncNow()" [disabled]="syncing()">
          {{ syncing() ? "Syncing…" : "Sync now" }}
        </button>
      </div>
    </header>

    @if (loading()) {
      <div class="skeleton-grid">
        @for (i of [1,2,3,4]; track i) {<div class="skeleton"></div>}
      </div>
    } @else if (!kpis()) {
      <section class="empty">
        <h2>No data yet</h2>
        <p>Connect a platform and run a sync to populate your KPIs.</p>
        <a routerLink="/connections" class="primary-link">Go to Connections →</a>
      </section>
    } @else {
      <section class="kpi-grid">
        <app-kpi-card label="Spend" [value]="kpis()!.spend" prefix="$" [delta]="kpis()!.delta.spend" />
        <app-kpi-card label="Revenue" [value]="kpis()!.revenue" prefix="$" [delta]="kpis()!.delta.revenue" />
        <app-kpi-card label="ROAS" [value]="kpis()!.roas" suffix="x" format="1.2-2" [delta]="kpis()!.delta.roas" />
        <app-kpi-card label="Orders" [value]="kpis()!.orders" [delta]="kpis()!.delta.orders" />
        <app-kpi-card label="AOV" [value]="kpis()!.aov" prefix="$" format="1.2-2" />
        <app-kpi-card label="CTR" [value]="kpis()!.ctr * 100" suffix="%" format="1.2-2" />
      </section>

      <section class="row">
        <div class="col col--wide"><app-roas-chart [points]="timeseries()" /></div>
        <div class="col"><app-funnel [kpis]="kpis()" /></div>
      </section>

      <section class="row">
        <div class="col col--wide"><app-campaign-table [campaigns]="campaigns()" /></div>
        <div class="col"><app-alerts-panel [alerts]="alerts()" /></div>
      </section>
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
    .page-head h1 { margin: 0 0 .25rem; }
    .muted { color: #64748b; margin: 0; }
    .actions { display: flex; gap: .5rem; align-items: center; }
    .range { display: flex; background: #fff; border: 1px solid #e2e8f0; border-radius: .375rem; overflow: hidden; }
    .range button { background: transparent; border: 0; padding: .4rem .85rem; cursor: pointer; color: #475569; font-size: .85rem; }
    .range button.active { background: #4f46e5; color: #fff; }
    .sync { background: #4f46e5; color: #fff; border: 0; padding: .45rem .9rem; border-radius: .375rem; cursor: pointer; font-weight: 500; }
    .sync:disabled { opacity: .55; cursor: not-allowed; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .row { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
    .col--wide { min-width: 0; }
    .empty {
      background: #fff; border: 1px dashed #cbd5e1; border-radius: .75rem;
      padding: 3rem 2rem; text-align: center; color: #475569;
    }
    .empty h2 { margin-top: 0; }
    .primary-link { color: #4f46e5; font-weight: 500; text-decoration: none; }
    .primary-link:hover { text-decoration: underline; }
    .skeleton-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; }
    .skeleton {
      height: 5.5rem; background: #fff; border-radius: .75rem;
      border: 1px solid #e2e8f0;
      background-image: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
      background-size: 200% 100%;
      animation: shimmer 1.4s linear infinite;
    }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `],
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(DashboardService);
  private readonly conns = inject(ConnectionsService);
  private readonly alertsApi = inject(AlertsService);
  private readonly toast = inject(ToastService);

  readonly ranges: Range[] = ["7d", "14d", "30d"];
  readonly range = signal<Range>("7d");
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly kpis = signal<OverviewKpis | null>(null);
  readonly timeseries = signal<TimeseriesPoint[]>([]);
  readonly campaigns = signal<CampaignAggregate[]>([]);
  readonly alerts = signal<EvaluatedAlert[]>([]);

  ngOnInit(): void {
    this.reload();
  }

  setRange(r: Range): void {
    if (r === this.range()) return;
    this.range.set(r);
    this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const r = this.range();
      const [kpis, points, campaigns, alerts] = await Promise.all([
        this.api.getOverview(r),
        this.api.getTimeseries(r),
        this.api.getCampaigns(r),
        this.alertsApi.list(),
      ]);
      // Surface "no data" only when truly empty across the board.
      const empty = kpis.spend === 0 && kpis.revenue === 0 && campaigns.length === 0;
      this.kpis.set(empty ? null : kpis);
      this.timeseries.set(points);
      this.campaigns.set(campaigns);
      this.alerts.set(alerts);
    } catch {
      this.toast.error("Could not load dashboard data");
    } finally {
      this.loading.set(false);
    }
  }

  async syncNow(): Promise<void> {
    this.syncing.set(true);
    try {
      await this.conns.syncNow();
      this.toast.success("Sync complete");
      await this.reload();
    } catch {
      this.toast.error("Sync failed");
    } finally {
      this.syncing.set(false);
    }
  }
}
