import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { StatusBarComponent } from "./shared/status-bar.component";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, StatusBarComponent],
  template: `<router-outlet /><app-status-bar />`,
  styles: [`:host { display: contents; }`],
})
export class App {}
