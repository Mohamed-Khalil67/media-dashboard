import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import type { Verdict } from "@contracts/creatives.contract";
import { VERDICTS } from "../creative-format";

/** Verdict pill: colour + icon + text, so it never relies on colour alone. */
@Component({
  selector: "app-verdict-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill v-' + verdict()" [title]="meta().hint">
    <span aria-hidden="true">{{ meta().icon }}</span>{{ meta().label }}@if (count() !== null) {<span class="count"> · {{ count() }}</span>}
  </span>`,
  styles: `
    .pill { display: inline-flex; align-items: center; gap: .3rem; border-radius: 999px; padding: .2rem .65rem; font-size: .75rem; font-weight: 500; white-space: nowrap; line-height: 1.4; }
    .count { font-family: var(--font-mono); font-weight: 400; }
    .v-scale { background: var(--success-soft); color: var(--success-strong); }
    .v-keep { background: var(--ghost-bg); color: var(--text-muted); }
    .v-iterate { background: var(--warning-soft); color: var(--warning-strong); }
    .v-kill { background: var(--danger-soft); color: var(--danger-strong); }
    .v-fix_delivery { background: var(--info-soft); color: var(--info-strong); }
    .v-wait { background: var(--ghost-bg); color: var(--muted); }
  `,
})
export class VerdictBadgeComponent {
  readonly verdict = input.required<Verdict>();
  readonly count = input<number | null>(null);
  readonly meta = computed(() => VERDICTS[this.verdict()]);
}
