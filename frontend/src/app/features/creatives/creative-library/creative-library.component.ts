import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { CreativeRange, Verdict, type CreativeRow, type Stage } from "@contracts/creatives.contract";
import { CreativesApi } from "../../../core/creatives.api";
import { VerdictBadgeComponent } from "../verdict-badge/verdict-badge.component";
import { FORMAT_LABELS, OBJECTIVE_LABELS, VERDICT_ORDER, compact, duration, money, num, pct } from "../creative-format";

interface AccountOption {
  id: string;
  name: string;
}

/**
 * Creative library: every ad that delivered in the range, with its verdict.
 * Filters live in query params (bound as inputs) so views survive a refresh
 * and can be shared. Read-only: nothing on this page changes anything in Meta.
 */
@Component({
  selector: "app-creative-library",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VerdictBadgeComponent],
  templateUrl: "./creative-library.component.html",
  styleUrl: "./creative-library.component.css",
})
export class CreativeLibraryComponent {
  private readonly api = inject(CreativesApi);
  private readonly router = inject(Router);

  // Query params, bound by withComponentInputBinding().
  readonly range = input<string>();
  readonly verdict = input<string>();
  readonly account = input<string>();
  readonly q = input<string>();

  readonly selectedRange = computed<CreativeRange>(() => CreativeRange.safeParse(this.range()).data ?? "7d");
  readonly selectedVerdict = computed<Verdict | null>(() => Verdict.safeParse(this.verdict()).data ?? null);
  readonly selectedAccount = computed(() => this.account() || null);
  readonly search = computed(() => (this.q() ?? "").trim().toLowerCase());

  readonly creatives = this.api.list(() => ({ range: this.selectedRange(), connectionId: this.selectedAccount() }));

  readonly response = computed(() => (this.creatives.hasValue() ? this.creatives.value() : null));
  readonly summary = computed(() => this.response()?.summary ?? null);

  readonly rows = computed<CreativeRow[]>(() => {
    const data = this.response();
    if (!data) return [];
    const v = this.selectedVerdict();
    const q = this.search();
    return data.rows.filter(
      (r) => (!v || r.verdict === v) && (!q || [r.name, r.campaignName, r.adSetName, r.accountName].some((s) => s.toLowerCase().includes(q))),
    );
  });

  readonly accounts = computed<AccountOption[]>(() => {
    const seen = new Map<string, string>();
    for (const r of this.response()?.rows ?? []) seen.set(r.connectionId, r.accountName);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly verdictOrder = VERDICT_ORDER;
  readonly ranges: readonly CreativeRange[] = ["7d", "14d", "30d"];
  readonly rangeLabels: Record<CreativeRange, string> = { "7d": "Last 7 days", "14d": "Last 14 days", "30d": "Last 30 days" };
  readonly formatLabels = FORMAT_LABELS;
  readonly objectiveLabels = OBJECTIVE_LABELS;
  readonly pct = pct;
  readonly num = num;
  readonly money = money;
  readonly compact = compact;
  readonly duration = duration;

  setParam(key: "range" | "verdict" | "account" | "q", value: string | null): void {
    void this.router.navigate([], {
      queryParams: { [key]: value || null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  toggleVerdict(v: Verdict): void {
    this.setParam("verdict", this.selectedVerdict() === v ? null : v);
  }

  value(e: Event): string {
    return e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement ? e.target.value : "";
  }

  /** Red when the engine flagged that stage for this ad (against the account baseline). */
  tone(row: CreativeRow, stage: Stage): string {
    return row.weakStages.includes(stage) ? "lo" : "";
  }
}
