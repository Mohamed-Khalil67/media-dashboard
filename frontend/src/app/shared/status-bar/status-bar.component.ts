import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { StatusBarService } from "../../core/status-bar.service";

@Component({
  selector: "app-status-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: "./status-bar.component.html",
  styleUrl: "./status-bar.component.css",
})
export class StatusBarComponent {
  readonly status = inject(StatusBarService);
}
