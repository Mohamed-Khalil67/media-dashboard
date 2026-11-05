import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { EvaluatedAlert } from "../../../../core/models/alerts.models";

@Component({
  selector: "app-alerts-panel",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./alerts-panel.component.html",
  styleUrl: "./alerts-panel.component.css",
})
export class AlertsPanelComponent {
  readonly alerts = input.required<EvaluatedAlert[]>();
}
