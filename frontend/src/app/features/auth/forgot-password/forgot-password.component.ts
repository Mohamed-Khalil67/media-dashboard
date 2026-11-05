import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../../core/auth.service";
import { environment } from "../../../../environments/environment";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-forgot-password",
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: "./forgot-password.component.html",
  styleUrl: "./forgot-password.component.css",
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
  });

  readonly submitting = signal(false);
  readonly sent = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly submittedEmail = signal("");
  readonly devLink = signal<string | null>(null);
  readonly needsRegistration = signal(false);
  readonly copied = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.errorMsg.set(null);
    const email = this.form.controls.email.value.trim().toLowerCase();

    try {
      // First: ask the backend to verify the account + log/return the dev link.
      // Then trigger the Firebase web SDK send so the user also receives the
      // hosted email when delivery is working.
      const backend = await this.auth.requestPasswordResetWithVerification(email);
      this.devLink.set(backend.devLink ?? null);
      this.needsRegistration.set(!!backend.needsRegistration);

      // Best-effort web SDK send. Don't fail the success state if it errors —
      // the backend has already confirmed the link works, and any specific
      // failure (e.g. auth/user-not-found) leaks existence anyway.
      if (!backend.needsRegistration) {
        await this.auth.resetPassword(email).catch(() => {});
      }

      this.submittedEmail.set(email);
      this.sent.set(true);
    } catch (err: any) {
      this.errorMsg.set(this.friendly(err) ?? "Could not send reset email. Try again in a moment.");
    } finally {
      this.submitting.set(false);
    }
  }

  resend(): void {
    this.sent.set(false);
    this.devLink.set(null);
    this.needsRegistration.set(false);
    this.copied.set(false);
    this.form.reset({ email: "" });
  }

  copyLink(input: HTMLInputElement): void {
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => {
      // Fallback: at least the input is selected so user can Ctrl+C.
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  // Suppress unused-import warning while keeping the import available for future use.
  protected readonly isProd = environment.production;

  private friendly(err: any): string | null {
    const code = err?.code ?? err?.error?.error ?? "";
    const backendMsg = err?.error?.message;
    if (code === "auth/invalid-email" || code === "invalid_email") return "That doesn't look like a valid email address.";
    if (code === "auth/too-many-requests") return "Too many attempts. Try again in a few minutes.";
    if (code === "firebase_link_unavailable") {
      return backendMsg ?? "Firebase couldn't generate a reset link. Use the set-password CLI to bypass.";
    }
    if (code === "reset_failed") return backendMsg ?? "The server couldn't generate a reset link. Check the backend logs.";
    return backendMsg ?? null;
  }
}
