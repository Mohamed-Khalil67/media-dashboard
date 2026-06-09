import { Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { ConnectionsService } from "../../core/connections.service";
import { ToastService } from "../../core/toast.service";
import { Connection, Platform } from "../../core/models/connection.models";

@Component({
  selector: "app-connections",
  imports: [],
  template: `
    <header class="page-head">
      <h1>Connections</h1>
      <p class="muted">Hook up your ad platforms and your Shopify store. Data syncs every 30 minutes.</p>
    </header>

    <section class="connect-grid">
      <div class="connect-card">
        <h2>Facebook Ads</h2>
        <p class="muted">Campaigns, spend, ROAS, frequency.</p>
        <button (click)="connect('facebook')">Connect Facebook</button>
      </div>

      <div class="connect-card">
        <h2>TikTok Ads</h2>
        <p class="muted">Campaigns, spend, complete-payment ROAS.</p>
        <button (click)="connect('tiktok')">Connect TikTok</button>
      </div>

      <div class="connect-card">
        <h2>Shopify</h2>
        <p class="muted">Real orders and revenue.</p>
        <div class="shop-row">
          <input
            type="text"
            placeholder="mystore.myshopify.com"
            [value]="shopDomain()"
            (input)="shopDomain.set(asValue($event))"
          />
          <button (click)="connectShopify()" [disabled]="!shopDomain()">Connect</button>
        </div>
      </div>
    </section>

    <section class="connections-list">
      <div class="list-head">
        <h2>Active connections</h2>
        <button class="secondary" (click)="reload()" [disabled]="loading()">
          {{ loading() ? "Loading…" : "Refresh" }}
        </button>
      </div>

      @if (connections().length === 0) {
        <p class="muted">No connections yet. Connect a platform above to get started.</p>
      } @else {
        <table>
          <thead>
            <tr><th>Platform</th><th>Account</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            @for (c of connections(); track c.id) {
              <tr>
                <td>{{ c.platform }}</td>
                <td>{{ c.accountName ?? c.accountId }}</td>
                <td><span class="status status--{{ c.status }}">{{ c.status }}</span></td>
                <td>
                  <button class="danger" (click)="disconnect(c)">Disconnect</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [`
    .page-head h1 { margin: 0 0 .25rem; }
    .muted { color: #64748b; margin: 0 0 1rem; font-size: .9rem; }
    .connect-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .connect-card {
      background: #fff; padding: 1.25rem; border-radius: .75rem;
      border: 1px solid #e2e8f0;
    }
    .connect-card h2 { margin: 0 0 .25rem; font-size: 1.05rem; }
    button {
      background: #4f46e5; color: #fff; border: 0; padding: .5rem 1rem;
      border-radius: .375rem; cursor: pointer; font-weight: 500;
    }
    button:hover:not(:disabled) { background: #4338ca; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    button.secondary { background: #f1f5f9; color: #334155; }
    button.danger { background: #fee2e2; color: #b91c1c; padding: .35rem .75rem; }
    .shop-row { display: flex; gap: .5rem; }
    .shop-row input { flex: 1; padding: .5rem .75rem; border: 1px solid #cbd5e1; border-radius: .375rem; }
    .list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .75rem; }
    table { width: 100%; background: #fff; border-radius: .5rem; overflow: hidden; border-collapse: collapse; }
    th, td { padding: .65rem .75rem; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: .9rem; }
    th { background: #f8fafc; font-weight: 500; color: #475569; }
    .status { padding: .15rem .5rem; border-radius: 999px; font-size: .75rem; font-weight: 500; }
    .status--active  { background: #dcfce7; color: #166534; }
    .status--expired { background: #fef3c7; color: #92400e; }
    .status--revoked { background: #fee2e2; color: #991b1b; }
  `],
})
export class ConnectionsComponent implements OnInit {
  private readonly api = inject(ConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly connections = signal<Connection[]>([]);
  readonly loading = signal(false);
  readonly shopDomain = signal("");

  ngOnInit(): void {
    this.handleCallbackQuery();
    this.reload();
  }

  asValue(e: Event): string {
    return (e.target as HTMLInputElement).value.trim().toLowerCase();
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

  /** Surface callback success/error redirects from the backend OAuth flows. */
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
