import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { CampaignAggregate } from "../../../core/models/metrics.models";
import { DashboardService } from "../../../core/dashboard.service";
import { StatusBarService } from "../../../core/status-bar.service";
import { DropdownComponent } from "../../../shared/dropdown.component";

type SortKey = "name" | "accountName" | "platform" | "createdAtPlatform" | "spend" | "revenue" | "purchases" | "roas" | "cpa" | "frequency";
type MetricMode = "roas" | "cpa";

interface SavedView {
  name: string;
  search: string;
  activeOnly: boolean;
  metricMode: MetricMode;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}

const VIEWS_KEY = "campaign-views.v1";

@Component({
  selector: "app-campaign-table",
  imports: [CurrencyPipe, DatePipe, DecimalPipe, DropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      <header>
        <div class="title-row">
          <h3>Campaigns</h3>
          <p class="muted">{{ filtered().length }} of {{ campaigns().length }}</p>
        </div>
        <div class="tools">
          <input
            type="search"
            placeholder="Search campaigns…"
            [value]="search()"
            (input)="search.set($any($event.target).value)" />
          <label class="toggle">
            <input type="checkbox" [checked]="activeOnly()" (change)="activeOnly.set($any($event.target).checked)" />
            <span>Active only</span>
          </label>
          <div class="metric-toggle">
            <button [class.active]="metricMode() === 'roas'" (click)="metricMode.set('roas')">ROAS</button>
            <button [class.active]="metricMode() === 'cpa'" (click)="metricMode.set('cpa')">CPA</button>
          </div>
          <app-dropdown #moreDD align="right">
            <span trigger class="more-trigger">⋯</span>
            <div menu class="more-menu">
              <button class="more-item" (click)="saveCurrentView(); moreDD.close()">💾 Save current view</button>
              <button class="more-item" (click)="exportCsv(); moreDD.close()">⬇ Export CSV</button>
            </div>
          </app-dropdown>
        </div>
      </header>

      @if (savedViews().length > 0) {
        <div class="saved-views">
          <span class="muted">Views:</span>
          @for (v of savedViews(); track v.name) {
            <button class="view-chip" (click)="applyView(v)">{{ v.name }}</button>
            <button class="view-x" (click)="deleteView(v.name)" title="Delete">×</button>
          }
        </div>
      }

      @if (filtered().length === 0) {
        <div class="empty">
          @if (campaigns().length === 0) {
            No campaigns yet.
          } @else {
            No campaigns match your filters.
          }
        </div>
      } @else {
        <table>
          <thead>
            <tr>
              <th></th>
              <th (click)="toggleSort('name')">Campaign</th>
              <th (click)="toggleSort('accountName')">Account</th>
              <th (click)="toggleSort('platform')">Platform</th>
              <th (click)="toggleSort('createdAtPlatform')">Created</th>
              <th (click)="toggleSort('spend')" class="num">Spend</th>
              <th (click)="toggleSort('revenue')" class="num">Revenue</th>
              <th (click)="toggleSort('purchases')" class="num">Purchases</th>
              @if (metricMode() === 'roas') {
                <th (click)="toggleSort('roas')" class="num">ROAS</th>
              } @else {
                <th (click)="toggleSort('cpa')" class="num">CPA</th>
              }
              <th (click)="toggleSort('frequency')" class="num">Freq.</th>
              <th>Trend</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (c of sorted(); track c.campaignId) {
              <tr [class.row--stalled]="c.deliveryStalled" [class.row--anomaly]="c.anomalous">
                <td class="flags">
                  @if (c.deliveryStalled) { <span class="flag flag--stalled" title="Delivery stopped">⏸</span> }
                  @if (c.anomalous) { <span class="flag flag--anomaly" title="Anomalous spend today">⚡</span> }
                </td>
                <td class="name">
                  <div>{{ c.name }}</div>
                  <small class="muted">{{ c.status }}</small>
                </td>
                <td class="account-name">{{ c.accountName }}</td>
                <td><span class="badge badge--{{ c.platform }}">{{ c.platform }}</span></td>
                <td class="created">
                  @if (c.createdAtPlatform) {
                    {{ c.createdAtPlatform | date: "mediumDate" }}
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td class="num">{{ c.spend | currency: "EGP":"symbol":"1.0-0" }}</td>
                <td class="num">{{ c.revenue | currency: "EGP":"symbol":"1.0-0" }}</td>
                <td class="num">{{ c.purchases | number: "1.0-0" }}</td>
                @if (metricMode() === 'roas') {
                  <td class="num">
                    <span class="roas" [class.roas--good]="c.roas >= 2" [class.roas--bad]="c.roas < 1 && c.spend > 0">
                      {{ c.roas | number: "1.2-2" }}x
                    </span>
                  </td>
                } @else {
                  <td class="num">
                    @if (c.purchases > 0) {
                      {{ c.cpa | currency: "EGP":"symbol":"1.0-2" }}
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                }
                <td class="num">{{ c.frequency | number: "1.2-2" }}</td>
                <td class="sparkline" [innerHTML]="sparkline(c.dailyRoas)"></td>
                <td class="actions">
                  @if (c.platform === 'facebook') {
                    @if (c.status === 'ACTIVE') {
                      <button class="btn-action pause" (click)="togglePause(c, 'PAUSED')" [disabled]="busy() === c.campaignId">Pause</button>
                    } @else if (c.status === 'PAUSED') {
                      <button class="btn-action resume" (click)="togglePause(c, 'ACTIVE')" [disabled]="busy() === c.campaignId">Resume</button>
                    } @else {
                      <span class="muted">—</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </article>
  `,
  styles: [`
    .card { background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e2e8f0); border-radius: .75rem; padding: 1rem 1.25rem; overflow-x: auto; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .title-row { display: flex; align-items: baseline; gap: .75rem; }
    h3 { margin: 0; font-size: 1rem; color: var(--text, #0f172a); }
    .muted { color: var(--muted, #94a3b8); font-size: .8rem; margin: 0; }
    .tools { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .tools input[type="search"] { border: 1px solid var(--card-bd, #e2e8f0); border-radius: .375rem; padding: .35rem .6rem; font-size: .85rem; min-width: 12rem; outline: none; background: var(--card-bg, #fff); color: var(--text, #0f172a); }
    .tools input[type="search"]:focus { border-color: #4f46e5; }
    .toggle { display: flex; align-items: center; gap: .35rem; font-size: .85rem; color: var(--text-muted, #475569); cursor: pointer; user-select: none; }
    .toggle input { cursor: pointer; }
    .metric-toggle { display: flex; background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e2e8f0); border-radius: .375rem; overflow: hidden; }
    .metric-toggle button { background: transparent; border: 0; padding: .35rem .65rem; cursor: pointer; color: var(--text-muted, #475569); font-size: .8rem; }
    .metric-toggle button.active { background: #4f46e5; color: #fff; }
    .ghost { background: var(--ghost-bg, #f1f5f9); border: 1px solid var(--card-bd, #e2e8f0); color: var(--text-muted, #475569); border-radius: .375rem; padding: .35rem .75rem; font-size: .8rem; cursor: pointer; }
    .ghost:hover { background: var(--ghost-hover, #e2e8f0); }
    .more-trigger { font-size: 1.1rem; font-weight: 700; line-height: 1; color: var(--text-muted); padding: 0 .25rem; }
    .more-menu { padding: .25rem; min-width: 12rem; }
    .more-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; padding: .45rem .65rem; border-radius: .375rem; cursor: pointer; color: var(--text); font-size: .85rem; }
    .more-item:hover { background: var(--ghost-bg); }
    .saved-views { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; margin-bottom: .65rem; font-size: .8rem; }
    .view-chip { background: #eef2ff; border: 1px solid #c7d2fe; color: #4f46e5; border-radius: .375rem; padding: .2rem .55rem; cursor: pointer; font-size: .8rem; }
    .view-chip:hover { background: #c7d2fe; }
    .view-x { background: transparent; border: 0; color: #94a3b8; cursor: pointer; padding: 0 .25rem; font-size: 1rem; margin-right: .35rem; }
    .view-x:hover { color: #dc2626; }
    .empty { text-align: center; color: var(--text-muted, #64748b); padding: 2rem 1rem; font-size: .9rem; }
    table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: .9rem; }
    th { text-align: left; background: var(--th-bg, #f8fafc); color: var(--text-muted, #475569); font-weight: 500; padding: .5rem .75rem; cursor: pointer; user-select: none; white-space: nowrap; }
    th.num { text-align: right; }
    td { padding: .65rem .75rem; border-bottom: 1px solid var(--card-bd, #e2e8f0); white-space: nowrap; color: var(--text, #0f172a); }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.name div { font-weight: 500; color: var(--text, #0f172a); }
    td.name small { color: var(--muted, #94a3b8); text-transform: capitalize; }
    .badge { padding: .15rem .5rem; border-radius: 999px; font-size: .7rem; font-weight: 500; text-transform: capitalize; }
    .badge--facebook { background: #dbeafe; color: #1e40af; }
    .badge--tiktok   { background: #fce7f3; color: #9d174d; }
    .badge--shopify  { background: #dcfce7; color: #166534; }
    .roas { font-weight: 500; }
    .roas--good { color: #16a34a; }
    .roas--bad  { color: #dc2626; }
    td.account-name { color: var(--text-muted, #475569); font-size: .85rem; max-width: 12rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    td.created { color: var(--text-muted); font-size: .82rem; font-variant-numeric: tabular-nums; }
    .flags { padding: .35rem .35rem; min-width: 2.5rem; }
    .flag { display: inline-block; font-size: .85rem; }
    .flag--stalled { color: #dc2626; }
    .flag--anomaly { color: #f59e0b; }
    .row--stalled td { background: rgba(220, 38, 38, .04); }
    .row--anomaly td { background: rgba(245, 158, 11, .04); }
    .row--stalled.row--anomaly td { background: rgba(245, 158, 11, .06); }
    .sparkline { padding: .2rem .5rem; }
    .sparkline svg { display: block; }
    .actions { padding: .35rem .5rem; }
    .btn-action { background: transparent; border: 1px solid; border-radius: .375rem; padding: .3rem .65rem; font-size: .75rem; cursor: pointer; font-weight: 500; }
    .btn-action:disabled { opacity: .5; cursor: not-allowed; }
    .btn-action.pause { color: #b91c1c; border-color: #fecaca; }
    .btn-action.pause:hover:not(:disabled) { background: #fef2f2; }
    .btn-action.resume { color: #15803d; border-color: #bbf7d0; }
    .btn-action.resume:hover:not(:disabled) { background: #f0fdf4; }
  `],
})
export class CampaignTableComponent {
  private readonly dash = inject(DashboardService);
  private readonly status = inject(StatusBarService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly campaigns = input.required<CampaignAggregate[]>();
  readonly changed = output<void>();

  readonly sortKey = signal<SortKey>("spend");
  readonly sortDir = signal<"asc" | "desc">("desc");
  readonly search = signal("");
  readonly activeOnly = signal(false);
  readonly metricMode = signal<MetricMode>("roas");
  readonly busy = signal<string | null>(null);
  readonly savedViews = signal<SavedView[]>(this.loadViews());

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const active = this.activeOnly();
    return this.campaigns().filter((c) => {
      if (active && c.status?.toUpperCase() !== "ACTIVE") return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.accountName.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly sorted = computed(() => {
    const list = [...this.filtered()];
    const key = this.sortKey();
    const dir = this.sortDir() === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = a[key as keyof CampaignAggregate];
      const vb = b[key as keyof CampaignAggregate];
      // Null/undefined always sinks to the bottom regardless of direction.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return list;
  });

  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      this.sortKey.set(key);
      // Strings sort A→Z by default; numbers and dates sort biggest/newest first.
      this.sortDir.set(key === "name" || key === "accountName" || key === "platform" ? "asc" : "desc");
    }
  }

  /**
   * Generate a tiny SVG sparkline from a numeric series.
   *
   * The input is `number[]` only (from the typed CampaignAggregate model), so
   * there is no untrusted-string path into the markup. We still wrap the
   * result in `bypassSecurityTrustHtml` to make the trust boundary explicit:
   * Angular's default sanitizer can rewrite SVG attributes (e.g. drop `xmlns`)
   * and this keeps the rendered chart byte-for-byte what we generated.
   */
  sparkline(series: number[]): SafeHtml {
    if (!series || series.length < 2) {
      return this.sanitizer.bypassSecurityTrustHtml('<svg width="60" height="20"></svg>');
    }
    const w = 60, h = 20, pad = 2;
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const range = max - min || 1;
    const points = series.map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const last = series[series.length - 1];
    const first = series[0];
    const color = last >= first ? "#16a34a" : "#dc2626";
    const markup = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}"/></svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(markup);
  }

  async togglePause(c: CampaignAggregate, status: "PAUSED" | "ACTIVE"): Promise<void> {
    this.busy.set(c.campaignId);
    try {
      await this.dash.setCampaignStatus(c.campaignId, status);
      this.status.success(`Campaign ${status === "PAUSED" ? "paused" : "resumed"}`);
      this.changed.emit();
    } catch {
      this.status.error(`Failed to ${status === "PAUSED" ? "pause" : "resume"} campaign`);
    } finally {
      this.busy.set(null);
    }
  }

  saveCurrentView(): void {
    const name = prompt("Name this view:");
    if (!name) return;
    const view: SavedView = {
      name,
      search: this.search(),
      activeOnly: this.activeOnly(),
      metricMode: this.metricMode(),
      sortKey: this.sortKey(),
      sortDir: this.sortDir(),
    };
    const views = [...this.savedViews().filter((v) => v.name !== name), view];
    this.savedViews.set(views);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  }

  applyView(v: SavedView): void {
    this.search.set(v.search);
    this.activeOnly.set(v.activeOnly);
    this.metricMode.set(v.metricMode);
    this.sortKey.set(v.sortKey);
    this.sortDir.set(v.sortDir);
  }

  deleteView(name: string): void {
    const views = this.savedViews().filter((v) => v.name !== name);
    this.savedViews.set(views);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  }

  private loadViews(): SavedView[] {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      return raw ? (JSON.parse(raw) as SavedView[]) : [];
    } catch {
      return [];
    }
  }

  exportCsv(): void {
    const rows = this.sorted();
    const header = ["Campaign", "Account", "Platform", "Status", "Created", "Spend (EGP)", "Revenue (EGP)", "Purchases", "ROAS", "CPA (EGP)", "Frequency", "Impressions", "Clicks"];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      header.join(","),
      ...rows.map((c) => [
        c.name, c.accountName, c.platform, c.status,
        c.createdAtPlatform ? c.createdAtPlatform.slice(0, 10) : "",
        c.spend, c.revenue, c.purchases, c.roas, c.cpa, c.frequency,
        c.impressions, c.clicks,
      ].map(escape).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
