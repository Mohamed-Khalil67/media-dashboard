import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { EvaluatedAlert } from "../../../core/models/alerts.models";

@Component({
  selector: "app-alerts-panel",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      <header>
        <h3>Alerts @if (alerts().length > 0) { <span class="count">{{ alerts().length }}</span> }</h3>
        <a routerLink="/alerts" class="muted-link">Manage rules →</a>
      </header>
      @if (alerts().length === 0) {
        <div class="empty">
          <span class="empty-ico">✓</span>
          <p class="muted">No alerts. Everything looks healthy.</p>
        </div>
      } @else {
        <ul class="alerts-list">
          @for (a of alerts(); track a.ruleId + a.campaignId) {
            <li class="alert alert--{{ a.severity }}">
              <strong>{{ a.campaignName }}</strong>
              <span>{{ a.message }}</span>
              <small class="muted">{{ a.platform }}</small>
            </li>
          }
        </ul>
      }
    </article>
  `,
  styles: [`
    :host { display: block; min-height: 0; }
    .card {
      background: var(--card-bg, #fff); border: 1px solid var(--card-bd, #e2e8f0);
      border-radius: .75rem; padding: 1rem 1.25rem;
      display: flex; flex-direction: column;
      height: 100%; min-height: 0; box-sizing: border-box;
    }
    header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .65rem; flex-shrink: 0; }
    h3 { margin: 0; font-size: 1rem; color: var(--text, #0f172a); display: flex; align-items: center; gap: .4rem; }
    .count {
      background: var(--accent-soft, #eef2ff); color: var(--accent, #4f46e5);
      font-size: .7rem; font-weight: 600; padding: .1rem .45rem; border-radius: 999px;
    }
    .muted { color: var(--text-muted, #64748b); margin: 0; font-size: .9rem; }
    .muted-link { color: #4f46e5; font-size: .8rem; text-decoration: none; white-space: nowrap; }
    .muted-link:hover { text-decoration: underline; }

    .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5rem; }
    .empty-ico {
      width: 2.5rem; height: 2.5rem; border-radius: 50%;
      background: color-mix(in srgb, #16a34a 15%, transparent); color: #16a34a;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.2rem; font-weight: 700;
    }

    .alerts-list {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: .5rem;
      flex: 1 1 0; min-height: 0;
      overflow-y: auto;
      padding-right: .25rem;
      scrollbar-width: thin;
    }
    .alerts-list::-webkit-scrollbar { width: 6px; }
    .alerts-list::-webkit-scrollbar-thumb { background: var(--card-bd, #e2e8f0); border-radius: 3px; }
    .alerts-list::-webkit-scrollbar-thumb:hover { background: var(--text-muted, #94a3b8); }

    .alert {
      display: flex; flex-direction: column; gap: .15rem;
      padding: .55rem .8rem; border-radius: .4rem; font-size: .85rem;
      border-left: 3px solid;
      flex-shrink: 0;
    }
    .alert strong { color: #0f172a; }
    .alert span { color: #475569; }
    .alert small { color: #94a3b8; text-transform: capitalize; }
    .alert--danger  { background: #fef2f2; border-color: #dc2626; }
    .alert--warning { background: #fffbeb; border-color: #f59e0b; }
    .alert--info    { background: #eff6ff; border-color: #3b82f6; }
    :host-context(html.dark) .alert--danger  { background: #450a0a; }
    :host-context(html.dark) .alert--warning { background: #451a03; }
    :host-context(html.dark) .alert--info    { background: #172554; }
    :host-context(html.dark) .alert strong   { color: #f1f5f9; }
    :host-context(html.dark) .alert span     { color: #cbd5e1; }
  `],
})
export class AlertsPanelComponent {
  readonly alerts = input.required<EvaluatedAlert[]>();
}
