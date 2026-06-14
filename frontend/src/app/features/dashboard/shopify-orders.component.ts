import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { ConnectionsService } from "../../core/connections.service";
import { DashboardService } from "../../core/dashboard.service";
import { StatusBarService } from "../../core/status-bar.service";
import { Connection } from "../../core/models/connection.models";
import { ShopifyOrderListItem } from "../../core/models/metrics.models";
import { DashboardTabsComponent } from "./dashboard-tabs.component";
import { ShopifySubtabsComponent } from "./shopify-subtabs.component";
import { DropdownComponent } from "../../shared/dropdown.component";
import { RefreshBarComponent } from "./components/refresh-bar.component";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "partially_refunded", label: "Partially refunded" },
  { value: "voided", label: "Voided" },
  { value: "authorized", label: "Authorized" },
] as const;

@Component({
  selector: "app-shopify-orders",
  imports: [
    RouterLink, ReactiveFormsModule, CurrencyPipe, DatePipe, DecimalPipe,
    DashboardTabsComponent, ShopifySubtabsComponent, DropdownComponent, RefreshBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dashboard-tabs />
    <app-shopify-subtabs />

    <header class="page-head">
      <div>
        <h1>Shopify Orders</h1>
        <p class="muted">Live order data synced from your stores.</p>
      </div>
      <div class="actions">
        <app-refresh-bar [lastUpdated]="lastUpdated()" [refreshing]="refreshing()" (refresh)="reload()" />

        @if (shopifyConns().length > 0) {
          <app-dropdown #shopDD>
            <span trigger>
              <span class="ico" aria-hidden="true">🛒</span>
              <span class="lbl">{{ shopLabel() }}</span>
            </span>
            <div menu class="acct-menu" role="menu">
              <button type="button" class="acct-item" [class.active]="selectedConn() === null"
                (click)="selectConn(null); shopDD.close()">
                <span>All stores</span>
                <span class="check">{{ selectedConn() === null ? '✓' : '' }}</span>
              </button>
              <div class="divider"></div>
              @for (c of shopifyConns(); track c.id) {
                <button type="button" class="acct-item" [class.active]="selectedConn() === c.id"
                  (click)="selectConn(c.id); shopDD.close()">
                  <span>{{ c.accountName ?? c.accountId }}</span>
                  <span class="check">{{ selectedConn() === c.id ? '✓' : '' }}</span>
                </button>
              }
            </div>
          </app-dropdown>
        }
      </div>
    </header>

    <div class="filter-bar">
      <input class="search" type="search" placeholder="Search by customer email or order #" [formControl]="searchCtrl" aria-label="Search orders" />
      <select class="status-select" [value]="statusFilter()" (change)="setStatus(asValue($event))" aria-label="Filter by financial status">
        @for (s of statuses; track s.value) {
          <option [value]="s.value">{{ s.label }}</option>
        }
      </select>
    </div>

    @if (loading() && orders().length === 0) {
      <div class="empty"><p>Loading orders…</p></div>
    } @else if (shopifyConns().length === 0) {
      <div class="empty">
        <h2>No Shopify stores connected</h2>
        <p>Connect a Shopify store from <a class="primary-link" routerLink="/connections">Connections</a> to see your orders here.</p>
      </div>
    } @else if (orders().length === 0) {
      <div class="empty">
        <h2>No orders match these filters</h2>
        <p>Try a different status, store, or clear the search.</p>
      </div>
    } @else {
      <div class="card table-card">
        <table class="orders" aria-label="Orders">
          <thead>
            <tr>
              <th>Date</th>
              <th>Order #</th>
              <th>Customer</th>
              <th class="num">Items</th>
              <th class="num">Total</th>
              <th>Financial</th>
              <th>Fulfillment</th>
              <th><span class="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (o of orders(); track o.id) {
              <tr (click)="openDetail(o)" tabindex="0" (keydown.enter)="openDetail(o)">
                <td class="date">{{ o.createdAt | date: "mediumDate" }}</td>
                <td class="order-num">{{ o.orderNumber ?? o.externalId }}</td>
                <td class="customer">{{ o.customerEmail ?? '—' }}</td>
                <td class="num">{{ o.lineItemsCount | number: "1.0-0" }}</td>
                <td class="num"><strong>{{ o.totalPrice | currency: (o.currency || 'USD'):'symbol':'1.0-2' }}</strong></td>
                <td><span class="pill pill--{{ financialClass(o.financialStatus) }}">{{ o.financialStatus ?? '—' }}</span></td>
                <td><span class="muted">{{ o.fulfillmentStatus ?? '—' }}</span></td>
                <td class="open" aria-hidden="true">›</td>
              </tr>
            }
          </tbody>
        </table>

        @if (nextCursor()) {
          <div class="load-more-row">
            <button type="button" class="btn-ghost" [disabled]="loadingMore()" (click)="loadMore()">
              {{ loadingMore() ? "Loading…" : "Load more orders" }}
            </button>
          </div>
        }
      </div>
    }

    @if (detailTarget(); as target) {
      <div class="drawer-backdrop" (click)="closeDetail()">
        <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-labelledby]="'drawer-title'" (click)="$event.stopPropagation()">
          <header>
            <h2 id="drawer-title">{{ target.orderNumber ?? '#' + target.externalId }}</h2>
            <button type="button" class="btn-close" (click)="closeDetail()" aria-label="Close">×</button>
          </header>
          <div class="drawer-meta">
            <div><span class="muted">Date</span><strong>{{ target.createdAt | date: "medium" }}</strong></div>
            <div><span class="muted">Total</span><strong>{{ target.totalPrice | currency: (target.currency || 'USD'):'symbol':'1.0-2' }}</strong></div>
            <div><span class="muted">Customer</span><strong>{{ target.customerEmail ?? '—' }}</strong></div>
            <div><span class="muted">Items</span><strong>{{ target.lineItemsCount }}</strong></div>
          </div>

          @if (detailLoading()) {
            <p class="muted">Loading details…</p>
          } @else if (detailRaw(); as raw) {
            @if (rawLineItems(raw); as items) {
              <h3>Line items</h3>
              <ul class="line-items">
                @for (item of items; track $index) {
                  <li>
                    <span class="li-title">{{ item.title ?? item.sku ?? 'Item' }}</span>
                    <span class="li-meta">× {{ item.quantity ?? 1 }}</span>
                    <span class="li-price">{{ +(item.price ?? '0') | currency: (target.currency || 'USD'):'symbol':'1.0-2' }}</span>
                  </li>
                }
              </ul>
            }
            @if (rawNote(raw); as note) {
              <h3>Customer note</h3>
              <p class="note">{{ note }}</p>
            }
          } @else if (detailError()) {
            <div class="banner banner--error">{{ detailError() }}</div>
          }
        </aside>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .page-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; margin-bottom: 1rem;
    }
    .page-head h1 { margin: 0 0 .15rem; font-size: 1.4rem; color: var(--text); }
    .page-head .muted { margin: 0; color: var(--text-muted); font-size: .85rem; }
    .actions { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; }

    .ico { font-size: 1rem; }
    .lbl { font-weight: 500; }

    .acct-menu { padding: .25rem; min-width: 18rem; }
    .acct-item {
      width: 100%; display: flex; justify-content: space-between; align-items: center;
      background: transparent; border: 0; padding: .45rem .55rem; border-radius: .375rem;
      cursor: pointer; color: var(--text); font-size: .85rem; text-align: left;
    }
    .acct-item:hover { background: var(--ghost-bg); }
    .acct-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
    .check { color: #16a34a; font-weight: 600; }
    .divider { height: 1px; background: var(--card-bd); margin: .25rem .25rem; }

    .filter-bar { display: flex; gap: .65rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search, .status-select {
      border: 1px solid var(--input-bd); background: var(--card-bg); color: var(--text);
      border-radius: .4rem; padding: .5rem .65rem; font-size: .9rem; outline: none;
    }
    .search { min-width: 18rem; flex: 1; max-width: 28rem; }
    .search:focus, .status-select:focus { border-color: var(--accent, #4f46e5); }

    .card { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; }
    .table-card { overflow: hidden; }
    table.orders { width: 100%; border-collapse: collapse; font-size: .88rem; }
    table.orders th, table.orders td { padding: .65rem .85rem; text-align: left; border-bottom: 1px solid var(--card-bd); }
    table.orders th { font-weight: 600; color: var(--text-muted); background: var(--ghost-bg); font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
    table.orders tbody tr { cursor: pointer; }
    table.orders tbody tr:hover { background: var(--ghost-bg); }
    table.orders tbody tr:last-child td { border-bottom: 0; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.date { color: var(--text-muted); white-space: nowrap; }
    td.order-num { font-weight: 500; font-variant-numeric: tabular-nums; }
    td.customer { max-width: 18rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    td.open { color: var(--text-muted); font-size: 1.2rem; text-align: center; width: 1.5rem; }
    .muted { color: var(--text-muted); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

    .pill {
      display: inline-block; padding: .1rem .55rem; border-radius: 999px;
      font-size: .72rem; font-weight: 500; letter-spacing: .02em;
    }
    .pill--paid { background: #dcfce7; color: #166534; }
    .pill--pending { background: #fef3c7; color: #92400e; }
    .pill--refunded { background: #fee2e2; color: #b91c1c; }
    .pill--partial { background: #fef3c7; color: #92400e; }
    .pill--voided { background: #e5e7eb; color: #374151; }
    .pill--authorized { background: #dbeafe; color: #1e40af; }
    .pill--neutral { background: var(--ghost-bg); color: var(--text-muted); }

    .load-more-row { display: flex; justify-content: center; padding: .85rem; border-top: 1px solid var(--card-bd); }
    .btn-ghost {
      background: transparent; border: 1px solid var(--card-bd); color: var(--text);
      padding: .45rem .9rem; border-radius: .4rem; cursor: pointer; font-size: .85rem;
    }
    .btn-ghost:hover:not(:disabled) { background: var(--ghost-bg); }
    .btn-ghost:disabled { opacity: .55; cursor: not-allowed; }

    .empty { background: var(--card-bg); border: 1px dashed var(--input-bd); border-radius: .75rem; padding: 3rem 2rem; text-align: center; color: var(--text-muted); }
    .empty h2 { margin-top: 0; color: var(--text); }
    .primary-link { color: var(--accent); font-weight: 500; text-decoration: none; }
    .primary-link:hover { text-decoration: underline; }

    .drawer-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .55);
      z-index: 50; display: flex; justify-content: flex-end;
    }
    .drawer {
      width: min(480px, 100vw); background: var(--card-bg); border-left: 1px solid var(--card-bd);
      overflow-y: auto; padding: 1.25rem 1.4rem; display: flex; flex-direction: column; gap: .85rem;
      animation: slide-in .2s ease;
    }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer header { display: flex; align-items: center; justify-content: space-between; }
    .drawer h2 { margin: 0; font-size: 1.1rem; color: var(--text); }
    .drawer h3 { margin: .75rem 0 .35rem; font-size: .85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .drawer-meta { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem 1rem; padding: .65rem 0; border-bottom: 1px solid var(--card-bd); }
    .drawer-meta > div { display: flex; flex-direction: column; gap: .15rem; }
    .drawer-meta .muted { font-size: .75rem; }
    .drawer-meta strong { font-size: .9rem; color: var(--text); }
    .btn-close { background: transparent; border: 0; font-size: 1.5rem; cursor: pointer; color: var(--text-muted); line-height: 1; }
    .line-items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .35rem; }
    .line-items li { display: grid; grid-template-columns: 1fr auto auto; gap: .65rem; align-items: baseline; }
    .li-title { color: var(--text); }
    .li-meta, .li-price { color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .li-price { color: var(--text); font-weight: 500; }
    .note { color: var(--text); background: var(--ghost-bg); padding: .65rem .75rem; border-radius: .4rem; font-size: .85rem; margin: 0; }
    .banner { padding: .55rem .7rem; border-radius: .4rem; font-size: .85rem; }
    .banner--error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  `],
})
export class ShopifyOrdersComponent implements OnInit {
  private readonly api = inject(DashboardService);
  private readonly conns = inject(ConnectionsService);
  private readonly status = inject(StatusBarService);

  readonly statuses = STATUSES;
  readonly connections = signal<Connection[]>([]);
  readonly shopifyConns = computed(() => this.connections().filter((c) => c.platform === "shopify"));
  readonly selectedConn = signal<string | null>(null);

  readonly searchCtrl = new FormControl<string>("", { nonNullable: true });
  readonly searchTerm = signal<string>("");
  readonly statusFilter = signal<string>("");

  readonly orders = signal<ShopifyOrderListItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly refreshing = signal(false);
  readonly lastUpdated = signal<Date | null>(null);

  readonly detailTarget = signal<ShopifyOrderListItem | null>(null);
  readonly detailLoading = signal(false);
  readonly detailRaw = signal<unknown>(null);
  readonly detailError = signal<string | null>(null);

  readonly shopLabel = computed(() => {
    const id = this.selectedConn();
    if (id === null) return "All stores";
    const c = this.shopifyConns().find((x) => x.id === id);
    return c?.accountName ?? c?.accountId ?? "Store";
  });

  constructor() {
    // Debounce the search input so typing doesn't fire a backend call on every keystroke.
    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => {
        this.searchTerm.set(q ?? "");
        this.reload();
      });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.connections.set(await this.conns.list());
    } catch { /* non-critical */ }
    this.reload();
  }

  asValue(e: Event): string { return (e.target as HTMLSelectElement).value; }

  selectConn(id: string | null): void {
    this.selectedConn.set(id);
    this.reload();
  }

  setStatus(v: string): void {
    this.statusFilter.set(v);
    this.reload();
  }

  /**
   * Full reload — replaces the current page of orders. First-load state shows
   * a loading skeleton; subsequent reloads just toggle the refresh pill.
   */
  async reload(): Promise<void> {
    if (this.lastUpdated() === null) this.loading.set(true);
    this.refreshing.set(true);
    try {
      const res = await this.api.getShopifyOrdersList({
        connectionId: this.selectedConn() ?? undefined,
        status: this.statusFilter() || undefined,
        q: this.searchTerm() || undefined,
      });
      this.orders.set(res.orders);
      this.nextCursor.set(res.nextCursor);
      this.lastUpdated.set(new Date());
    } catch {
      this.status.error("Could not load orders");
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const res = await this.api.getShopifyOrdersList({
        connectionId: this.selectedConn() ?? undefined,
        status: this.statusFilter() || undefined,
        q: this.searchTerm() || undefined,
        cursor,
      });
      this.orders.update((cur) => [...cur, ...res.orders]);
      this.nextCursor.set(res.nextCursor);
    } catch {
      this.status.error("Could not load more orders");
    } finally {
      this.loadingMore.set(false);
    }
  }

  async openDetail(o: ShopifyOrderListItem): Promise<void> {
    this.detailTarget.set(o);
    this.detailRaw.set(null);
    this.detailError.set(null);
    this.detailLoading.set(true);
    try {
      const detail = await this.api.getShopifyOrderDetail(o.id);
      // Stale-target guard — if the user already opened a different order, drop this.
      if (this.detailTarget()?.id === o.id) this.detailRaw.set(detail.raw);
    } catch {
      if (this.detailTarget()?.id === o.id) this.detailError.set("Couldn't load order details.");
    } finally {
      if (this.detailTarget()?.id === o.id) this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    this.detailTarget.set(null);
    this.detailRaw.set(null);
    this.detailError.set(null);
  }

  /** Map a financial status to a pill color class. */
  financialClass(s: string | null): string {
    if (!s) return "neutral";
    if (s === "paid") return "paid";
    if (s === "pending" || s === "authorized") return s;
    if (s === "refunded") return "refunded";
    if (s === "partially_refunded") return "partial";
    if (s === "voided") return "voided";
    return "neutral";
  }

  rawLineItems(raw: unknown): Array<{ title?: string; sku?: string; quantity?: number; price?: string }> | null {
    const r = raw as { line_items?: Array<{ title?: string; sku?: string; quantity?: number; price?: string }> } | null;
    return r?.line_items?.length ? r.line_items : null;
  }

  rawNote(raw: unknown): string | null {
    const r = raw as { note?: string | null } | null;
    return r?.note?.trim() ? r.note.trim() : null;
  }
}
