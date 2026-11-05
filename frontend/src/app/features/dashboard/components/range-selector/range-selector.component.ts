import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { Range } from "../../../../core/models/metrics.models";
import { DropdownComponent } from "../../../../shared/dropdown/dropdown.component";

interface Preset {
  value: Range;
  label: string;
}

const PRESETS: ReadonlyArray<Preset> = [
  { value: "7d",  label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
];

/**
 * Shared date-range selector used by Facebook and Shopify dashboards. Controlled
 * component — the parent owns `range`, `customMode`, `customSince`, `customUntil`
 * and reacts to emitted events. Lifted out of the FB dashboard so both panels
 * present the same affordance (per [[feedback-dashboard-parity]]).
 */
@Component({
  selector: "app-range-selector",
  imports: [DropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./range-selector.component.html",
  styleUrl: "./range-selector.component.css",
})
export class RangeSelectorComponent {
  /** Currently selected preset (ignored if customMode is true). */
  readonly range = input<Range>("7d");
  /** True when the parent is currently using a custom date range. */
  readonly customMode = input<boolean>(false);
  /** ISO YYYY-MM-DD for the custom range start (controlled by parent). */
  readonly customSince = input<string>("");
  /** ISO YYYY-MM-DD for the custom range end (controlled by parent). */
  readonly customUntil = input<string>("");

  /** Fired when the user clicks one of the preset buttons. */
  readonly pickPreset = output<Range>();
  /** Fired when the user types into the start date input. */
  readonly updateCustomSince = output<string>();
  /** Fired when the user types into the end date input. */
  readonly updateCustomUntil = output<string>();
  /** Fired when the user clicks Apply on a valid custom range. */
  readonly applyCustom = output<{ since: string; until: string }>();

  readonly presets = PRESETS;

  readonly label = computed(() => {
    if (this.customMode()) {
      const since = this.customSince();
      const until = this.customUntil();
      if (since && until) return `${since} → ${until}`;
    }
    const p = PRESETS.find((x) => x.value === this.range());
    return p?.label ?? this.range();
  });

  /** Cross-field validity for the custom range. */
  readonly rangeInvalid = computed(() => {
    const since = this.customSince();
    const until = this.customUntil();
    if (!since || !until) return false;
    return since > until;
  });

  asValue(e: Event): string { return (e.target as HTMLInputElement).value; }
}
