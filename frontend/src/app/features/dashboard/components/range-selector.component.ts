import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { Range } from "../../../core/models/metrics.models";
import { DropdownComponent } from "../../../shared/dropdown.component";

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
  template: `
    <app-dropdown #dateDD>
      <span trigger>
        <span class="ico" aria-hidden="true">📅</span>
        <span class="lbl">{{ label() }}</span>
      </span>
      <div menu class="date-menu" role="menu" aria-label="Date range">
        <div class="presets">
          @for (p of presets; track p.value) {
            <button
              type="button"
              class="preset"
              [class.active]="!customMode() && range() === p.value"
              (click)="pickPreset.emit(p.value); dateDD.close()">{{ p.label }}</button>
          }
        </div>
        <div class="custom-zone">
          <p class="muted">Custom range</p>
          <div class="dates">
            <input type="date"
              [value]="customSince()"
              (change)="updateCustomSince.emit(asValue($event))"
              aria-label="Start date" />
            <span aria-hidden="true">→</span>
            <input type="date"
              [value]="customUntil()"
              (change)="updateCustomUntil.emit(asValue($event))"
              aria-label="End date" />
          </div>
          @if (rangeInvalid()) {
            <p class="range-error" role="alert">End date must be on or after start date.</p>
          }
          <button
            type="button"
            class="apply"
            [disabled]="rangeInvalid() || !customSince() || !customUntil()"
            (click)="applyCustom.emit({ since: customSince(), until: customUntil() }); dateDD.close()">Apply</button>
        </div>
      </div>
    </app-dropdown>
  `,
  styles: [`
    :host { display: inline-block; }

    .ico { font-size: 1rem; }
    .lbl { font-weight: 500; }

    .date-menu { padding: .35rem; min-width: 13rem; }
    .presets { display: flex; flex-direction: column; gap: .1rem; padding: .15rem; }
    .preset {
      text-align: left; background: transparent; border: 0;
      padding: .45rem .55rem; border-radius: .375rem; cursor: pointer;
      color: var(--text); font-size: .85rem;
    }
    .preset:hover { background: var(--ghost-bg); }
    .preset.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }

    .custom-zone {
      border-top: 1px solid var(--card-bd); padding: .65rem .55rem .55rem;
      margin-top: .15rem;
    }
    .custom-zone p.muted {
      font-size: .75rem; margin: 0 0 .35rem; text-transform: uppercase;
      letter-spacing: .04em; color: var(--text-muted);
    }
    .dates { display: flex; align-items: center; gap: .35rem; margin-bottom: .5rem; }
    .dates input {
      flex: 1; border: 1px solid var(--input-bd); border-radius: .375rem;
      padding: .35rem .5rem; background: var(--card-bg); color: var(--text);
      font-size: .85rem; outline: none;
    }
    .dates span { color: var(--muted); }
    .range-error { color: #dc2626; font-size: .72rem; margin: 0 0 .5rem; }
    .apply {
      width: 100%; background: #4f46e5; color: #fff; border: 0;
      padding: .45rem; border-radius: .375rem; cursor: pointer;
      font-size: .85rem; font-weight: 500;
    }
    .apply:hover:not(:disabled) { background: #4338ca; }
    .apply:disabled { background: #94a3b8; cursor: not-allowed; }
  `],
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
