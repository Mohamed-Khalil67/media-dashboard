import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { StatusBarComponent } from "./shared/status-bar/status-bar.component";

@Component({
  selector: "app-root",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, StatusBarComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class App {}
