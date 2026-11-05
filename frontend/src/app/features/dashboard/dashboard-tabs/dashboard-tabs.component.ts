import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

@Component({
  selector: "app-dashboard-tabs",
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./dashboard-tabs.component.html",
  styleUrl: "./dashboard-tabs.component.css",
})
export class DashboardTabsComponent {}
