export type AlertMetric = "roas" | "frequency" | "ctr";
export type AlertOperator = "lt" | "gt";
export type AlertSeverity = "danger" | "warning" | "info";

export interface AlertRule {
  id: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  enabled: boolean;
}

export interface EvaluatedAlert {
  campaignId: string;
  campaignName: string;
  platform: string;
  ruleId: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  observed: number;
  severity: AlertSeverity;
  message: string;
}

export interface AlertsResponse { alerts: EvaluatedAlert[]; }
export interface RulesResponse  { rules: AlertRule[]; }
