import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { NgApexchartsModule, ApexOptions } from "ng-apexcharts";
import { TimeseriesPoint } from "../../../core/models/metrics.models";
import { ThemeService } from "../../../core/theme.service";

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
          [theme]="options().theme!"
        />
      }
    </article>
  `,
  styles: [`
    .chart-card { background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .75rem; padding: 1rem 1.25rem; }
    header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .5rem; }
    h3 { margin: 0; font-size: 1rem; color: var(--text); }
    .muted { color: var(--muted); font-size: .8rem; margin: 0; }
    .empty { text-align: center; color: var(--text-muted); padding: 3rem 1rem; font-size: .9rem; }
  `],
})
export class RoasChartComponent {
  private readonly theme = inject(ThemeService);
  readonly points = input.required<TimeseriesPoint[]>();

  readonly options = computed<ApexOptions>(() => {
    const data = this.points();
    const dark = this.theme.dark();
    const axisColor = dark ? "#94a3b8" : "#64748b";
    const gridColor = dark ? "#334155" : "#e2e8f0";
    const bgColor = dark ? "transparent" : "transparent";

    return {
      series: [
        { name: "Spend",   data: data.map((p) => p.spend) },
        { name: "Revenue", data: data.map((p) => p.revenue) },
      ],
      chart: { type: "area", height: 280, toolbar: { show: false }, fontFamily: "inherit", background: bgColor },
      theme: { mode: dark ? "dark" : "light" },
      xaxis: { categories: data.map((p) => p.date.slice(5)), labels: { style: { colors: axisColor } } },
      yaxis: { labels: { formatter: (v: number) => `E£${v.toFixed(0)}`, style: { colors: axisColor } } },
      stroke: { curve: "smooth", width: 2 },
      colors: dark ? ["#64748b", "#a5b4fc"] : ["#94a3b8", "#4f46e5"],
      tooltip: { theme: dark ? "dark" : "light", y: { formatter: (v: number) => `E£${v.toFixed(2)}` } },
      legend: { position: "top", horizontalAlign: "right", labels: { colors: axisColor } },
      dataLabels: { enabled: false },
      grid: { borderColor: gridColor, strokeDashArray: 4 },
    };
  });
}
