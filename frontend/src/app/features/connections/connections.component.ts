import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { SlicePipe } from "@angular/common";
import { ConnectionsService } from "../../core/connections.service";
import { ToastService } from "../../core/toast.service";
import { Connection, Platform } from "../../core/models/connection.models";

interface PlatformInfo {
  key: Platform;
  label: string;
  icon: string;
  blurb: string;
  brand: string;
}

@Component({
  selector: "app-connections",
  imports: [SlicePipe],
  template: `
    <header class="page-head">
      <h1>Connections</h1>
      <p class="muted">Hook up your ad platforms and your Shopify store. Data syncs every 30 minutes.</p>
    </header>

    <section class="connect-grid">
      @for (p of platforms; track p.key) {
        <article
          class="card"
          [class.connected]="countFor(p.key) > 0"
          [class.selected]="selectedPlatform() === p.key"
          [class.has-expired]="expiredFor(p.key) > 0"
          [style.--brand]="p.brand"
          (click)="onCardClick(p.key)">

          <div class="card-top">
            <div class="brand">
              <span class="ico">{{ p.icon }}</span>
              <h2>{{ p.label }}</h2>
            </div>

            @if (countFor(p.key) > 0) {
              <div class="status" [class.warn]="expiredFor(p.key) > 0">
                <span class="pulse"></span>
                <span>{{ expiredFor(p.key) > 0 ? 'Attention' : 'Active' }}</span>
              </div>
            } @else {
              <div class="status status--idle"><span>Not connected</span></div>
            }
          </div>

          @if (countFor(p.key) === 0) {
            <p class="blurb">{{ p.blurb }}</p>
          }

          @if (countFor(p.key) > 0) {
            <div class="account-strip">
              @for (c of accountsFor(p.key) | slice: 0:4; track c.id) {
                <div class="avatar" [title]="c.accountName ?? c.accountId" [class.expired]="c.status === 'expired'">
                  {{ initials(c) }}
                </div>
              }
              @if (countFor(p.key) > 4) {
                <div class="avatar more">+{{ countFor(p.key) - 4 }}</div>
              }
            </div>
            <div class="stats">
              <div>
                <strong>{{ countFor(p.key) }}</strong>
                <span class="muted">{{ countFor(p.key) === 1 ? 'account' : 'accounts' }}</span>
              </div>
              @if (expiredFor(p.key) > 0) {
                <div class="expired-note">
                  <strong>{{ expiredFor(p.key) }}</strong>
                  <span>expired</span>
                </div>
              }
            </div>
          }

          <div class="card-actions" (click)="$event.stopPropagation()">
            @if (p.key === 'shopify') {
              <div class="shop-row">
                <input
                  type="text"
                  placeholder="store.myshopify.com"
                  [value]="shopDomain()"
                  (input)="shopDomain.set(asValue($event))" />
                <button
                  class="primary"
                  (click)="connectShopify()"
                  [disabled]="!shopDomain()">
                  {{ countFor('shopify') > 0 ? 'Add store' : 'Connect' }}
                </button>
              </div>
            } @else {
              <button class="primary" (click)="connect(p.key)">
                {{ countFor(p.key) > 0 ? '+ Add another' : 'Connect ' + p.label }}
              </button>
            }
            @if (countFor(p.key) > 0) {
              <button class="ghost" (click)="onCardClick(p.key)">
                {{ selectedPlatform() === p.key ? 'Hide accounts' : 'View accounts' }}
              </button>
            }
          </div>
        </article>
      }
    </section>

    @if (connections().length > 0 || selectedPlatform() !== null) {
      <section class="connections-list">
        <div class="list-head">
          <h2>{{ listHeading() }}</h2>
          @if (selectedPlatform() !== null) {
            <button class="chip-clear" (click)="selectPlatform(null)">Show all ×</button>
          }
        </div>

        @if (filtered().length === 0) {
          <div class="empty-filter">
            <p class="muted">No {{ selectedPlatform() }} accounts connected yet.</p>
            <button class="primary" (click)="connectSelected()">Connect {{ selectedPlatformLabel() }}</button>
          </div>
        } @else {
          <div class="conn-rows">
            @for (c of filtered(); track c.id) {
              <div class="conn-row">
                <div class="conn-left">
                  <div class="avatar" [style.--brand]="brandFor(c.platform)" [class.expired]="c.status === 'expired'">
                    {{ initials(c) }}
                  </div>
                  <div>
                    <div class="acct-name">{{ c.accountName ?? c.accountId }}</div>
                    <div class="acct-sub">
                      <span class="badge badge--{{ c.platform }}">{{ c.platform }}</span>
                      <span class="dot">·</span>
                      <span class="muted-sm">Connected {{ formatDate(c.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <div class="conn-right">
                  <span class="status-tag status--{{ c.status }}">
                    <span class="dot-sm"></span> {{ c.status }}
                  </span>
                  <button class="danger" (click)="disconnect(c)">Disconnect</button>
                </div>
              </div>
            }
          </div>
        }
      </section>
    }
  `,
  styles: [`
    .page-head h1 { margin: 0 0 .25rem; color: var(--text); }
    .muted { color: var(--text-muted); margin: 0 0 1rem; font-size: .9rem; }
    h2, h3 { color: var(--text); }

    .connect-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
    @media (max-width: 980px) { .connect-grid { grid-template-columns: 1fr; } }

    .card {
      --brand: #4f46e5;
      background: var(--card-bg);
      padding: 1.1rem 1.2rem;
      border-radius: .9rem;
      border: 1px solid var(--card-bd);
      cursor: pointer;
      transition: transform .18s, border-color .15s, box-shadow .18s;
      display: flex; flex-direction: column; gap: .65rem;
      position: relative;
      overflow: hidden;
    }
    .card:hover { transform: translateY(-2px); border-color: var(--brand); box-shadow: 0 6px 18px rgba(15, 23, 42, .07); }
    :host-context(html.dark) .card:hover { box-shadow: 0 6px 18px rgba(0, 0, 0, .35); }
    .card.connected { border-color: var(--brand); }
    .card.connected::before {
      content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--brand);
    }
    .card.selected { box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent); border-color: var(--brand); }
    .card.has-expired::before { background: linear-gradient(90deg, var(--brand) 0%, var(--brand) 60%, #f59e0b 60%, #f59e0b 100%); }

    .card-top { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .brand { display: flex; align-items: center; gap: .55rem; }
    .ico { font-size: 1.35rem; line-height: 1; }
    .brand h2 { margin: 0; font-size: 1rem; }

    .status {
      display: flex; align-items: center; gap: .4rem;
      background: color-mix(in srgb, #16a34a 12%, transparent);
      color: #16a34a;
      padding: .2rem .55rem; border-radius: 999px;
      font-size: .72rem; font-weight: 500;
    }
    .status.warn { background: color-mix(in srgb, #f59e0b 14%, transparent); color: #b45309; }
    .status--idle { background: var(--ghost-bg); color: var(--text-muted); }
    .pulse {
      width: 7px; height: 7px; border-radius: 50%; background: currentColor;
      box-shadow: 0 0 0 0 currentColor;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 50%, transparent); }
      70%  { box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 0%,  transparent); }
      100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 0%,  transparent); }
    }

    .blurb { color: var(--text-muted); font-size: .85rem; margin: 0; }

    .account-strip { display: flex; align-items: center; gap: -.5rem; min-height: 2rem; }
    .avatar {
      width: 2rem; height: 2rem; border-radius: 50%;
      background: var(--brand); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 600;
      border: 2px solid var(--card-bg);
      margin-left: -.5rem;
      position: relative;
    }
    .avatar:first-child { margin-left: 0; }
    .avatar.more { background: var(--ghost-bg); color: var(--text-muted); font-size: .7rem; }
    .avatar.expired { background: #f59e0b; }
    .avatar.expired::after {
      content: "!"; position: absolute; top: -3px; right: -3px;
      width: 12px; height: 12px; border-radius: 50%;
      background: #dc2626; color: #fff; font-size: .55rem; line-height: 12px;
      text-align: center; font-weight: 700;
    }

    .stats { display: flex; align-items: baseline; gap: 1rem; margin-top: -.15rem; }
    .stats strong { font-size: 1.25rem; color: var(--text); font-weight: 600; margin-right: .25rem; }
    .stats .muted { color: var(--text-muted); font-size: .8rem; }
    .expired-note { color: #b45309; font-size: .8rem; }
    .expired-note strong { color: #b45309; font-size: 1rem; }

    .card-actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: auto; }

    button.primary {
      background: #4f46e5; color: #fff; border: 0; padding: .5rem .9rem;
      border-radius: .5rem; cursor: pointer; font-weight: 500; font-size: .85rem;
      flex: 1; min-width: 8rem;
    }
    button.primary:hover:not(:disabled) { background: #4338ca; }
    button.primary:disabled { opacity: .55; cursor: not-allowed; }
    button.ghost {
      background: transparent; color: var(--text-muted); border: 1px solid var(--card-bd);
      padding: .5rem .9rem; border-radius: .5rem; cursor: pointer; font-size: .85rem;
      font-weight: 500;
    }
    button.ghost:hover { background: var(--ghost-bg); color: var(--text); }
    button.danger {
      background: transparent; color: #dc2626; border: 1px solid #fecaca;
      padding: .35rem .75rem; border-radius: .375rem; cursor: pointer; font-size: .8rem;
    }
    button.danger:hover { background: #fef2f2; }
    :host-context(html.dark) button.danger { border-color: #7f1d1d; }
    :host-context(html.dark) button.danger:hover { background: #450a0a; }

    .chip-clear {
      background: var(--accent-soft); color: var(--accent); border: 0;
      padding: .25rem .7rem; border-radius: 999px; cursor: pointer;
      font-size: .75rem; font-weight: 500;
    }

    .shop-row { display: flex; gap: .5rem; flex: 1; min-width: 100%; }
    .shop-row input {
      flex: 1; min-width: 0; padding: .5rem .75rem;
      border: 1px solid var(--input-bd); border-radius: .5rem;
      background: var(--card-bg); color: var(--text); font-size: .85rem; outline: none;
    }
    .shop-row input:focus { border-color: #4f46e5; }
    .shop-row button { flex: 0 0 auto; min-width: auto; }

    .list-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .list-head h2 { margin: 0; font-size: 1rem; }

    .empty-filter { display: flex; flex-direction: column; align-items: center; gap: .75rem; padding: 2rem 1rem; background: var(--card-bg); border: 1px dashed var(--card-bd); border-radius: .65rem; }
    .empty-filter p { margin: 0; }
    .empty-filter button { max-width: 16rem; }
    .conn-rows { display: flex; flex-direction: column; gap: .5rem; }
    .conn-row {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .65rem;
      padding: .75rem 1rem;
      transition: border-color .15s;
    }
    .conn-row:hover { border-color: var(--accent); }
    .conn-left { display: flex; align-items: center; gap: .85rem; min-width: 0; }
    .acct-name { font-weight: 500; color: var(--text); }
    .acct-sub { display: flex; align-items: center; gap: .4rem; font-size: .8rem; color: var(--text-muted); margin-top: .15rem; }
    .acct-sub .dot { color: var(--muted); }
    .muted-sm { color: var(--text-muted); font-size: .8rem; }
    .conn-right { display: flex; align-items: center; gap: .65rem; }

    .badge { padding: .12rem .5rem; border-radius: 999px; font-size: .7rem; font-weight: 500; text-transform: capitalize; }
    .badge--facebook { background: #dbeafe; color: #1e40af; }
    .badge--tiktok   { background: #fce7f3; color: #9d174d; }
    .badge--shopify  { background: #dcfce7; color: #166534; }

    .status-tag { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .6rem; border-radius: 999px; font-size: .72rem; font-weight: 500; text-transform: capitalize; }
    .status-tag .dot-sm { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .status--active  { background: #dcfce7; color: #166534; }
    .status--expired { background: #fef3c7; color: #92400e; }
    .status--revoked { background: #fee2e2; color: #991b1b; }
    :host-context(html.dark) .status--active  { background: #14532d; color: #86efac; }
    :host-context(html.dark) .status--expired { background: #78350f; color: #fcd34d; }
    :host-context(html.dark) .status--revoked { background: #7f1d1d; color: #fca5a5; }
  `],
})
export class ConnectionsComponent implements OnInit {
  private readonly api = inject(ConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly platforms: PlatformInfo[] = [
    { key: "facebook", label: "Facebook Ads", icon: "📘", blurb: "Campaigns, spend, ROAS, frequency.",     brand: "#1877F2" },
    { key: "tiktok",   label: "TikTok Ads",   icon: "🎵", blurb: "Campaigns, spend, complete-payment ROAS.", brand: "#FE2C55" },
    { key: "shopify",  label: "Shopify",      icon: "🛒", blurb: "Real orders and revenue.",                 brand: "#16a34a" },
  ];

  readonly connections = signal<Connection[]>([]);
  readonly loading = signal(false);
  readonly shopDomain = signal("");
  readonly selectedPlatform = signal<Platform | null>(null);

  readonly filtered = computed(() => {
    const p = this.selectedPlatform();
    if (!p) return this.connections();
    return this.connections().filter((c) => c.platform === p);
  });

  readonly listHeading = computed(() => {
    const p = this.selectedPlatform();
    if (!p) return "All connections";
    const info = this.platforms.find((x) => x.key === p);
    return `${info?.label ?? p} · ${this.filtered().length} ${this.filtered().length === 1 ? 'account' : 'accounts'}`;
  });

  readonly selectedPlatformLabel = computed(() => {
    const p = this.selectedPlatform();
    return this.platforms.find((x) => x.key === p)?.label ?? "";
  });

  connectSelected(): void {
    const p = this.selectedPlatform();
    if (!p) return;
    if (p === "shopify") {
      this.toast.info("Enter your shop domain in the Shopify card above.");
      return;
    }
    this.connect(p);
  }

  ngOnInit(): void {
    this.handleCallbackQuery();
    this.reload();
  }

  asValue(e: Event): string {
    return (e.target as HTMLInputElement).value.trim().toLowerCase();
  }

  countFor(platform: Platform): number {
    return this.connections().filter((c) => c.platform === platform).length;
  }

  expiredFor(platform: Platform): number {
    return this.connections().filter((c) => c.platform === platform && c.status === "expired").length;
  }

  accountsFor(platform: Platform): Connection[] {
    return this.connections().filter((c) => c.platform === platform);
  }

  brandFor(platform: Platform): string {
    return this.platforms.find((p) => p.key === platform)?.brand ?? "#4f46e5";
  }

  initials(c: Connection): string {
    const src = c.accountName ?? c.accountId;
    return src
      .replace(/^act_/i, "")
      .split(/[\s\-_.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  }

  onCardClick(p: Platform): void {
    this.selectedPlatform.set(this.selectedPlatform() === p ? null : p);
  }

  selectPlatform(p: Platform | null): void {
    this.selectedPlatform.set(p);
  }

  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      if (days === 0) return "today";
      if (days === 1) return "yesterday";
      if (days < 30) return `${days} days ago`;
      return d.toLocaleDateString();
    } catch { return ""; }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.connections.set(await this.api.list());
    } catch {
      this.toast.error("Could not load connections");
    } finally {
      this.loading.set(false);
    }
  }

