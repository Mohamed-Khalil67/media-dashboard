import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { DecimalPipe, PercentPipe } from "@angular/common";
import { OverviewKpis } from "../../../../core/models/metrics.models";

interface Step {
  label: string;
  value: number;
  conversion: number | null;
}

@Component({
  selector: "app-funnel",
  imports: [DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./funnel.component.html",
  styleUrl: "./funnel.component.css",
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
