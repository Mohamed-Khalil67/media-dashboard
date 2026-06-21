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
  template: `
    <article class="kpi">
      <header class="head">
        <span class="label">{{ label() }}</span>
        @if (delta() !== undefined && delta() !== null) {
          <span class="pill" [class.pill--up]="(delta() ?? 0) > 0" [class.pill--down]="(delta() ?? 0) < 0">
            <span class="arrow">{{ (delta() ?? 0) > 0 ? "▲" : (delta() ?? 0) < 0 ? "▼" : "•" }}</span>
            {{ delta() ?? 0 | percent: "1.0-1" }}
          </span>
        }
      </header>

      <div class="value-row">
        <div class="value">
          @if (prefix()) {<span class="prefix">{{ prefix() }}</span>}
          {{ value() | number: format() }}
          @if (suffix()) {<span class="suffix">{{ suffix() }}</span>}
        </div>

        @if (sparkPath()) {
          <svg class="spark" viewBox="0 0 48 18" aria-hidden="true" preserveAspectRatio="none">
            <path [attr.d]="sparkPath()" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        }
      </div>

      @if (subline(); as s) {
        <div class="sub">{{ s }}</div>
      }
    </article>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .kpi {
      background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e5e7eb); border-radius: .75rem;
      padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .35rem;
      min-height: 7.5rem; height: 100%;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .label {
      color: var(--text-muted, #4b5563); font-size: .7rem;
      text-transform: uppercase; letter-spacing: .07em; font-weight: 600;
      font-family: var(--font-display, "Space Grotesk", system-ui, sans-serif);
    }

    .pill {
      display: inline-flex; align-items: center; gap: .2rem;
      padding: .15rem .5rem; border-radius: 999px;
      font-size: .7rem; font-weight: 600; font-variant-numeric: tabular-nums;
      background: var(--ghost-bg, #f3f3f0); color: var(--text-muted, #4b5563);
      white-space: nowrap;
    }
    .pill .arrow { font-size: .65rem; line-height: 1; }
    .pill--up   { background: var(--success-soft); color: var(--success-strong); }
    .pill--down { background: var(--danger-soft); color: var(--danger-strong); }

    .value-row { display: flex; align-items: flex-end; justify-content: space-between; gap: .5rem; }

    .value {
      font-size: 1.7rem; font-weight: 500; color: var(--text, #0d1117); line-height: 1.1;
      font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
      font-variant-numeric: tabular-nums;
    }
    .prefix, .suffix { color: var(--muted, #9ca3af); font-weight: 400; font-size: 1rem; }

    .spark {
      width: 48px; height: 18px; flex-shrink: 0;
      color: var(--accent); opacity: .75;
      margin-bottom: .1rem;
    }

    .sub {
      color: var(--text-muted, #4b5563); font-size: .75rem; line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
  `],
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
