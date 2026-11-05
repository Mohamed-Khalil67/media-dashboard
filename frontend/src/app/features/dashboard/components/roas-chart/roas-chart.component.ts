import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { NgApexchartsModule, ApexOptions } from "ng-apexcharts";
import { TimeseriesPoint } from "../../../../core/models/metrics.models";
import { ThemeService } from "../../../../core/theme.service";

@Component({
  selector: "app-roas-chart",
  imports: [NgApexchartsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./roas-chart.component.html",
  styleUrl: "./roas-chart.component.css",
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
      chart: { type: "area", height: "100%", toolbar: { show: false }, fontFamily: "inherit", background: bgColor },
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
