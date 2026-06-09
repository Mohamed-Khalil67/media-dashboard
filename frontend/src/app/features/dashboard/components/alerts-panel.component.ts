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
        <h3>Alerts</h3>
        <a routerLink="/alerts" class="muted-link">Manage rules →</a>
      </header>
      @if (alerts().length === 0) {
        <p class="muted">No alerts. Everything looks healthy.</p>
      } @else {
        <ul>
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
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1rem 1.25rem; }
    header { display: flex; align-items: baseline; justify-content: space-between; }
    h3 { margin: 0 0 .5rem; font-size: 1rem; }
    .muted { color: #64748b; margin: 0; font-size: .9rem; }
    .muted-link { color: #4f46e5; font-size: .8rem; text-decoration: none; }
    .muted-link:hover { text-decoration: underline; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
    .alert {
      display: flex; flex-direction: column; gap: .15rem;
      padding: .5rem .75rem; border-radius: .375rem; font-size: .85rem;
      border-left: 3px solid;
    }
    .alert strong { color: #0f172a; }
    .alert span { color: #475569; }
    .alert small { color: #94a3b8; text-transform: capitalize; }
    .alert--danger  { background: #fef2f2; border-color: #dc2626; }
    .alert--warning { background: #fffbeb; border-color: #f59e0b; }
    .alert--info    { background: #eff6ff; border-color: #3b82f6; }
  `],
})
export class AlertsPanelComponent {
  readonly alerts = input.required<EvaluatedAlert[]>();
}
