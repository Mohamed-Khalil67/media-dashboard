import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, input, output, signal } from "@angular/core";

/**
 * Shared dashboard chrome: a "Last updated Xs ago" pill plus a manual refresh button.
 *
 * Used by both the Facebook and Shopify dashboards so the freshness affordance is
 * visually identical across panels (per [[feedback-dashboard-parity]]).
 *
 * The component owns its own 10s ticker to keep the relative-time string fresh
 * without bothering the parent; the parent only owns the `lastUpdated` signal
 * (when it set it = when its latest fetch resolved) and the `refreshing` flag.
 */
@Component({
  selector: "app-refresh-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lastUpdated()) {
      <span class="pill" [class.pill--refreshing]="refreshing()" [title]="lastUpdated()!.toISOString()">
        @if (refreshing()) {
          <span class="dot-anim" aria-hidden="true"></span> Refreshing…
        } @else {
          <span class="dot dot--ok" aria-hidden="true"></span> Last updated {{ relTime() }}
        }
      </span>
    }
    <button
      type="button"
      class="refresh-btn"
      [disabled]="refreshing()"
      (click)="refresh.emit()"
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
    .pill--refreshing { color: var(--accent); }

    .dot { width: .45rem; height: .45rem; border-radius: 50%; display: inline-block; }
    .dot--ok { background: #16a34a; }
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
    }
    .refresh-btn:hover:not(:disabled) { background: var(--ghost-bg); }
    .refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
    .refresh-label { line-height: 1; }
  `],
})
export class RefreshBarComponent implements OnInit, OnDestroy {
  /** When the most recent fetch resolved. Null until the first fetch completes. */
  readonly lastUpdated = input<Date | null>(null);
  /** True while a fetch is in flight — disables the button and animates the pill. */
  readonly refreshing = input<boolean>(false);
  /** Emitted when the user clicks the manual refresh button. */
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
    // Tick once every 10s so the relative-time string stays current without
    // re-fetching any data. Cheap; doesn't touch the network.
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 10_000);
  }

  ngOnDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }
}
