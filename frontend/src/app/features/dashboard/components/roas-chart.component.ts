import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { NgApexchartsModule, ApexOptions } from "ng-apexcharts";
import { TimeseriesPoint } from "../../../core/models/metrics.models";

@Component({
  selector: "app-roas-chart",
  imports: [NgApexchartsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="chart-card">
      <header>
        <h3>Spend vs Revenue</h3>
        <p class="muted">{{ points().length }} day window</p>
      </header>
      @if (points().length === 0) {
        <div class="empty">No data yet — connect a platform and sync.</div>
      } @else {
        <apx-chart
          [series]="options().series!"
          [chart]="options().chart!"
          [xaxis]="options().xaxis!"
          [yaxis]="options().yaxis!"
          [stroke]="options().stroke!"
          [colors]="options().colors!"
          [tooltip]="options().tooltip!"
          [legend]="options().legend!"
          [dataLabels]="options().dataLabels!"
          [grid]="options().grid!"
        />
      }
    </article>
  `,
  styles: [`
    .chart-card {
      background: #fff; border: 1px solid #e2e8f0; border-radius: .75rem;
      padding: 1rem 1.25rem;
    }
    header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .5rem; }
    h3 { margin: 0; font-size: 1rem; }
    .muted { color: #94a3b8; font-size: .8rem; margin: 0; }
    .empty {
      text-align: center; color: #64748b; padding: 3rem 1rem; font-size: .9rem;
    }
  `],
})
export class RoasChartComponent {
  readonly points = input.required<TimeseriesPoint[]>();

  readonly options = computed<ApexOptions>(() => {
    const data = this.points();
    return {
      series: [
        { name: "Spend",   data: data.map((p) => p.spend) },
        { name: "Revenue", data: data.map((p) => p.revenue) },
      ],
      chart: { type: "area", height: 280, toolbar: { show: false }, fontFamily: "inherit" },
      xaxis: { categories: data.map((p) => p.date.slice(5)), labels: { style: { colors: "#64748b" } } },
      yaxis: { labels: { formatter: (v: number) => `$${v.toFixed(0)}`, style: { colors: "#64748b" } } },
      stroke: { curve: "smooth", width: 2 },
      colors: ["#94a3b8", "#4f46e5"],
      tooltip: { y: { formatter: (v: number) => `$${v.toFixed(2)}` } },
      legend: { position: "top", horizontalAlign: "right" },
      dataLabels: { enabled: false },
      grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
    };
  });
}
