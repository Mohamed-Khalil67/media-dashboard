import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { StatusBarService } from "../../core/status-bar.service";

@Component({
  selector: "app-register",
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
        <h1>Create your account</h1>
        <p class="sub">Start unifying your ad data in minutes</p>
      </div>

      @if (formError(); as msg) {
        <div class="alert alert--error" role="alert">
          <span class="alert-icon">✕</span>
          <span>{{ msg }}</span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label for="name">Full name <span class="optional">(optional)</span></label>
          <input id="name" type="text" formControlName="name" autocomplete="name" placeholder="Jane Smith" />
        </div>

        <div class="field">
          <label for="email">Email address</label>
          <input
            id="email"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="you@example.com"
            [class.input-error]="form.controls.email.invalid && form.controls.email.touched"
          />
          @if (form.controls.email.invalid && form.controls.email.touched) {
            <span class="field-err">Enter a valid email address</span>
          }
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            formControlName="password"
            autocomplete="new-password"
            placeholder="Min. 8 characters"
            [class.input-error]="form.controls.password.invalid && form.controls.password.touched"
          />
          @if (form.controls.password.invalid && form.controls.password.touched) {
            <span class="field-err">Password must be at least 8 characters</span>
          }
          @if (form.controls.password.valid && form.controls.password.touched) {
            <div class="strength-bar">
              <div class="strength-fill" [style.width]="strengthWidth()"></div>
            </div>
          }
        </div>

        <button type="submit" class="submit-btn" [disabled]="form.invalid || submitting()">
          @if (submitting()) {
            <span class="spinner"></span> Creating account…
          } @else {
            Create free account
          }
        </button>
      </form>

      <p class="footer-link">Already have an account? <a routerLink="/login">Sign in</a></p>
    </div>
  `,
  styles: [`
    :host {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 1.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
      position: relative; overflow: hidden;
    }

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
    h1 { margin: 0 0 .3rem; font-size: 1.65rem; color: #0f172a; font-weight: 700; }
    .sub { margin: 0; color: #64748b; font-size: .95rem; }

    .alert {
      display: flex; align-items: flex-start; gap: .75rem;
      padding: .9rem 1rem; border-radius: .6rem;
      font-size: .875rem; margin-bottom: 1.25rem;
      border-left: 4px solid currentColor;
    }
    .alert--error { background: #fef2f2; color: #b91c1c; }
    .alert-icon {
      width: 1.4rem; height: 1.4rem; border-radius: 50%; background: currentColor;
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 700; flex-shrink: 0; margin-top: .05rem;
    }

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

    .divider {
      display: flex; align-items: center; gap: .75rem;
      color: #94a3b8; font-size: .75rem; margin: .75rem 0;
    }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: #e2e8f0; }

    .field { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .9rem; }
    label { font-size: .85rem; font-weight: 500; color: #374151; }
    .optional { font-weight: 400; color: #94a3b8; font-size: .78rem; }
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

    .strength-bar { height: 3px; background: #e2e8f0; border-radius: 2px; overflow: hidden; margin-top: .2rem; }
    .strength-fill { height: 100%; background: linear-gradient(90deg, #4f46e5, #6366f1); border-radius: 2px; transition: width .3s; }

    .submit-btn {
      width: 100%; padding: .8rem; margin-top: .25rem;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: #fff; border: 0; border-radius: .6rem;
      font-weight: 600; font-size: 1rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      box-shadow: 0 4px 14px rgba(79,70,229,.4);
      transition: opacity .15s, transform .1s;
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
    .footer-link a { color: #4f46e5; font-weight: 500; text-decoration: none; }
    .footer-link a:hover { text-decoration: underline; }
  `],
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
