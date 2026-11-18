import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ConnectionsService, apiErrorMessage } from "../../../core/connections.service";
import { StatusBarService } from "../../../core/status-bar.service";
import { Connection, Platform } from "../../../core/models/connection.models";
import { SyncHistoryComponent } from "../sync-history/sync-history.component";
import { environment } from "../../../../environments/environment";

interface PlatformInfo {
  key: Platform;
  label: string;
  icon: string;
  blurb: string;
  brand: string;
  credentialsHelpUrl: string;
}

/** The backend origin (e.g. http://localhost:3000), derived from apiUrl.
 *  In production apiUrl is '/api' (relative) so we fall back to window.location.origin
 *  which is correct because frontend and backend share the same domain on Railway. */
function backendOrigin(): string {
  const url = environment.apiUrl;
  return url.startsWith("http") ? url.replace(/\/api\/?$/, "") : window.location.origin;
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
  templateUrl: "./connections.component.html",
  styleUrl: "./connections.component.css",
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

  readonly activeConnections = computed(() =>
    this.connections().filter((c) => c.status !== "pending")
  );

  countFor(p: Platform): number {
    return this.activeConnections().filter((c) => c.platform === p).length;
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
      redirectUri: `${backendOrigin()}/api/${platform}/callback`,
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
    } catch (err) {
      this.modalError.set(apiErrorMessage(err) ?? `Could not start ${platform} connect flow`);
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
