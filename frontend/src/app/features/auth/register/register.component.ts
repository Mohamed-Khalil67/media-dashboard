import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthService } from "../../../core/auth.service";
import { StatusBarService } from "../../../core/status-bar.service";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-register",
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: "./register.component.html",
  styleUrl: "./register.component.css",
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly status = inject(StatusBarService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    name: [""],
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(8)]],
  });

  strengthWidth(): string {
    const pw = this.form.controls.password.value;
    if (!pw) return "0%";
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return `${Math.min(100, score * 20)}%`;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.formError.set(null);
    try {
      const { email, password, name } = this.form.getRawValue();
      await this.auth.register(email, password, name || undefined);
      this.status.success("Account created. Let's connect your platforms.");
      this.router.navigate(["/connections"]);
    } catch (err: any) {
      this.formError.set(this.friendlyMessage(err) ?? "Could not create account");
    } finally {
      this.submitting.set(false);
    }
  }

  private friendlyMessage(err: any): string | null {
    const code = err?.code ?? "";
    switch (code) {
      case "auth/email-already-in-use": return "An account with this email already exists. Try signing in.";
      case "auth/weak-password": return "Password is too weak. Use at least 8 characters with a mix of types.";
      case "auth/invalid-email": return "That doesn't look like a valid email address.";
      case "auth/popup-closed-by-user": return "Sign-up cancelled.";
      default: return err?.message ?? null;
    }
  }
}
