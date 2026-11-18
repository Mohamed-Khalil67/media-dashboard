import { ChangeDetectionStrategy, Component } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-guide",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./guide.component.html",
  styleUrl: "./guide.component.css",
})
export class GuideComponent {
  close(): void {
    window.close();
  }
}
