import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { CreativeRange, type FunnelStep, type RetentionPoint } from "@contracts/creatives.contract";
import { CreativesApi } from "../../../core/creatives.api";
import { VerdictBadgeComponent } from "../verdict-badge/verdict-badge.component";
import {
  FORMAT_LABELS,
  OBJECTIVE_LABELS,
  STAGE_LABELS,
  compact,
  duration,
  money,
  num,
  pct,
  placementLabel,
  rankingView,
} from "../creative-format";

const CHART = { w: 640, h: 200, left: 40, right: 10, top: 12, bottom: 28 } as const;

interface ChartGeometry {
  line: string;
  baseline: string | null;
  drop: { x: number; width: number; labelX: number; label: string } | null;
  xTicks: { x: number; label: string }[];
  markers: { x: number; y: number }[];
}

/**
 * Diagnosis for one ad: verdict, where viewers leave, retention, rankings,
 * placements and findings. Read-only — there are no actions that change
 * anything in Meta on this page.
 */
@Component({
  selector: "app-creative-diagnosis",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VerdictBadgeComponent],
  templateUrl: "./creative-diagnosis.component.html",
  styleUrl: "./creative-diagnosis.component.css",
})
export class CreativeDiagnosisComponent {
  private readonly api = inject(CreativesApi);
  private readonly router = inject(Router);

  /** Route param `:id`. */
  readonly id = input.required<string>();
  /** Query param `range`. */
  readonly range = input<string>();

  readonly selectedRange = computed<CreativeRange>(() => CreativeRange.safeParse(this.range()).data ?? "7d");
  readonly detail = this.api.detail(() => ({ id: this.id(), range: this.selectedRange() }));
  readonly d = computed(() => (this.detail.hasValue() ? this.detail.value() : null));

  readonly ranges: readonly CreativeRange[] = ["7d", "14d", "30d"];
  readonly rangeLabels: Record<CreativeRange, string> = { "7d": "Last 7 days", "14d": "Last 14 days", "30d": "Last 30 days" };
  readonly chart = CHART;
  readonly Math = Math;
  readonly stageLabels = STAGE_LABELS;
  readonly objectiveLabels = OBJECTIVE_LABELS;
  readonly formatLabels = FORMAT_LABELS;
  readonly pct = pct;
  readonly num = num;
  readonly money = money;
  readonly compact = compact;
  readonly duration = duration;
  readonly placementLabel = placementLabel;
  readonly rankingView = rankingView;

  readonly rankings = computed(() => {
    const r = this.d()?.rankings;
    if (!r) return [];
    return [
      { name: "Quality", view: rankingView(r.quality) },
      { name: "Engagement", view: rankingView(r.engagement) },
      { name: "Conversion", view: rankingView(r.conversion) },
    ];
  });

  /** Largest step value, for the leak bars under each funnel step. */
  barWidth(step: FunnelStep): number {
    if (step.value === null) return 0;
    if (step.kind === "rate") return Math.max(2, Math.min(100, step.value * 100));
    const imp = this.d()?.totals.impressions ?? 0;
    return step.key === "impressions" ? 100 : imp > 0 ? Math.max(2, Math.min(100, (step.value / imp) * 1000)) : 0;
  }

  stepValue(step: FunnelStep): string {
    if (step.value === null) return "—";
    return step.kind === "rate" ? pct(step.value, step.key === "click" ? 1 : 0) : compact(step.value);
  }

  stepCompare(step: FunnelStep): string | null {
    if (step.value === null || step.baseline === null || step.kind !== "rate") return null;
    const arrow = step.status === "weak" ? "▼" : step.status === "good" ? "▲" : "≈";
    const source = step.baselineSource === "account" ? "account median" : "typical";
    return `${arrow} vs ${pct(step.baseline, step.key === "click" ? 1 : 0)} ${source}`;
  }

  readonly geometry = computed<ChartGeometry | null>(() => {
    const data = this.d();
    const pts = data?.retention.points ?? [];
    if (!data || pts.length < 2) return null;
    const base = data.retention.baseline ?? [];
    const maxSecond = Math.max(...pts.map((p) => p.second), ...base.map((p) => p.second), 1);
    const x = (s: number) => CHART.left + (s / maxSecond) * (CHART.w - CHART.left - CHART.right);
    const y = (share: number) => CHART.top + (1 - share) * (CHART.h - CHART.top - CHART.bottom);
    const path = (list: readonly RetentionPoint[]) => list.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.second).toFixed(1)},${y(p.share).toFixed(1)}`).join(" ");

    const drop = data.retention.biggestDrop;
    const ticks = [0, 3, 15, maxSecond].filter((s, i, arr) => s <= maxSecond && arr.indexOf(s) === i);
    return {
      line: path(pts),
      baseline: base.length > 1 ? path(base) : null,
      drop: drop
        ? {
            x: x(drop.fromSecond),
            width: Math.max(4, x(drop.toSecond) - x(drop.fromSecond)),
            labelX: Math.min(x(drop.toSecond) + 6, CHART.w - 170),
            label: `−${Math.round(drop.loss * 100)} pts between ${duration(drop.fromSecond)} and ${duration(drop.toSecond)}`,
          }
        : null,
      xTicks: ticks.map((s) => ({ x: x(s), label: s === 3 ? "3s hook" : s === 15 ? "15s ThruPlay" : `${s}s` })),
      markers: drop ? [{ x: x(drop.fromSecond), y: y(drop.fromShare) }, { x: x(drop.toSecond), y: y(drop.toShare) }] : [],
    };
  });

  /** Daily hook rate (video) or CTR as a small trend line. */
  readonly trend = computed(() => {
    const data = this.d();
    if (!data || data.daily.length < 2) return null;
    const isVideo = data.row.format === "VIDEO";
    const values = data.daily.map((p) => (isVideo ? p.hookRate : p.ctr) ?? 0);
    const max = Math.max(...values, 0.0001);
    const w = 300;
    const h = 60;
    const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join(" ");
    return { label: isVideo ? "Hook rate per day" : "Link CTR per day", points, w, h, first: data.daily[0]?.date ?? "", last: data.daily.at(-1)?.date ?? "" };
  });

  setRange(value: string): void {
    void this.router.navigate([], { queryParams: { range: value }, queryParamsHandling: "merge", replaceUrl: true });
  }

  value(e: Event): string {
    return e.target instanceof HTMLSelectElement ? e.target.value : "";
  }
}
