import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { DecimalPipe, PercentPipe } from "@angular/common";

/** Compute an SVG polyline path for a tiny sparkline in a 48×18 viewport. */
function sparklinePath(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 48, H = 16;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(2)}`;
  });
  return `M ${pts.join(" L ")}`;
}

@Component({
  selector: "app-kpi-card",
  imports: [DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./kpi-card.component.html",
  styleUrl: "./kpi-card.component.css",
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly format = input<string>("1.0-0");
  readonly prefix = input<string | null>(null);
  readonly suffix = input<string | null>(null);
  readonly delta = input<number | null>(null);
  readonly previous = input<number | null>(null);
  readonly subtext = input<string | null>(null);
  /** Daily series for the sparkline. Omit or pass [] to hide the spark. */
  readonly trend = input<number[]>([]);

  readonly sparkPath = computed(() => sparklinePath(this.trend()));

  readonly subline = computed<string | null>(() => {
    const prev = this.previous();
    if (prev !== null && prev !== undefined) {
      const formatted = this.formatNumber(prev);
      return `vs ${this.prefix() ?? ""}${formatted}${this.suffix() ?? ""} last period`;
    }
    const sub = this.subtext();
    return sub && sub.trim().length > 0 ? sub : null;
  });

  private formatNumber(n: number): string {
    const fmt = this.format() ?? "1.0-0";
    const m = /^(\d+)\.(\d+)-(\d+)$/.exec(fmt);
    const minFrac = m ? Number(m[2]) : 0;
    const maxFrac = m ? Number(m[3]) : 0;
    return n.toLocaleString(undefined, { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
  }
}
