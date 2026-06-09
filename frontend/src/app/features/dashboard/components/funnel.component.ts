import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { DecimalPipe, PercentPipe } from "@angular/common";
import { OverviewKpis } from "../../../core/models/metrics.models";

interface Step {
  label: string;
  value: number;
  conversion: number | null;
}

@Component({
  selector: "app-funnel",
  imports: [DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      <header><h3>Funnel</h3></header>
      <div class="steps">
        @for (s of steps(); track s.label) {
          <div class="step" [style.--w]="widthFor(s.value)">
            <div class="bar"><span>{{ s.label }}</span></div>
            <div class="meta">
              <strong>{{ s.value | number: "1.0-0" }}</strong>
              @if (s.conversion !== null) {
                <span class="conv">{{ s.conversion | percent: "1.1-1" }}</span>
              }
            </div>
          </div>
        }
      </div>
    </article>
  `,
  styles: [`
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1rem 1.25rem; }
    header h3 { margin: 0 0 .75rem; font-size: 1rem; }
    .steps { display: flex; flex-direction: column; gap: .65rem; }
    .step { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: center; }
    .bar {
      position: relative; height: 2rem; background: #eef2ff; border-radius: .375rem; overflow: hidden;
    }
    .bar::before {
      content: ""; position: absolute; inset: 0; width: var(--w, 0%);
      background: linear-gradient(90deg, #818cf8, #4f46e5);
      transition: width .4s ease;
    }
    .bar span { position: relative; z-index: 1; padding: 0 .75rem; line-height: 2rem; color: #fff; font-size: .85rem; font-weight: 500; }
    .meta { text-align: right; font-size: .85rem; }
    .meta strong { display: block; color: #0f172a; }
    .conv { color: #64748b; font-size: .75rem; }
  `],
})
export class FunnelComponent {
  readonly kpis = input.required<OverviewKpis | null>();

  readonly steps = computed<Step[]>(() => {
    const k = this.kpis();
    if (!k) return [];
    const { impressions, clicks, orders } = k;
    return [
      { label: "Impressions", value: impressions, conversion: null },
      { label: "Clicks",      value: clicks,      conversion: impressions > 0 ? clicks / impressions : null },
      { label: "Purchases",   value: orders,      conversion: clicks > 0 ? orders / clicks : null },
    ];
  });

  widthFor(value: number): string {
    const top = this.steps()[0]?.value ?? 0;
    if (top === 0) return "0%";
    return `${Math.min(100, (value / top) * 100)}%`;
  }
}
