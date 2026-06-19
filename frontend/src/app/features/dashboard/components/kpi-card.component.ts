import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { DecimalPipe, PercentPipe } from "@angular/common";

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

      <div class="value">
        @if (prefix()) {<span class="prefix">{{ prefix() }}</span>}
        {{ value() | number: format() }}
        @if (suffix()) {<span class="suffix">{{ suffix() }}</span>}
      </div>

      @if (subline(); as s) {
        <div class="sub">{{ s }}</div>
      }
    </article>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .kpi {
      background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e2e8f0); border-radius: .75rem;
      padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .35rem;
      min-height: 7.5rem; height: 100%;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .label { color: var(--text-muted, #64748b); font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }

    .pill {
      display: inline-flex; align-items: center; gap: .2rem;
      padding: .15rem .5rem; border-radius: 999px;
      font-size: .7rem; font-weight: 600; font-variant-numeric: tabular-nums;
      background: var(--ghost-bg, #f1f5f9); color: var(--text-muted, #64748b);
      white-space: nowrap;
    }
    .pill .arrow { font-size: .65rem; line-height: 1; }
    .pill--up   { background: var(--success-soft); color: var(--success-strong); }
    .pill--down { background: var(--danger-soft); color: var(--danger-strong); }

    .value { font-size: 1.7rem; font-weight: 600; color: var(--text, #0f172a); line-height: 1.1; font-variant-numeric: tabular-nums; }
    .prefix, .suffix { color: var(--muted, #94a3b8); font-weight: 400; font-size: 1.05rem; }

    .sub {
      color: var(--text-muted, #64748b); font-size: .76rem; line-height: 1.3;
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
  /**
   * Free-form context line below the value (e.g. "across 1,240 orders"). When
   * `previous` is set, the auto "vs <prev> last period" subline takes priority
   * so we always show the comparison the user expects with a delta pill.
   */
  readonly subtext = input<string | null>(null);

  /** Resolved subline: previous-period comparison wins; otherwise the caller's free text. */
  readonly subline = computed<string | null>(() => {
    const prev = this.previous();
    if (prev !== null && prev !== undefined) {
      const formatted = this.formatNumber(prev);
      return `vs ${this.prefix() ?? ""}${formatted}${this.suffix() ?? ""} last period`;
    }
    const sub = this.subtext();
    return sub && sub.trim().length > 0 ? sub : null;
  });

  /** Mirror Angular's DecimalPipe formatting for the previous-period number. */
  private formatNumber(n: number): string {
    const fmt = this.format() ?? "1.0-0";
    const m = /^(\d+)\.(\d+)-(\d+)$/.exec(fmt);
    const minFrac = m ? Number(m[2]) : 0;
    const maxFrac = m ? Number(m[3]) : 0;
    return n.toLocaleString(undefined, { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
  }
}
