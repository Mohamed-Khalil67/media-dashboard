import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ConnectionsService } from "../../core/connections.service";
import { StatusBarService } from "../../core/status-bar.service";
import { Connection, Platform } from "../../core/models/connection.models";
import { SyncHistoryComponent } from "./sync-history.component";

interface PlatformInfo {
  key: Platform;
  label: string;
  icon: string;
  blurb: string;
  brand: string;
  credentialsHelpUrl: string;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: "app-connections",
  imports: [ReactiveFormsModule, SyncHistoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-head">
      <h1>Connections</h1>
      <p class="muted">Bring your own platform credentials. We'll sync your data every couple of minutes.</p>
    </header>

    @if (loadError(); as msg) {
      <div class="load-pill" role="alert">
        <span class="dot"></span><span>{{ msg }}</span>
        <button class="pill-retry" (click)="reload()">Retry</button>
      </div>
    }

    <section class="connect-grid">
      @for (p of platforms; track p.key) {
        <article class="card" [class.connected]="countFor(p.key) > 0" [style.--brand]="p.brand">
          <div class="card-top">
            <div class="brand">
              <span class="ico">{{ p.icon }}</span>
              <h2>{{ p.label }}</h2>
            </div>
            @if (countFor(p.key) > 0) {
              <div class="status"><span class="pulse"></span><span>{{ countFor(p.key) }} connected</span></div>
            } @else {
              <div class="status status--idle"><span>Not connected</span></div>
            }
          </div>

          <p class="blurb">{{ p.blurb }}</p>

          <div class="card-actions">
            <button class="primary" (click)="openModal(p.key)">
              {{ countFor(p.key) > 0 ? '+ Add another account' : 'Connect ' + p.label }}
            </button>
          </div>
        </article>
      }
    </section>

    @if (connections().length > 0) {
      <section class="connections-list">
        <h2>Your accounts</h2>
        <div class="conn-rows">
          @for (c of connections(); track c.id) {
            <div class="conn-row" [class.row-failed]="c.lastSyncOk === false">
              <div class="conn-left">
                <div class="avatar" [style.--brand]="brandFor(c.platform)">{{ initials(c) }}</div>
                <div>
                  <div class="acct-name">{{ c.accountName ?? c.accountId }}</div>
                  <div class="acct-sub">
                    <span class="badge badge--{{ c.platform }}">{{ c.platform }}</span>
                    <span>·</span>
                    <span class="muted-sm">{{ formatSync(c) }}</span>
                    @if (c.syncSince) {
                      <span>·</span>
                      <span class="muted-sm">since {{ shortDate(c.syncSince) }}</span>
                    }
                  </div>
                  @if (c.lastSyncOk === false && c.lastSyncError) {
                    <div class="sync-err" [title]="c.lastSyncError">⚠ {{ c.lastSyncError }}</div>
                  }
                </div>
              </div>
              <div class="conn-right">
                <span class="status-tag status--{{ c.status }}"><span class="dot-sm"></span> {{ c.status }}</span>
                <button class="ghost" (click)="toggleHistory(c.id)">
                  {{ expandedId() === c.id ? 'Hide history' : 'Sync history' }}
                </button>
                <button class="edit" (click)="openEditModal(c)" title="Update App ID / Secret or date range">Edit credentials</button>
                <button class="danger" (click)="disconnect(c)">Disconnect</button>
              </div>
            </div>
            @if (expandedId() === c.id) { <app-sync-history [connectionId]="c.id" /> }
          }
        </div>
      </section>
    }

    @if (modalPlatform(); as mp) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2>{{ editingConnection() ? 'Edit ' + platformLabel(mp) + ' credentials' : 'Connect ' + platformLabel(mp) }}</h2>
            <button class="x" (click)="closeModal()" aria-label="Close">×</button>
          </header>

          <p class="modal-lede">{{ modalLede() }}</p>

          <form [formGroup]="form" (ngSubmit)="submitModal()">
            @if (mp === 'shopify') {
              <div class="field">
                <label for="shop">Shop domain</label>
                <input id="shop" type="text" formControlName="shop" placeholder="my-store.myshopify.com" autocomplete="off" />
              </div>
            }

            <div class="field">
              <label for="appId">{{ mp === 'shopify' ? 'API key' : 'App ID' }}</label>
              <input id="appId" type="text" formControlName="appId" autocomplete="off" />
            </div>

            <div class="field">
              <label for="appSecret">{{ mp === 'shopify' ? 'API secret' : 'App Secret' }}</label>
              <input id="appSecret" type="password" formControlName="appSecret" autocomplete="new-password" />
              <small class="hint">Stored encrypted at rest. Never shared.</small>
            </div>

            <details class="help">
              <summary>How do I get these?</summary>
              @if (mp === 'facebook') {
                <ol>
                  <li>Go to <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener">developers.facebook.com/apps</a> and create (or open) an app.</li>
                  <li>In <em>App settings → Basic</em>, copy the App ID and App Secret.</li>
                  <li>Under <em>Facebook Login → Settings</em>, add the Redirect URL shown below to "Valid OAuth Redirect URIs".</li>
                </ol>
              } @else {
                <ol>
                  <li>In your Shopify partner dashboard, create a custom app for your store.</li>
                  <li>Copy the API key and API secret.</li>
                  <li>Under App setup, add the Redirect URL below to "Allowed redirection URLs".</li>
                </ol>
              }
            </details>

            <div class="field">
              <label for="redirect">Redirect URL</label>
              <input id="redirect" type="text" formControlName="redirectUri" readonly />
            </div>

            <div class="field-row">
              <div class="field">
                <label for="since">Sync data from</label>
                <input id="since" type="date" formControlName="since" />
              </div>
              <div class="field">
                <label for="until">to</label>
                <input id="until" type="date" formControlName="until" />
              </div>
            </div>

            @if (modalError(); as e) { <div class="alert alert--error">{{ e }}</div> }

            <div class="modal-actions">
              <button type="button" class="ghost" (click)="closeModal()" [disabled]="submitting()">Cancel</button>
              <button type="submit" class="primary" [disabled]="form.invalid || submitting()">
                {{ submitting() ? "Starting…" : editingConnection() ? "Update & re-authorize" : "Continue to " + platformLabel(mp) }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .page-head h1 { margin: 0 0 .25rem; color: var(--text); }
    .muted { color: var(--text-muted); margin: 0 0 1.25rem; font-size: .9rem; }
    h2 { color: var(--text); }

    .connect-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem; }
    @media (max-width: 720px) { .connect-grid { grid-template-columns: 1fr; } }

    .card {
      --brand: #4f46e5;
      background: var(--card-bg); padding: 1.1rem 1.2rem; border-radius: .9rem;
      border: 1px solid var(--card-bd); transition: transform .18s, border-color .15s;
      display: flex; flex-direction: column; gap: .65rem; position: relative; overflow: hidden;
    }
    .card.connected { border-color: var(--brand); }
    .card.connected::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:var(--brand); }
    .card-top { display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: .55rem; }
    .ico { font-size: 1.35rem; }
    .brand h2 { margin: 0; font-size: 1rem; }
    .blurb { color: var(--text-muted); font-size: .85rem; margin: 0; }

