import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { ThemeService } from "../../core/theme.service";

@Component({
  selector: "app-shell",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./app-shell.component.html",
  styleUrl: "./app-shell.component.css",
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  readonly showLogoutConfirm = signal(false);
  readonly loggingOut = signal(false);

  confirmLogout(): void {
    this.showLogoutConfirm.set(true);
  }

  async doLogout(): Promise<void> {
    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.loggingOut.set(false);
      this.showLogoutConfirm.set(false);
    }
  }
}
