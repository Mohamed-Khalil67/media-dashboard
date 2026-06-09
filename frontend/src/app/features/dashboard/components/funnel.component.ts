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
            <div class="row-top">
              <span class="label">{{ s.label }}</span>
              <span class="meta">
                <strong>{{ s.value | number: "1.0-0" }}</strong>
                @if (s.conversion !== null) {
                  <span class="conv">{{ s.conversion | percent: "1.1-1" }}</span>
                }
              </span>
            </div>
            <div class="bar"></div>
          </div>
        }
      </div>
    </article>
  `,
  styles: [`
    .card { background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e2e8f0); border-radius: .75rem; padding: 1rem 1.25rem; }
    header h3 { margin: 0 0 .75rem; font-size: 1rem; color: var(--text, #0f172a); }
    .steps { display: flex; flex-direction: column; gap: 1rem; }
    .step { display: flex; flex-direction: column; gap: .35rem; }
    .row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    .label { font-size: .85rem; font-weight: 500; color: var(--text, #0f172a); }
    .meta { display: flex; align-items: baseline; gap: .5rem; }
    .meta strong { color: var(--text, #0f172a); font-size: .95rem; font-variant-numeric: tabular-nums; }
    .conv { color: var(--text-muted, #64748b); font-size: .75rem; }
    .bar {
      position: relative; height: .85rem;
      background: var(--ghost-bg, #eef2ff); border-radius: 999px; overflow: hidden;
    }
    .bar::before {
      content: ""; position: absolute; inset: 0; width: var(--w, 0%);
      background: linear-gradient(90deg, #818cf8, #4f46e5);
      transition: width .4s ease;
      border-radius: 999px;
    }
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
