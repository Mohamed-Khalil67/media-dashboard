import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, input, output, signal } from "@angular/core";

@Component({
  selector: "app-refresh-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./refresh-bar.component.html",
  styleUrl: "./refresh-bar.component.css",
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
