import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { ToastService } from "../../core/toast.service";

@Component({
  selector: "app-login",
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-card">
      <h1>Sign in</h1>
      <p class="muted">Welcome back. Sign in to your dashboard.</p>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>
          <span>Email</span>
          <input type="email" formControlName="email" autocomplete="email" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" formControlName="password" autocomplete="current-password" />
        </label>
        <button type="submit" [disabled]="form.invalid || submitting()">
          {{ submitting() ? "Signing in…" : "Sign in" }}
        </button>
      </form>
      <p class="muted">No account? <a routerLink="/register">Create one</a></p>
    </div>
  `,
  styles: [`
    :host {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f1f5f9; padding: 1rem;
    }
    .auth-card {
      background: #fff; padding: 2rem; border-radius: .75rem;
      box-shadow: 0 8px 24px rgba(15, 23, 42, .08);
      width: 100%; max-width: 24rem;
    }
    h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
    .muted { color: #64748b; margin: 0 0 1.25rem; font-size: .9rem; }
    form { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1rem; }
    label { display: flex; flex-direction: column; gap: .25rem; font-size: .85rem; color: #334155; }
    input {
      padding: .55rem .75rem; border: 1px solid #cbd5e1; border-radius: .375rem;
      font-size: 1rem;
    }
    input:focus { outline: 2px solid #4f46e5; outline-offset: -1px; border-color: transparent; }
    button[type=submit] {
      margin-top: .5rem; padding: .65rem; background: #4f46e5; color: #fff;
      border: 0; border-radius: .375rem; font-weight: 500; cursor: pointer;
    }
    button[type=submit]:disabled { opacity: .55; cursor: not-allowed; }
    a { color: #4f46e5; text-decoration: none; }
    a:hover { text-decoration: underline; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      this.toast.success("Welcome back!");
      this.router.navigate(["/dashboard"]);
    } catch (err: any) {
      this.toast.error(err?.error?.error ?? "Could not sign in");
    } finally {
      this.submitting.set(false);
    }
  }
}
