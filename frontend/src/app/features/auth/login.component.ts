import { Component, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { StatusBarService } from "../../core/status-bar.service";

@Component({
  selector: "app-login",
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="bg">
      <span class="tv" style="left:5%;top:12%;font-size:4rem;animation-delay:0s;animation-duration:9s">📺</span>
      <span class="tv" style="left:18%;top:68%;font-size:2.2rem;animation-delay:1.5s;animation-duration:12s">📺</span>
      <span class="tv" style="left:35%;top:30%;font-size:5.5rem;animation-delay:3s;animation-duration:8s">📺</span>
      <span class="tv" style="left:55%;top:75%;font-size:3rem;animation-delay:0.8s;animation-duration:11s">📺</span>
      <span class="tv" style="left:70%;top:15%;font-size:6rem;animation-delay:2.2s;animation-duration:10s">📺</span>
      <span class="tv" style="left:82%;top:55%;font-size:2.5rem;animation-delay:4s;animation-duration:7s">📺</span>
      <span class="tv" style="left:90%;top:82%;font-size:4.5rem;animation-delay:1s;animation-duration:13s">📺</span>
      <span class="tv" style="left:48%;top:5%;font-size:3.5rem;animation-delay:5s;animation-duration:9s">📺</span>
      <span class="tv" style="left:25%;top:90%;font-size:2rem;animation-delay:2.5s;animation-duration:14s">📺</span>
      <span class="tv" style="left:62%;top:42%;font-size:5rem;animation-delay:3.5s;animation-duration:8s">📺</span>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="logo">📺</div>
        <h1>Welcome back</h1>
        <p class="sub">Sign in to your media dashboard</p>
      </div>

      @if (deniedBanner()) {
        <div class="alert alert--error" role="alert">
          <span class="alert-icon">🔒</span>
          <div>
            <strong>Access denied</strong>
            <p>This email isn't authorized for this workspace. Contact your administrator if you believe this is a mistake.</p>
          </div>
        </div>
      }

      @if (formError(); as msg) {
        <div class="alert alert--error" role="alert">
          <span class="alert-icon">✕</span>
          <span>{{ msg }}</span>
        </div>
      }

      @if (showMigrationBanner()) {
        <div class="alert alert--info" role="status">
          <span class="alert-icon">ℹ</span>
          <div>
            <strong>Login upgrade required</strong>
            <p>We've upgraded our login system. Reset your password to continue.</p>
            <button class="link-btn" type="button" (click)="sendReset()" [disabled]="resetSent()">
              {{ resetSent() ? "✓ Reset email sent" : "Send password reset email →" }}
            </button>
          </div>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label for="email">Email address</label>
          <input
            id="email"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="you@example.com"
            (blur)="checkEmail()"
            [class.input-error]="form.controls.email.invalid && form.controls.email.touched"
          />
          @if (form.controls.email.invalid && form.controls.email.touched) {
            <span class="field-err">Enter a valid email address</span>
          }
        </div>

        <div class="field">
          <div class="label-row">
            <label for="password">Password</label>
            <a routerLink="/forgot-password" class="forgot">Forgot password?</a>
          </div>
          <input
            id="password"
            type="password"
            formControlName="password"
            autocomplete="current-password"
            placeholder="••••••••"
            [class.input-error]="form.controls.password.invalid && form.controls.password.touched"
          />
        </div>

        <button type="submit" class="submit-btn" [disabled]="form.invalid || submitting()">
          @if (submitting()) {
            <span class="spinner"></span> Signing in…
          } @else {
            Sign in
          }
        </button>
      </form>

      <p class="footer-link">Don't have an account? <a routerLink="/register">Create one free</a></p>
    </div>
  `,
  styles: [`
    :host {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 1.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
      position: relative; overflow: hidden;
    }

    /* Floating TVs */
    .bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
    .tv {
      position: absolute; opacity: .07; user-select: none;
      animation: floatTV linear infinite;
      filter: grayscale(1) brightness(2);
    }
    @keyframes floatTV {
      0%   { transform: translateY(0px) rotate(-4deg); }
      33%  { transform: translateY(-22px) rotate(2deg); }
      66%  { transform: translateY(-10px) rotate(-2deg); }
      100% { transform: translateY(0px) rotate(-4deg); }
    }

    /* Card */
    .card {
      position: relative; z-index: 1;
      background: rgba(255, 255, 255, 0.97);
      backdrop-filter: blur(20px);
      padding: 2.5rem 2.75rem;
      border-radius: 1.25rem;
      box-shadow: 0 24px 64px rgba(0, 0, 0, .45), 0 0 0 1px rgba(255,255,255,.1);
      width: 100%; max-width: 28rem;
    }

    .card-header { text-align: center; margin-bottom: 1.75rem; }
    .logo { font-size: 2.75rem; margin-bottom: .75rem; }
    h1 { margin: 0 0 .3rem; font-size: 1.65rem; color: #0f172a; font-weight: 700; font-family: "Space Grotesk", system-ui, sans-serif; letter-spacing: -.02em; }
    .sub { margin: 0; color: #64748b; font-size: .95rem; }

    /* Alerts */
    .alert {
      display: flex; align-items: flex-start; gap: .75rem;
      padding: .9rem 1rem; border-radius: .6rem;
      font-size: .875rem; margin-bottom: 1.25rem;
      border-left: 4px solid currentColor;
    }
    .alert--error { background: #fef2f2; color: #b91c1c; }
    .alert--info  { background: #eff6ff; color: #1d4ed8; }
    .alert-icon {
      width: 1.4rem; height: 1.4rem; border-radius: 50%; background: currentColor;
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 700; flex-shrink: 0; margin-top: .05rem;
    }
    .alert--info p, .alert--error p { margin: .3rem 0 0; font-size: .82rem; opacity: .85; }
    .alert--info strong, .alert--error strong { font-size: .9rem; }
    .link-btn {
      background: transparent; border: 0; color: currentColor; text-decoration: underline;
      cursor: pointer; padding: 0; font-size: .82rem; font-weight: 600;
    }
    .link-btn:disabled { opacity: .6; cursor: not-allowed; }

    /* Social */
    .social-row { display: flex; flex-direction: column; gap: .6rem; margin-bottom: .75rem; }
    .social {
      display: flex; align-items: center; justify-content: center; gap: .6rem;
      padding: .7rem 1rem; border-radius: .6rem; cursor: pointer;
      font-size: .9rem; font-weight: 500; border: 1.5px solid transparent;
      transition: opacity .15s, box-shadow .15s;
    }
    .social:hover { opacity: .88; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
    .social-fb { background: #1877F2; color: #fff; }
    .social-google { background: #fff; color: #1f2937; border-color: #d1d5db; }

    /* Divider */
    .divider {
      display: flex; align-items: center; gap: .75rem;
      color: #94a3b8; font-size: .75rem; margin: .75rem 0;
    }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: #e2e8f0; }

    /* Fields */
    .field { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .9rem; }
    .label-row { display: flex; justify-content: space-between; align-items: center; }
    label { font-size: .85rem; font-weight: 500; color: #374151; }
    .forgot { font-size: .78rem; color: #009e6d; text-decoration: none; }
    .forgot:hover { text-decoration: underline; }
    input {
      padding: .7rem .9rem; border: 1.5px solid #d1d5db; border-radius: .5rem;
      font-size: .95rem; color: #0f172a; transition: border-color .15s, box-shadow .15s;
      background: #f9fafb;
    }
    input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.12); background: #fff; }
    input.input-error { border-color: #ef4444; }
    input.input-error:focus { box-shadow: 0 0 0 3px rgba(239,68,68,.12); }
    input::placeholder { color: #9ca3af; }
    .field-err { font-size: .75rem; color: #ef4444; margin-top: -.1rem; }

    /* Submit */
    .submit-btn {
      width: 100%; padding: .8rem; margin-top: .25rem;
      background: linear-gradient(135deg, #00976a, #00c688);
      color: #fff; border: 0; border-radius: .6rem;
      font-weight: 600; font-size: 1rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      box-shadow: 0 4px 14px rgba(0, 184, 122, .4);
      transition: opacity .15s, transform .1s;
      font-family: "Space Grotesk", system-ui, sans-serif;
    }
    .submit-btn:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
    .submit-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }

    .spinner {
      width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.35);
      border-top-color: #fff; border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .footer-link { text-align: center; font-size: .875rem; color: #64748b; margin: 1.25rem 0 0; }
    .footer-link a { color: #009e6d; font-weight: 500; text-decoration: none; }
    .footer-link a:hover { text-decoration: underline; }
  `],
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
