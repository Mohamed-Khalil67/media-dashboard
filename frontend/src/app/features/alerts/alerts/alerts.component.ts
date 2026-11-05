import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TitleCasePipe } from "@angular/common";
import { AlertsService } from "../../../core/alerts.service";
import { StatusBarService } from "../../../core/status-bar.service";
import {
  AlertMetric,
  AlertOperator,
  AlertRule,
} from "../../../core/models/alerts.models";

interface Draft {
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
}

@Component({
  selector: "app-alerts",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TitleCasePipe],
  templateUrl: "./alerts.component.html",
  styleUrl: "./alerts.component.css",
})
export class AlertsComponent implements OnInit {
  private readonly api = inject(AlertsService);
  private readonly status = inject(StatusBarService);

  readonly rules = signal<AlertRule[]>([]);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);
  draft: Draft = { metric: "roas", operator: "lt", threshold: 2 };

  ngOnInit(): void {
    this.reload();
  }

  asNum(e: Event): number { return Number((e.target as HTMLInputElement).value); }
  asCheck(e: Event): boolean { return (e.target as HTMLInputElement).checked; }

  async reload(): Promise<void> {
    this.loadError.set(null);
    try {
      this.rules.set(await this.api.listRules());
    } catch {
      this.loadError.set("Could not load rules");
    }
  }

  async add(): Promise<void> {
    if (Number.isNaN(this.draft.threshold)) return;
    this.busy.set(true);
    try {
      const rule = await this.api.createRule(this.draft.metric, this.draft.operator, this.draft.threshold);
      this.rules.update((list) => [...list, rule]);
      this.status.success("Rule added");
    } catch {
      this.status.error("Could not add rule");
    } finally {
      this.busy.set(false);
    }
  }

  async updateThreshold(rule: AlertRule, value: number): Promise<void> {
    if (Number.isNaN(value) || value === rule.threshold) return;
    try {
      const updated = await this.api.updateRule(rule.id, { threshold: value });
      this.rules.update((list) => list.map((r) => (r.id === rule.id ? updated : r)));
      this.status.success("Updated");
    } catch {
      this.status.error("Could not update");
    }
  }

  async toggleEnabled(rule: AlertRule, enabled: boolean): Promise<void> {
    try {
      const updated = await this.api.updateRule(rule.id, { enabled });
      this.rules.update((list) => list.map((r) => (r.id === rule.id ? updated : r)));
    } catch {
      this.status.error("Could not toggle");
    }
  }

  async remove(rule: AlertRule): Promise<void> {
    if (!confirm(`Delete ${rule.metric} ${rule.operator} ${rule.threshold} rule?`)) return;
    try {
      await this.api.deleteRule(rule.id);
      this.rules.update((list) => list.filter((r) => r.id !== rule.id));
      this.status.success("Deleted");
    } catch {
      this.status.error("Could not delete");
    }
  }
}
