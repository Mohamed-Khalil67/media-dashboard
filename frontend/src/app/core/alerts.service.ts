import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import {
  AlertMetric,
  AlertOperator,
  AlertRule,
  AlertsResponse,
  EvaluatedAlert,
  RulesResponse,
} from "./models/alerts.models";

@Injectable({ providedIn: "root" })
export class AlertsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  async list(): Promise<EvaluatedAlert[]> {
    const res = await firstValueFrom(this.http.get<AlertsResponse>(`${this.api}/alerts`));
    return res.alerts;
  }

  async listRules(): Promise<AlertRule[]> {
    const res = await firstValueFrom(this.http.get<RulesResponse>(`${this.api}/alerts/rules`));
    return res.rules;
  }

  async createRule(metric: AlertMetric, operator: AlertOperator, threshold: number): Promise<AlertRule> {
    const res = await firstValueFrom(
      this.http.post<{ rule: AlertRule }>(`${this.api}/alerts/rules`, { metric, operator, threshold })
    );
    return res.rule;
  }

  async updateRule(id: string, patch: Partial<Pick<AlertRule, "threshold" | "enabled" | "operator">>): Promise<AlertRule> {
    const res = await firstValueFrom(
      this.http.patch<{ rule: AlertRule }>(`${this.api}/alerts/rules/${id}`, patch)
    );
    return res.rule;
  }

  async deleteRule(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/alerts/rules/${id}`));
  }
}
