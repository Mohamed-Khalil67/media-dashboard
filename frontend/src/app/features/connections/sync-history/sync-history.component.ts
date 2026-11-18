import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from "@angular/core";
import { ConnectionsService, SyncHistoryRun } from "../../../core/connections.service";

@Component({
  selector: "app-sync-history",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: "./sync-history.component.html",
  styleUrl: "./sync-history.component.css",
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