  async connect(platform: Exclude<Platform, "shopify">): Promise<void> {
    try {
      const url = await this.api.getConnectUrl(platform);
      window.location.href = url;
    } catch {
      this.toast.error(`Could not start ${platform} connect flow`);
    }
  }

  async connectShopify(): Promise<void> {
    const shop = this.shopDomain();
    if (!shop) return;
    try {
      const url = await this.api.getConnectUrl("shopify", { shop });
      window.location.href = url;
    } catch (err: any) {
      this.toast.error(err?.error?.error ?? "Could not start Shopify connect flow");
    }
  }

  async disconnect(c: Connection): Promise<void> {
    if (!confirm(`Disconnect ${c.platform} (${c.accountName ?? c.accountId})?`)) return;
    try {
      await this.api.disconnect(c.id);
      this.toast.success("Disconnected");
      this.reload();
    } catch {
      this.toast.error("Could not disconnect");
    }
  }

  private handleCallbackQuery(): void {
    const q = this.route.snapshot.queryParamMap;
    for (const platform of ["facebook", "tiktok", "shopify"] as const) {
      const v = q.get(platform);
      if (!v) continue;
      if (v === "connected") this.toast.success(`${platform} connected!`);
      else if (v === "no_accounts" || v === "no_advertisers") this.toast.error(`No ${platform} accounts found.`);
      else this.toast.error(`${platform} connection failed.`);
    }
  }
}
