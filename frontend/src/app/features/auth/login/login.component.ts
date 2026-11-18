import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthService } from "../../../core/auth.service";
import { StatusBarService } from "../../../core/status-bar.service";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-login",
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.css",
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly status = inject(StatusBarService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly showMigrationBanner = signal(false);
  readonly resetSent = signal(false);
  readonly deniedBanner = signal(this.route.snapshot.queryParamMap.get("denied") === "1");
  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    // Once the banner has been read off the URL, strip the query param so a refresh
    // doesn't keep the banner stuck even after the user has corrected the situation.
    if (this.deniedBanner()) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { denied: null },
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
    }

    // If the user changes the email after triggering a password reset, the
    // "✓ Reset email sent" pill is stale — re-enable the button so they can
    // send a fresh reset to the new address.
    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.resetSent()) this.resetSent.set(false);
      });
  }

  async checkEmail(): Promise<void> {
    // no-op — legacy migration check removed
  }

  async sendReset(): Promise<void> {
    const email = this.form.controls.email.value.trim().toLowerCase();
    if (!email) return;
    try {
      await this.auth.resetPassword(email);
      this.resetSent.set(true);
      this.status.success("Password reset email sent");
    } catch (err: any) {
      this.formError.set(err?.message ?? "Could not send reset email");
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.formError.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      this.status.success("Welcome back!");
      this.router.navigate(["/dashboard"]);
    } catch (err: any) {
      const code = err?.code ?? "";
      this.formError.set(this.friendlyMessage(err) ?? "Could not sign in");
    } finally {
      this.submitting.set(false);
    }
  }

  private friendlyMessage(err: any): string | null {
    const code = err?.code ?? "";
    switch (code) {
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Incorrect email or password.";
      case "auth/too-many-requests": return "Too many attempts. Try again in a few minutes.";
      case "auth/popup-closed-by-user": return "Sign-in cancelled.";
      case "auth/account-exists-with-different-credential": return "An account already exists with that email using a different sign-in method.";
      default: return err?.message ?? null;
    }
  }
}
