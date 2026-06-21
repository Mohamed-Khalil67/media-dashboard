import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, input, output, signal } from "@angular/core";

@Component({
  selector: "app-refresh-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lastUpdated()) {
      <span class="pill" [class.pill--refreshing]="refreshing()" [title]="lastUpdated()!.toISOString()">
        @if (refreshing()) {
          <span class="dot-anim" aria-hidden="true"></span> Refreshing…
        } @else {
          <span class="dot dot--ok" aria-hidden="true"></span> Updated {{ relTime() }}
        }
      </span>
    }

    @if (!refreshing() && nextRefreshIn() !== null) {
      <span class="next-pill" [title]="'Auto-refresh every 90 seconds'">
        ↻ {{ nextRefreshIn() }}s
      </span>
    }

    <button
      type="button"
      class="refresh-btn"
      [disabled]="refreshing()"
      (click)="refresh.emit()"
      title="Refresh (R)"
      aria-label="Refresh dashboard data">
      <span aria-hidden="true">↻</span>
      <span class="refresh-label">Refresh</span>
    </button>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: .5rem; }

    .pill {
      display: inline-flex; align-items: center; gap: .35rem;
      padding: .25rem .55rem; border-radius: 999px;
      background: var(--card-bg); border: 1px solid var(--card-bd);
      color: var(--text-muted); font-size: .78rem;
      font-variant-numeric: tabular-nums;
    }
    .pill--refreshing { color: var(--accent); border-color: var(--accent-soft); }

    .next-pill {
      display: inline-flex; align-items: center; gap: .25rem;
      padding: .2rem .5rem; border-radius: 999px;
      background: var(--accent-soft); color: var(--accent);
      font-size: .72rem; font-weight: 600; font-variant-numeric: tabular-nums;
      font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
      letter-spacing: -.01em;
    }

    .dot { width: .45rem; height: .45rem; border-radius: 50%; display: inline-block; }
    .dot--ok { background: var(--accent); }
    .dot-anim {
      width: .45rem; height: .45rem; border-radius: 50%;
      background: currentColor; display: inline-block;
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: .35; transform: scale(.85); }
      50% { opacity: 1; transform: scale(1.1); }
    }

    .refresh-btn {
      display: inline-flex; align-items: center; gap: .35rem;
      padding: .3rem .65rem; border-radius: .4rem;
      background: var(--card-bg); border: 1px solid var(--card-bd);
      color: var(--text); font-size: .8rem; cursor: pointer;
      font-family: var(--font-display, "Space Grotesk", system-ui, sans-serif);
    }
    .refresh-btn:hover:not(:disabled) { background: var(--ghost-bg); border-color: var(--accent); color: var(--accent); }
    .refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
    .refresh-label { line-height: 1; }
  `],
})
export class RefreshBarComponent implements OnInit, OnDestroy {
  readonly lastUpdated = input<Date | null>(null);
  readonly refreshing = input<boolean>(false);
  /** Seconds until the next auto-refresh fires. Null to hide the countdown. */
  readonly nextRefreshIn = input<number | null>(null);
  readonly refresh = output<void>();

  private readonly nowTick = signal(Date.now());
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  readonly relTime = computed(() => {
    const t = this.lastUpdated();
    if (!t) return "";
    const sec = Math.floor((this.nowTick() - t.getTime()) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  });

  ngOnInit(): void {
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 1_000);
  }

  ngOnDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }
}
