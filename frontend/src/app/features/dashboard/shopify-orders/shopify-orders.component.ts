import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { ConnectionsService } from "../../../core/connections.service";
import { DashboardService } from "../../../core/dashboard.service";
import { StatusBarService } from "../../../core/status-bar.service";
import { Connection } from "../../../core/models/connection.models";
import { ShopifyOrderListItem, ShopifyOrdersSummary } from "../../../core/models/metrics.models";
import { DashboardTabsComponent } from "../dashboard-tabs/dashboard-tabs.component";
import { ShopifySubtabsComponent } from "../shopify-subtabs/shopify-subtabs.component";
import { DropdownComponent } from "../../../shared/dropdown/dropdown.component";
import { RefreshBarComponent } from "../components/refresh-bar/refresh-bar.component";
import { KpiCardComponent } from "../components/kpi-card/kpi-card.component";

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
    DashboardTabsComponent, ShopifySubtabsComponent, DropdownComponent, RefreshBarComponent, KpiCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./shopify-orders.component.html",
  styleUrl: "./shopify-orders.component.css",
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
  readonly summary = signal<ShopifyOrdersSummary | null>(null);
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
      const connectionId = this.selectedConn() ?? undefined;
      const [res, summary] = await Promise.all([
        this.api.getShopifyOrdersList({
          connectionId,
          status: this.statusFilter() || undefined,
          q: this.searchTerm() || undefined,
        }),
        this.api.getShopifyOrdersSummary({ connectionId }),
      ]);
      this.orders.set(res.orders);
      this.nextCursor.set(res.nextCursor);
      this.summary.set(summary);
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
