import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TitleCasePipe } from "@angular/common";
import { AlertsService } from "../../core/alerts.service";
import { ToastService } from "../../core/toast.service";
import {
  AlertMetric,
  AlertOperator,
  AlertRule,
} from "../../core/models/alerts.models";

interface Draft {
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
}

@Component({
  selector: "app-alerts",
  imports: [FormsModule, TitleCasePipe],
  template: `
    <header class="page-head">
      <h1>Alert rules</h1>
      <p class="muted">Get flagged when a campaign drifts off plan. Rules evaluate against the last 7 days.</p>
    </header>

    <section class="card">
      <h3>Add a rule</h3>
      <form (ngSubmit)="add()" class="row">
        <label>
          <span>When</span>
          <select [(ngModel)]="draft.metric" name="metric">
            <option value="roas">ROAS</option>
            <option value="frequency">Frequency</option>
            <option value="ctr">CTR</option>
          </select>
        </label>
        <label>
          <span>is</span>
          <select [(ngModel)]="draft.operator" name="op">
            <option value="lt">below</option>
            <option value="gt">above</option>
          </select>
        </label>
        <label>
          <span>{{ draft.metric === "ctr" ? "(decimal, e.g. 0.005)" : "value" }}</span>
          <input type="number" step="0.01" [(ngModel)]="draft.threshold" name="threshold" required />
        </label>
        <button type="submit" [disabled]="busy()">Add rule</button>
      </form>
    </section>

    <section class="card">
      <h3>Your rules</h3>
      @if (rules().length === 0) {
        <p class="muted">No rules yet. Add one above.</p>
      } @else {
        <table>
          <thead>
            <tr><th>Metric</th><th>Operator</th><th>Threshold</th><th>Enabled</th><th></th></tr>
          </thead>
          <tbody>
            @for (r of rules(); track r.id) {
              <tr>
                <td>{{ r.metric | titlecase }}</td>
                <td>{{ r.operator === "lt" ? "below" : "above" }}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    [value]="r.threshold"
                    (change)="updateThreshold(r, asNum($event))"
                  />
                </td>
                <td>
                  <label class="switch">
                    <input
                      type="checkbox"
                      [checked]="r.enabled"
                      (change)="toggleEnabled(r, asCheck($event))"
                    />
                    <span>{{ r.enabled ? "On" : "Off" }}</span>
                  </label>
                </td>
                <td>
                  <button class="danger" (click)="remove(r)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [`
    .page-head h1 { margin: 0 0 .25rem; }
    .muted { color: #64748b; margin: 0 0 1.5rem; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    h3 { margin: 0 0 .75rem; font-size: 1rem; }
    .row { display: flex; gap: .75rem; align-items: end; flex-wrap: wrap; }
    label { display: flex; flex-direction: column; gap: .25rem; font-size: .85rem; color: #475569; }
    input, select {
      padding: .45rem .65rem; border: 1px solid #cbd5e1; border-radius: .375rem;
      font-size: .9rem;
    }
    button { background: #4f46e5; color: #fff; border: 0; padding: .5rem 1rem; border-radius: .375rem; cursor: pointer; font-weight: 500; }
    button:hover:not(:disabled) { background: #4338ca; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    button.danger { background: #fee2e2; color: #b91c1c; padding: .35rem .75rem; font-size: .8rem; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th { text-align: left; background: #f8fafc; color: #475569; font-weight: 500; padding: .5rem .75rem; }
    td { padding: .55rem .75rem; border-bottom: 1px solid #e2e8f0; }
    td input[type=number] { width: 6rem; }
    .switch { display: flex; align-items: center; gap: .5rem; cursor: pointer; }
  `],
})
export class AlertsComponent implements OnInit {
  private readonly api = inject(AlertsService);
  private readonly toast = inject(ToastService);

  readonly rules = signal<AlertRule[]>([]);
  readonly busy = signal(false);
  draft: Draft = { metric: "roas", operator: "lt", threshold: 2 };

  ngOnInit(): void {
    this.reload();
  }

  asNum(e: Event): number { return Number((e.target as HTMLInputElement).value); }
  asCheck(e: Event): boolean { return (e.target as HTMLInputElement).checked; }

  async reload(): Promise<void> {
    try {
      this.rules.set(await this.api.listRules());
    } catch {
      this.toast.error("Could not load rules");
    }
  }

  async add(): Promise<void> {
    if (Number.isNaN(this.draft.threshold)) return;
    this.busy.set(true);
    try {
      const rule = await this.api.createRule(this.draft.metric, this.draft.operator, this.draft.threshold);
      this.rules.update((list) => [...list, rule]);
      this.toast.success("Rule added");
    } catch {
      this.toast.error("Could not add rule");
    } finally {
      this.busy.set(false);
    }
  }

  async updateThreshold(rule: AlertRule, value: number): Promise<void> {
    if (Number.isNaN(value) || value === rule.threshold) return;
    try {
      const updated = await this.api.updateRule(rule.id, { threshold: value });
      this.rules.update((list) => list.map((r) => (r.id === rule.id ? updated : r)));
      this.toast.success("Updated");
    } catch {
      this.toast.error("Could not update");
    }
  }

  async toggleEnabled(rule: AlertRule, enabled: boolean): Promise<void> {
    try {
      const updated = await this.api.updateRule(rule.id, { enabled });
      this.rules.update((list) => list.map((r) => (r.id === rule.id ? updated : r)));
    } catch {
      this.toast.error("Could not toggle");
    }
  }

  async remove(rule: AlertRule): Promise<void> {
    if (!confirm(`Delete ${rule.metric} ${rule.operator} ${rule.threshold} rule?`)) return;
    try {
      await this.api.deleteRule(rule.id);
      this.rules.update((list) => list.filter((r) => r.id !== rule.id));
      this.toast.success("Deleted");
    } catch {
      this.toast.error("Could not delete");
    }
  }
}
