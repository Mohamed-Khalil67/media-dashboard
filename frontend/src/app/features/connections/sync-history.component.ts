import { Component, OnInit, computed, inject, input, signal } from "@angular/core";
import { ConnectionsService, SyncHistoryRun } from "../../core/connections.service";

@Component({
  selector: "app-sync-history",
  imports: [],
  template: `
    <div class="hist">
      <header class="hist-head">
        <strong>Sync history</strong>
        @if (loading()) { <span class="muted-sm">Loading…</span> }
        @if (loadError()) { <span class="err">Failed to load history</span> }
      </header>

      @if (runs().length === 0 && !loading()) {
        <p class="muted-sm">No sync runs yet for this connection.</p>
      } @else {
        <ul class="runs">
          @for (r of runs(); track r.id) {
            <li class="run" [class.run--ok]="r.ok === true" [class.run--fail]="r.ok === false" [class.run--pending]="r.ok === null">
              <span class="status-dot"></span>
              <div class="meta">
                <div class="line-1">
                  <span class="when">{{ format(r.startedAt) }}</span>
                  @if (r.finishedAt) {
                    <span class="muted-sm">· {{ duration(r) }}</span>
                  }
                  @if (r.campaignCount !== null) {
                    <span class="muted-sm">· {{ r.campaignCount }} campaigns</span>
                  }
                  @if (r.insightCount !== null && r.insightCount > 0) {
                    <span class="muted-sm">· {{ r.insightCount }} day rows</span>
                  }
                </div>
                @if (r.error) {
                  <div class="err-msg" [title]="r.error">⚠ {{ r.error }}</div>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .hist { padding: .8rem 1rem; background: var(--ghost-bg); border-radius: .5rem; margin-top: .6rem; }
    .hist-head { display: flex; align-items: center; gap: .5rem; margin-bottom: .55rem; font-size: .85rem; color: var(--text); }
    .muted-sm { color: var(--text-muted); font-size: .75rem; }
    .err { color: #b91c1c; font-size: .75rem; }
    .runs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .3rem; max-height: 18rem; overflow-y: auto; }
    .run { display: flex; gap: .55rem; align-items: flex-start; padding: .35rem .5rem; border-radius: .35rem; font-size: .8rem; }
    .run:hover { background: var(--card-bg); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: .4rem; flex: 0 0 auto; }
    .run--ok .status-dot { background: #16a34a; }
    .run--fail .status-dot { background: #dc2626; }
    .run--pending .status-dot { background: #f59e0b; animation: pulse 1.5s infinite; }
    @keyframes pulse { 50% { opacity: .4; } }
    .meta { flex: 1; min-width: 0; }
    .line-1 { color: var(--text); }
    .when { font-weight: 500; }
    .err-msg { color: #b91c1c; font-size: .72rem; margin-top: .15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    :host-context(html.dark) .err-msg { color: #fca5a5; }
  `],
})
export class SyncHistoryComponent implements OnInit {
  private readonly api = inject(ConnectionsService);

  readonly connectionId = input.required<string>();
  readonly runs = signal<SyncHistoryRun[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.runs.set(await this.api.getSyncHistory(this.connectionId(), 50));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  format(iso: string): string {
    const d = new Date(iso);
    const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString();
  }

  duration(r: SyncHistoryRun): string {
    if (!r.finishedAt) return "—";
    const ms = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
