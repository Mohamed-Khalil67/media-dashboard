import { Metric, Operator } from "../alerts.service";

export interface CreateAlertRuleDto {
  metric: Metric;
  operator: Operator;
  threshold: number;
}

export interface UpdateAlertRuleDto {
  threshold?: number;
  enabled?: boolean;
  operator?: Operator;
}
