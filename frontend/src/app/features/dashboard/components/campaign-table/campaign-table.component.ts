import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { CampaignAggregate } from "../../../../core/models/metrics.models";
import { DashboardService } from "../../../../core/dashboard.service";
import { StatusBarService } from "../../../../core/status-bar.service";
import { DropdownComponent } from "../../../../shared/dropdown/dropdown.component";

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
  templateUrl: "./campaign-table.component.html",
  styleUrl: "./campaign-table.component.css",
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

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.search.set(target.value);
  }

  onActiveOnlyChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.activeOnly.set(target.checked);
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
