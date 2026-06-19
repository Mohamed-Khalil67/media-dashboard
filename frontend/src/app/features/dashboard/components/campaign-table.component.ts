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
            <button class="view-x" (click)="deleteView(v.name)" [attr.aria-label]="'Delete saved view ' + v.name" title="Delete">×</button>
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
              <th scope="col" class="col-flag"></th>
              <th scope="col" class="col-name" (click)="toggleSort('name')">Campaign</th>
              <th scope="col" class="col-account" (click)="toggleSort('accountName')">Account</th>
              <th scope="col" class="col-tight" (click)="toggleSort('platform')">Platform</th>
              <th scope="col" class="col-tight col-created" (click)="toggleSort('createdAtPlatform')">Created</th>
              <th scope="col" (click)="toggleSort('spend')" class="num">Spend</th>
              <th scope="col" (click)="toggleSort('revenue')" class="num">Revenue</th>
              <th scope="col" (click)="toggleSort('purchases')" class="num">Purchases</th>
              @if (metricMode() === 'roas') {
                <th scope="col" (click)="toggleSort('roas')" class="num">ROAS</th>
              } @else {
                <th scope="col" (click)="toggleSort('cpa')" class="num">CPA</th>
              }
              <th scope="col" (click)="toggleSort('frequency')" class="num">Freq.</th>
              <th scope="col" class="col-trend">Trend</th>
              <th scope="col" class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (c of sorted(); track c.campaignId) {
              <tr [class.row--stalled]="c.deliveryStalled" [class.row--anomaly]="c.anomalous">
                <td class="flags">
                  @if (c.deliveryStalled) { <span class="flag flag--stalled" title="Delivery stopped">⏸</span> }
                  @if (c.anomalous) { <span class="flag flag--anomaly" title="Anomalous spend today">⚡</span> }
                </td>
                <td class="name" [title]="c.name">
                  @if (renamingId() === c.campaignId) {
                    <input
                      class="name-edit"
                      [value]="renameDraft()"
                      [disabled]="renameSaving()"
                      (input)="renameDraft.set(asValue($event))"
                      (keydown.enter)="commitRename(c)"
                      (keydown.escape)="cancelRename()"
                      (blur)="commitRename(c)"
                      autoFocus
                      maxlength="400"
                      aria-label="Rename campaign"
                    />
                  } @else {
                    @if (c.platform === 'facebook' && c.status !== 'ARCHIVED' && c.status !== 'DELETED') {
                      <button
                        type="button"
                        class="name-trigger"
                        (click)="startRename(c)"
                        [title]="c.name"
                      >
                        <span class="name-text">{{ c.name }}</span>
                      </button>
                    } @else {
                      <div class="name-text">{{ c.name }}</div>
                    }
                  }
                  <small class="muted">{{ c.status }}</small>
                </td>
                <td class="account-name" [title]="c.accountName">{{ c.accountName }}</td>
                <td><span class="badge badge--{{ c.platform }}">{{ c.platform }}</span></td>
                <td class="created col-created">
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
                <td class="sparkline col-trend" [innerHTML]="sparkline(c.dailyRoas)"></td>
                <td class="actions">
                  @if (c.platform === 'facebook' && (c.status === 'ACTIVE' || c.status === 'PAUSED')) {
                    <app-dropdown #actDD align="right">
                      <span trigger class="actions-trigger-label">Actions</span>
                      <div menu class="row-actions-panel">
                        @if (c.status === 'ACTIVE') {
                          <button class="row-act danger" (click)="togglePause(c, 'PAUSED'); actDD.close()" [disabled]="busy() === c.campaignId">Pause campaign</button>
                        } @else if (c.status === 'PAUSED') {
                          <button class="row-act success" (click)="togglePause(c, 'ACTIVE'); actDD.close()" [disabled]="busy() === c.campaignId">Resume campaign</button>
                        }
                        <button class="row-act" (click)="startRename(c); actDD.close()" [disabled]="busy() === c.campaignId">Rename</button>

                        <div class="row-section">
                          <label class="row-label">Daily budget (EGP)</label>
                          <div class="row-input-row">
                            <input type="number" min="1" step="1" inputmode="decimal" placeholder="e.g. 50"
                              [value]="inlineDaily()" (input)="inlineDaily.set(asValue($event))"
                              [disabled]="busy() === c.campaignId" />
                            <button class="row-act-mini" (click)="commitInlineBudget(c, 'daily', actDD)" [disabled]="busy() === c.campaignId">Save</button>
                          </div>
                          <label class="row-label">Lifetime budget (EGP)</label>
                          <div class="row-input-row">
                            <input type="number" min="1" step="1" inputmode="decimal" placeholder="e.g. 1000"
                              [value]="inlineLifetime()" (input)="inlineLifetime.set(asValue($event))"
                              [disabled]="busy() === c.campaignId" />
                            <button class="row-act-mini" (click)="commitInlineBudget(c, 'lifetime', actDD)" [disabled]="busy() === c.campaignId">Save</button>
                          </div>
                        </div>

                        <button class="row-act" (click)="openDuplicate(c); actDD.close()" [disabled]="busy() === c.campaignId">Duplicate</button>
                      </div>
                    </app-dropdown>
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

    @if (duplicateTarget(); as target) {
      <div class="modal-backdrop" (click)="closeDuplicate()">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title" (click)="$event.stopPropagation()">
          <h2 id="duplicate-title">Duplicate campaign</h2>
          <p class="muted">
            Cloning <strong>{{ target.name }}</strong>
            <br><small>{{ target.accountName }}</small>
          </p>
          <p class="hint">
            Creates a copy of the campaign shell on Facebook. Ad sets and creatives are
            not copied. Override any field below to differentiate the variant.
          </p>
          <div class="field">
            <label for="d-name">New name</label>
            <input id="d-name" type="text" maxlength="400"
              [value]="duplicateName()" (input)="duplicateName.set(asValue($event))"
              [disabled]="duplicateSaving()" />
          </div>
          <div class="field">
            <label for="d-daily">Daily budget <span class="muted">(optional)</span></label>
            <input id="d-daily" type="number" min="1" step="1" inputmode="decimal"
              [value]="duplicateDaily()" (input)="duplicateDaily.set(asValue($event))"
              [disabled]="duplicateSaving()" placeholder="Leave blank to copy from source" />
          </div>
          <div class="field">
            <label for="d-start">Start date <span class="muted">(optional)</span></label>
            <input id="d-start" type="date"
              [value]="duplicateStart()" (input)="duplicateStart.set(asValue($event))"
              [disabled]="duplicateSaving()" />
          </div>
          <label class="check-row">
            <input type="checkbox"
              [checked]="duplicateStartPaused()"
              (change)="duplicateStartPaused.set(asChecked($event))"
              [disabled]="duplicateSaving()" />
            <span>Start paused (recommended)</span>
          </label>
          @if (duplicateError(); as e) { <div class="banner banner--error">{{ e }}</div> }
          <div class="actions-row">
            <button type="button" class="btn-ghost" (click)="closeDuplicate()" [disabled]="duplicateSaving()">Cancel</button>
            <button type="button" class="btn-primary" (click)="submitDuplicate(target)" [disabled]="duplicateSaving() || !duplicateValid()">
              {{ duplicateSaving() ? 'Cloning…' : 'Duplicate' }}
            </button>
          </div>
        </div>
      </div>
    }
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

    table { width: 100%; border-collapse: collapse; font-size: .82rem; table-layout: auto; }
    th { text-align: left; background: var(--th-bg, #f8fafc); color: var(--text-muted, #475569); font-weight: 500; padding: .4rem .55rem; cursor: pointer; user-select: none; white-space: nowrap; }
    th.num { text-align: right; }
    td { padding: .45rem .55rem; border-bottom: 1px solid var(--card-bd, #e2e8f0); color: var(--text, #0f172a); }
    td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* Column sizing — keep wide columns elastic, force tight ones to content width */
    .col-flag { width: 28px; }
    .col-name { width: 14rem; }
    td.name { max-width: 14rem; }
    .name-text { display: block; max-width: 13rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--text, #0f172a); }
    .col-account { width: 9rem; }
    td.account-name { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted, #475569); font-size: .82rem; }
    .col-tight { width: 1%; white-space: nowrap; }
    .col-actions { width: 5.5rem; }
    td.actions { padding: .35rem .45rem; }

    td.name small { color: var(--muted, #94a3b8); text-transform: capitalize; display: block; font-size: .7rem; }
    .badge { padding: .15rem .5rem; border-radius: 999px; font-size: .7rem; font-weight: 500; text-transform: capitalize; }
    .badge--facebook { background: #dbeafe; color: #1e40af; }
    .badge--tiktok   { background: #fce7f3; color: #9d174d; }
    .badge--shopify  { background: #dcfce7; color: #166534; }
    .roas { font-weight: 500; }
    .roas--good { color: #16a34a; }
    .roas--bad  { color: #dc2626; }
    td.created { color: var(--text-muted); font-size: .78rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .flags { padding: .35rem .35rem; min-width: 1.75rem; }
    .flag { display: inline-block; font-size: .85rem; }
    .flag--stalled { color: #dc2626; }
    .flag--anomaly { color: #f59e0b; }
    .row--stalled td { background: rgba(220, 38, 38, .04); }
    .row--anomaly td { background: rgba(245, 158, 11, .04); }
    .row--stalled.row--anomaly td { background: rgba(245, 158, 11, .06); }
    .sparkline { padding: .2rem .5rem; }
    .sparkline svg { display: block; }

    /* Narrow viewports — drop sparkline + created date before the table can overflow */
    @media (max-width: 1200px) {
      th.col-trend, td.col-trend { display: none; }
      th.col-created, td.col-created { display: none; }
    }

    .name-trigger {
      display: inline-block; max-width: 100%;
      background: transparent; border: 0; padding: 0; cursor: text;
      font: inherit; color: inherit; text-align: left;
    }
    .name-edit {
      width: 100%; max-width: 22rem;
      padding: .25rem .45rem; border-radius: .35rem;
      border: 1px solid var(--accent, #4f46e5); background: var(--card-bg, #fff);
      color: var(--text, #0f172a); font: inherit; font-weight: 500;
      outline: none;
    }
    .name-edit:disabled { opacity: .6; cursor: progress; }

    /* Per-row Actions dropdown */
    .actions-trigger-label { font-size: .78rem; font-weight: 500; color: var(--text, #0f172a); }
    .row-actions-panel { padding: .35rem; min-width: 15rem; display: flex; flex-direction: column; gap: .15rem; }
    .row-act {
      display: block; width: 100%; text-align: left;
      background: transparent; border: 0; padding: .4rem .55rem; border-radius: .35rem;
      cursor: pointer; color: var(--text, #0f172a); font-size: .82rem;
    }
    .row-act:hover:not(:disabled) { background: var(--ghost-bg, #f1f5f9); }
    .row-act:disabled { opacity: .5; cursor: not-allowed; }
    .row-act.danger { color: #b91c1c; }
    .row-act.success { color: #15803d; }
    .row-section {
      margin: .35rem 0; padding: .4rem .55rem;
      border-top: 1px solid var(--card-bd, #e2e8f0);
      border-bottom: 1px solid var(--card-bd, #e2e8f0);
      display: flex; flex-direction: column; gap: .25rem;
    }
    .row-label { font-size: .72rem; color: var(--text-muted, #64748b); font-weight: 500; }
    .row-input-row { display: flex; gap: .35rem; align-items: center; margin-bottom: .25rem; }
    .row-input-row input {
      flex: 1; min-width: 0;
      padding: .3rem .45rem; border: 1px solid var(--card-bd, #cbd5e1); border-radius: .35rem;
      background: var(--card-bg, #fff); color: var(--text, #0f172a); font-size: .8rem;
      font-variant-numeric: tabular-nums;
    }
    .row-input-row input:focus { outline: 2px solid var(--accent, #4f46e5); outline-offset: 1px; }
    .row-act-mini {
      background: #4f46e5; color: #fff; border: 0; border-radius: .35rem;
      padding: .3rem .65rem; font-size: .75rem; cursor: pointer; font-weight: 500;
    }
    .row-act-mini:hover:not(:disabled) { background: #4338ca; }
    .row-act-mini:disabled { opacity: .55; cursor: not-allowed; }

    .check-row { display: flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--text, #0f172a); cursor: pointer; }

    /* Duplicate modal — kept (overrides + Start paused don't fit inline) */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .55);
      display: flex; align-items: center; justify-content: center; z-index: 50;
      backdrop-filter: blur(2px);
    }
    .modal {
      background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e2e8f0);
      border-radius: .75rem; padding: 1.25rem 1.4rem; width: min(420px, 92vw);
      box-shadow: 0 18px 40px rgba(15, 23, 42, .25);
      display: flex; flex-direction: column; gap: .9rem;
    }
    .modal h2 { margin: 0; font-size: 1.05rem; color: var(--text, #0f172a); }
    .modal p.muted { margin: 0; color: var(--text-muted, #475569); font-size: .9rem; }
    .modal p.hint { margin: 0; font-size: .78rem; color: var(--text-muted, #64748b); line-height: 1.45; }
    .field { display: flex; flex-direction: column; gap: .35rem; }
    .field label { font-size: .78rem; color: var(--text-muted, #475569); font-weight: 500; }
    .field input {
      padding: .5rem .65rem; border: 1px solid var(--input-bd, #cbd5e1); border-radius: .4rem;
      background: var(--card-bg, #fff); color: var(--text, #0f172a); font-size: .9rem;
      font-variant-numeric: tabular-nums;
    }
    .field input:focus { outline: 2px solid var(--accent, #4f46e5); outline-offset: 1px; }
    .banner { padding: .5rem .65rem; border-radius: .4rem; font-size: .82rem; }
    .banner--error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .actions-row { display: flex; gap: .5rem; justify-content: flex-end; margin-top: .25rem; }
    .btn-ghost, .btn-primary {
      padding: .45rem .85rem; border-radius: .4rem; font-size: .85rem;
      cursor: pointer; border: 1px solid transparent;
    }
    .btn-ghost { background: transparent; color: var(--text, #0f172a); border-color: var(--card-bd, #cbd5e1); }
    .btn-ghost:hover:not(:disabled) { background: var(--ghost-bg, #f1f5f9); }
    .btn-primary { background: #4f46e5; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #4338ca; }
    .btn-primary:disabled, .btn-ghost:disabled { opacity: .55; cursor: not-allowed; }
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
      this.sortDir.set(key === "name" || key === "accountName" || key === "platform" ? "asc" : "desc");
    }
  }

  /**
   * SVG sparkline. Input is `number[]` from the typed model, so no untrusted
   * string path; bypassSecurityTrustHtml is used so Angular doesn't strip
   * `xmlns` and other SVG attributes we generated.
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

  /** Inline-rename state. `renamingId` is the campaignId currently being edited (or null). */
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal<string>("");
  readonly renameSaving = signal(false);

  asValue(e: Event): string { return (e.target as HTMLInputElement).value; }

  startRename(c: CampaignAggregate): void {
    if (this.renameSaving()) return;
    this.renameDraft.set(c.name);
    this.renamingId.set(c.campaignId);
  }

  cancelRename(): void {
    if (this.renameSaving()) return;
    this.renamingId.set(null);
    this.renameDraft.set("");
  }

  async commitRename(c: CampaignAggregate): Promise<void> {
    if (this.renameSaving() || this.renamingId() !== c.campaignId) return;
    const next = this.renameDraft().trim();
    if (next.length === 0 || next === c.name) {
      this.cancelRename();
      return;
    }
    this.renameSaving.set(true);
    try {
      await this.dash.renameCampaign(c.campaignId, next);
      this.status.success("Campaign renamed");
      this.changed.emit();
    } catch {
      this.status.error("Failed to rename campaign");
    } finally {
      this.renameSaving.set(false);
      this.renamingId.set(null);
      this.renameDraft.set("");
    }
  }

  /** Inline budget editors live inside the per-row Actions dropdown. */
  readonly inlineDaily = signal<string>("");
  readonly inlineLifetime = signal<string>("");

  async commitInlineBudget(c: CampaignAggregate, which: "daily" | "lifetime", dd?: DropdownComponent): Promise<void> {
    const raw = (which === "daily" ? this.inlineDaily() : this.inlineLifetime()).trim();
    const n = Number(raw);
    if (!raw || !(n >= 1)) {
      this.status.error("Budget must be ≥ 1");
      return;
    }
    const payload = which === "daily" ? { dailyBudget: n } : { lifetimeBudget: n };
    this.busy.set(c.campaignId);
    try {
      await this.dash.updateCampaignBudget(c.campaignId, payload);
      this.status.success("Budget updated");
      if (which === "daily") this.inlineDaily.set(""); else this.inlineLifetime.set("");
      this.changed.emit();
      dd?.close();
    } catch (err) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.status.error(msg ?? "Failed to update budget");
    } finally {
      this.busy.set(null);
    }
  }

  asChecked(e: Event): boolean { return (e.target as HTMLInputElement).checked; }

  /** Duplicate-modal state. Defaults to startPaused=true for safety. */
  readonly duplicateTarget = signal<CampaignAggregate | null>(null);
  readonly duplicateName = signal<string>("");
  readonly duplicateDaily = signal<string>("");
  readonly duplicateStart = signal<string>("");
  readonly duplicateStartPaused = signal<boolean>(true);
  readonly duplicateSaving = signal(false);
  readonly duplicateError = signal<string | null>(null);

  readonly duplicateValid = computed(() => {
    if (this.duplicateName().trim().length === 0) return false;
    const d = this.duplicateDaily().trim();
    if (d && !(Number(d) >= 1)) return false;
    return true;
  });

  openDuplicate(c: CampaignAggregate): void {
    this.duplicateTarget.set(c);
    this.duplicateName.set(`${c.name} — copy`);
    this.duplicateDaily.set("");
    this.duplicateStart.set("");
    this.duplicateStartPaused.set(true);
    this.duplicateError.set(null);
  }

  closeDuplicate(): void {
    if (this.duplicateSaving()) return;
    this.duplicateTarget.set(null);
    this.duplicateError.set(null);
  }

  async submitDuplicate(c: CampaignAggregate): Promise<void> {
    if (!this.duplicateValid()) return;
    const payload: Parameters<DashboardService["duplicateCampaign"]>[1] = {
      name: this.duplicateName().trim(),
      startPaused: this.duplicateStartPaused(),
    };
    const daily = this.duplicateDaily().trim();
    if (daily) payload.dailyBudget = Number(daily);
    const start = this.duplicateStart().trim();
    if (start) payload.startTime = start;

    this.duplicateSaving.set(true);
    this.duplicateError.set(null);
    try {
      const created = await this.dash.duplicateCampaign(c.campaignId, payload);
      this.status.success(`Cloned: ${created.name}`);
      this.changed.emit();
      this.duplicateTarget.set(null);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.duplicateError.set(msg ?? "Failed to duplicate campaign.");
    } finally {
      this.duplicateSaving.set(false);
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
