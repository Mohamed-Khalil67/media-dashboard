import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { DecimalPipe, PercentPipe } from "@angular/common";

@Component({
  selector: "app-kpi-card",
  imports: [DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="kpi">
      <header>{{ label() }}</header>
      <div class="value">
        @if (prefix()) {<span class="prefix">{{ prefix() }}</span>}
        {{ value() | number: format() }}
        @if (suffix()) {<span class="suffix">{{ suffix() }}</span>}
      </div>
      @if (delta() !== undefined && delta() !== null) {
        <div class="delta" [class.delta--up]="(delta() ?? 0) > 0" [class.delta--down]="(delta() ?? 0) < 0">
          {{ (delta() ?? 0) > 0 ? "▲" : (delta() ?? 0) < 0 ? "▼" : "" }}
          {{ delta() ?? 0 | percent: "1.0-1" }}
          <span class="delta-note">vs previous period</span>
        </div>
      }
    </article>
  `,
  styles: [`
    .kpi {
      background: #fff; border: 1px solid #e2e8f0; border-radius: .75rem;
      padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .25rem;
    }
    header { color: #64748b; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-size: 1.75rem; font-weight: 600; color: #0f172a; }
    .prefix, .suffix { color: #94a3b8; font-weight: 400; font-size: 1.1rem; }
    .delta { font-size: .8rem; color: #64748b; display: flex; align-items: center; gap: .35rem; }
    .delta--up   { color: #16a34a; }
    .delta--down { color: #dc2626; }
    .delta-note { color: #94a3b8; }
  `],
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly format = input<string>("1.0-0");
  readonly prefix = input<string | null>(null);
  readonly suffix = input<string | null>(null);
  readonly delta = input<number | null>(null);
}