    .status {
      display: inline-flex; align-items: center; gap: .4rem;
      background: color-mix(in srgb, #16a34a 12%, transparent); color: #16a34a;
      padding: .2rem .55rem; border-radius: 999px; font-size: .72rem; font-weight: 500;
    }
    .status--idle { background: var(--ghost-bg); color: var(--text-muted); }
    .pulse { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

    .card-actions { margin-top: auto; }
    button.primary { background: #4f46e5; color: #fff; border: 0; padding: .55rem 1rem;
      border-radius: .5rem; cursor: pointer; font-weight: 500; font-size: .9rem; }
    button.primary:hover:not(:disabled) { background: #4338ca; }
    button.primary:disabled { opacity: .55; cursor: not-allowed; }
    button.ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--card-bd);
      padding: .5rem .9rem; border-radius: .5rem; cursor: pointer; font-size: .85rem; }
    button.ghost:hover:not(:disabled) { background: var(--ghost-bg); color: var(--text); }
    button.edit { background: transparent; color: #4f46e5; border: 1px solid #c7d2fe;
      padding: .35rem .75rem; border-radius: .375rem; cursor: pointer; font-size: .8rem; }
    button.edit:hover { background: #eef2ff; }
    button.danger { background: transparent; color: #dc2626; border: 1px solid #fecaca;
      padding: .35rem .75rem; border-radius: .375rem; cursor: pointer; font-size: .8rem; }
    button.danger:hover { background: #fef2f2; }

    .connections-list { margin-top: 1.5rem; }
    .connections-list h2 { margin: 0 0 .75rem; font-size: 1rem; }
    .conn-rows { display: flex; flex-direction: column; gap: .5rem; }
    .conn-row {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .65rem;
      padding: .75rem 1rem;
    }
    .conn-left { display: flex; align-items: center; gap: .85rem; min-width: 0; }
    .avatar {
      --brand: #4f46e5;
      width: 2rem; height: 2rem; border-radius: 50%; background: var(--brand);
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 600;
    }
    .acct-name { font-weight: 500; color: var(--text); }
    .acct-sub { display: flex; align-items: center; gap: .4rem; font-size: .8rem; color: var(--text-muted); margin-top: .15rem; flex-wrap: wrap; }
    .muted-sm { color: var(--text-muted); font-size: .8rem; }
    .conn-right { display: flex; align-items: center; gap: .65rem; }

    .badge { padding: .12rem .5rem; border-radius: 999px; font-size: .7rem; text-transform: capitalize; }
    .badge--facebook { background: #dbeafe; color: #1e40af; }
    .badge--shopify  { background: #dcfce7; color: #166534; }
    .status-tag { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .6rem; border-radius: 999px; font-size: .72rem; font-weight: 500; text-transform: capitalize; }
    .status-tag .dot-sm { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .status--active  { background: #dcfce7; color: #166534; }
    .status--pending { background: #fef3c7; color: #92400e; }
    .status--expired { background: #fef3c7; color: #92400e; }
    .status--revoked { background: #fee2e2; color: #991b1b; }
    .conn-row.row-failed { border-color: #fca5a5; }
    .sync-err { margin-top: .3rem; color: #b91c1c; font-size: .72rem; max-width: 38rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .load-pill { display: inline-flex; align-items: center; gap: .5rem; padding: .45rem .85rem;
      border-radius: 999px; font-size: .82rem; margin-bottom: 1rem; background: #fee2e2; color: #b91c1c; }
    .load-pill .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .pill-retry { background: transparent; color: currentColor; padding: 0 .25rem; font-size: .78rem; text-decoration: underline; border: 0; cursor: pointer; }

    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .55);
      display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
    .modal { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem;
      padding: 1.5rem; max-width: 32rem; width: 100%; max-height: 90vh; overflow-y: auto; }
    .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
    .modal-head h2 { margin: 0; font-size: 1.15rem; }
    .x { background: transparent; border: 0; font-size: 1.6rem; line-height: 1; color: var(--text-muted); cursor: pointer; }
    .modal-lede { color: var(--text-muted); font-size: .88rem; margin: 0 0 1.1rem; line-height: 1.5; }
    .modal .field { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .85rem; }
    .modal label { font-size: .82rem; font-weight: 500; color: var(--text); }
    .modal input {
      padding: .6rem .8rem; border: 1px solid var(--input-bd); border-radius: .5rem;
      background: var(--card-bg); color: var(--text); font-size: .9rem; outline: none;
    }
    .modal input:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
    .modal input[readonly] { background: var(--ghost-bg); color: var(--text-muted); }
    .hint { color: var(--text-muted); font-size: .72rem; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
    .help { margin-bottom: .85rem; }
    .help summary { cursor: pointer; font-size: .82rem; color: #4f46e5; font-weight: 500; }
    .help ol { padding-left: 1.2rem; margin: .5rem 0 0; font-size: .82rem; color: var(--text-muted); line-height: 1.6; }
    .help a { color: #4f46e5; }
    .alert { padding: .65rem .85rem; border-radius: .5rem; font-size: .85rem; margin-bottom: .75rem; }
    .alert--error { background: #fef2f2; color: #b91c1c; }
    .modal-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .5rem; }
  `],
})
export class ConnectionsComponent implements OnInit {
  private readonly api = inject(ConnectionsService);
  private readonly status = inject(StatusBarService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly platforms: PlatformInfo[] = [
    { key: "facebook", label: "Facebook Ads", icon: "📘", blurb: "Campaigns, spend, ROAS, frequency.", brand: "#1877F2",
      credentialsHelpUrl: "https://developers.facebook.com/apps/" },
    { key: "shopify",  label: "Shopify",      icon: "🛒", blurb: "Real orders and revenue from your store.", brand: "#16a34a",
      credentialsHelpUrl: "https://shopify.dev/docs/apps" },
  ];

  readonly connections = signal<Connection[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly expandedId = signal<string | null>(null);
  readonly modalPlatform = signal<Platform | null>(null);
  readonly editingConnection = signal<Connection | null>(null);
  readonly submitting = signal(false);
  readonly modalError = signal<string | null>(null);

  readonly modalLede = computed(() => {
    const mp = this.modalPlatform();
    if (this.editingConnection()) {
      return "Update your App ID, secret, or date range. We'll re-run the OAuth flow to apply the new credentials.";
    }
    return `Enter the credentials for your own ${mp ? this.platformLabel(mp) : ""} app. We'll use them to fetch data on your behalf and re-sync every couple of minutes.`;
  });

  readonly form = this.fb.nonNullable.group({
    shop: [""],
    appId: ["", [Validators.required]],
    appSecret: ["", [Validators.required]],
    redirectUri: [""],
    since: [isoDaysAgo(30)],
    until: [isoDaysAgo(0)],
  });

  ngOnInit(): void {
    this.handleCallbackQuery();
    this.reload();
  }

  countFor(p: Platform): number {
    return this.connections().filter((c) => c.platform === p).length;
  }

  brandFor(p: Platform): string {
    return this.platforms.find((x) => x.key === p)?.brand ?? "#4f46e5";
  }

  platformLabel(p: Platform): string {
    return this.platforms.find((x) => x.key === p)?.label ?? p;
  }

  initials(c: Connection): string {
    const src = c.accountName ?? c.accountId;
    return src.replace(/^act_/i, "").split(/[\s\-_.]+/).filter(Boolean)
      .slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  }

  formatSync(c: Connection): string {
    if (!c.lastSyncAt) return "Never synced";
    return `Last sync ${this.shortDate(c.lastSyncAt)}`;
  }

  shortDate(iso: string): string {
    try {
      const d = new Date(iso);
      const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      if (days === 0) return "today";
      if (days === 1) return "yesterday";
      if (days < 30) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch { return ""; }
  }

  toggleHistory(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  async reload(): Promise<void> {
    this.loadError.set(null);
    try {
      this.connections.set(await this.api.list());
    } catch {
      this.loadError.set("Could not load connections. Backend may be unreachable.");
    }
  }

  openModal(platform: Platform): void {
    this.editingConnection.set(null);
    this.modalError.set(null);
    this.form.reset({
      shop: "",
      appId: "",
      appSecret: "",
      redirectUri: `${window.location.origin}/api/${platform}/callback`,
      since: isoDaysAgo(30),
      until: isoDaysAgo(0),
    });
    if (platform === "shopify") {
      this.form.controls.shop.setValidators([Validators.required]);
    } else {
      this.form.controls.shop.clearValidators();
    }
    this.form.controls.shop.updateValueAndValidity();
    this.modalPlatform.set(platform);
  }

  openEditModal(c: Connection): void {
    this.editingConnection.set(c);
    this.modalError.set(null);
    this.form.reset({
      shop: "",
      appId: "",
      appSecret: "",
      redirectUri: `${window.location.origin}/api/${c.platform}/callback`,
      since: c.syncSince ? c.syncSince.slice(0, 10) : isoDaysAgo(30),
      until: c.syncUntil ? c.syncUntil.slice(0, 10) : isoDaysAgo(0),
    });
    if (c.platform === "shopify") {
      this.form.controls.shop.setValidators([Validators.required]);
    } else {
      this.form.controls.shop.clearValidators();
    }
    this.form.controls.shop.updateValueAndValidity();
    this.modalPlatform.set(c.platform);
  }

  closeModal(): void {
    this.modalPlatform.set(null);
    this.editingConnection.set(null);
    this.modalError.set(null);
  }

  async submitModal(): Promise<void> {
    const platform = this.modalPlatform();
    if (!platform || this.form.invalid) return;
    this.submitting.set(true);
    this.modalError.set(null);
    try {
      const v = this.form.getRawValue();
      const editing = this.editingConnection();
      const res = await this.api.connectStart(platform, {
        appId: v.appId.trim(),
        appSecret: v.appSecret.trim(),
        redirectUri: v.redirectUri || undefined,
        since: v.since || undefined,
        until: v.until || undefined,
        shop: platform === "shopify" ? v.shop.trim().toLowerCase() : undefined,
        connectionId: editing?.id,
      });
      window.location.href = res.url;
    } catch (err: any) {
      this.modalError.set(err?.error?.error ?? `Could not start ${platform} connect flow`);
    } finally {
      this.submitting.set(false);
    }
  }

  async disconnect(c: Connection): Promise<void> {
    if (!confirm(`Disconnect ${c.platform} (${c.accountName ?? c.accountId})?`)) return;
    try {
      await this.api.disconnect(c.id);
      this.status.success("Disconnected");
      this.reload();
    } catch {
      this.status.error("Could not disconnect");
    }
  }

  private handleCallbackQuery(): void {
    const q = this.route.snapshot.queryParamMap;
    for (const platform of ["facebook", "shopify"] as const) {
      const v = q.get(platform);
      if (!v) continue;
      if (v === "connected") this.status.success(`${platform} connected!`);
      else if (v === "no_accounts" || v === "no_advertisers") this.status.error(`No ${platform} accounts found.`);
      else this.status.error(`${platform} connection failed.`);
    }
  }
}
