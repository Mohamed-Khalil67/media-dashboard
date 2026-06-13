import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { environment } from "../../../environments/environment";

@Component({
  selector: "app-forgot-password",
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
        <div class="logo">🔑</div>
        <h1>Reset your password</h1>
        <p class="sub">We'll send you a secure link to set a new one</p>
      </div>

      @if (errorMsg(); as msg) {
        <div class="alert alert--error" role="alert">
          <span class="alert-icon">✕</span>
          <span>{{ msg }}</span>
        </div>
      }

      @if (!sent()) {
        <form [formGroup]="form" (ngSubmit)="submit()">
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

          <button type="submit" class="submit-btn" [disabled]="form.invalid || submitting()">
            @if (submitting()) {
              <span class="spinner"></span> Sending…
            } @else {
              Send reset link
            }
          </button>
        </form>

        <p class="footer-link">
          Remembered it? <a routerLink="/login">Back to sign in</a>
        </p>
      } @else {
        <div class="success-block">
          <div class="success-icon">✓</div>
          <h2>Check your inbox</h2>
          <p>
            If an account exists for <strong>{{ submittedEmail() }}</strong>, a password reset link is on its way.
          </p>
          <p class="muted">
            Didn't receive it within a minute? Check your spam folder. Firebase sends from
            <code>noreply&#64;media-dashboard-58db5.firebaseapp.com</code>.
          </p>

          @if (needsRegistration()) {
            <div class="alert alert--info">
              <span class="alert-icon">i</span>
              <span>
                That email is invited but has never signed in yet. Use the
                <a routerLink="/register">create account</a> page first, then sign in.
              </span>
            </div>
          }

          @if (devLink(); as link) {
            <div class="dev-block">
              <strong>Dev mode — direct reset link</strong>
              <p class="muted">
                Email delivery from Firebase's default sender is often filtered in dev. Use this link instead:
              </p>
              <div class="dev-link-row">
                <input type="text" readonly [value]="link" #linkInput />
                <button type="button" class="copy-btn" (click)="copyLink(linkInput)">
                  {{ copied() ? '✓ Copied' : 'Copy' }}
                </button>
              </div>
              <a class="open-link" [href]="link" target="_blank" rel="noopener">Open reset link →</a>
            </div>
          }

          <div class="actions-row">
            <button type="button" class="btn-ghost" (click)="resend()">Send to another email</button>
            <a routerLink="/login" class="btn-primary">Back to sign in</a>
          </div>
        </div>
      }
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
      width: 100%; max-width: 30rem;
    }

    .card-header { text-align: center; margin-bottom: 1.75rem; }
    .logo { font-size: 2.75rem; margin-bottom: .75rem; }
    h1 { margin: 0 0 .3rem; font-size: 1.55rem; color: #0f172a; font-weight: 700; }
    .sub { margin: 0; color: #64748b; font-size: .9rem; }

    .alert {
      display: flex; align-items: flex-start; gap: .65rem;
      padding: .75rem .9rem; border-radius: .55rem;
      font-size: .85rem; margin-bottom: 1rem;
      border-left: 4px solid currentColor;
    }
    .alert--error { background: #fef2f2; color: #b91c1c; }
    .alert--info  { background: #eff6ff; color: #1d4ed8; }
    .alert-icon {
      width: 1.25rem; height: 1.25rem; border-radius: 50%; background: currentColor;
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: .7rem; font-weight: 700; flex-shrink: 0; margin-top: .1rem;
    }
    .alert a { color: currentColor; font-weight: 600; }

    .field { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .9rem; }
    label { font-size: .85rem; font-weight: 500; color: #374151; }
    input {
      padding: .7rem .9rem; border: 1.5px solid #d1d5db; border-radius: .5rem;
      font-size: .95rem; color: #0f172a;
      background: #f9fafb;
      transition: border-color .15s, box-shadow .15s;
    }
    input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.12); background: #fff; }
    input.input-error { border-color: #ef4444; }
    input::placeholder { color: #9ca3af; }
    .field-err { font-size: .75rem; color: #ef4444; }

    .submit-btn {
      width: 100%; padding: .8rem; margin-top: .35rem;
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

    /* Success state */
    .success-block { display: flex; flex-direction: column; gap: 1rem; }
    .success-icon {
      width: 3.5rem; height: 3.5rem; border-radius: 50%;
      background: color-mix(in srgb, #16a34a 15%, transparent); color: #16a34a;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.75rem; font-weight: 700;
      margin: 0 auto;
    }
    .success-block h2 { margin: 0; font-size: 1.2rem; color: #0f172a; text-align: center; }
    .success-block p { margin: 0; font-size: .9rem; color: #334155; line-height: 1.5; text-align: center; }
    .success-block p.muted { color: #64748b; font-size: .82rem; }
    .success-block code {
      background: #f1f5f9; padding: .1rem .35rem; border-radius: .25rem;
      font-size: .78rem; font-family: ui-monospace, Menlo, monospace; color: #334155;
    }

    /* Dev block */
    .dev-block {
      margin-top: .5rem; padding: 1rem;
      background: #fef3c7; border: 1px solid #fde68a; border-radius: .5rem;
      display: flex; flex-direction: column; gap: .5rem;
      color: #78350f;
    }
    .dev-block strong { font-size: .85rem; color: #78350f; }
    .dev-block p { text-align: left !important; color: #78350f !important; }
    .dev-link-row { display: flex; gap: .35rem; }
    .dev-link-row input {
      flex: 1; padding: .45rem .6rem; border: 1px solid #f59e0b; border-radius: .35rem;
      background: #fffbeb; color: #78350f; font-size: .75rem;
      font-family: ui-monospace, Menlo, monospace;
    }
    .copy-btn {
      padding: .45rem .7rem; border: 0; border-radius: .35rem;
      background: #f59e0b; color: #fff; font-weight: 500; cursor: pointer;
      font-size: .8rem; min-width: 5rem;
    }
    .copy-btn:hover { opacity: .9; }
    .open-link {
      align-self: flex-start; color: #b45309; text-decoration: underline;
      font-size: .82rem; font-weight: 500;
    }

    .actions-row {
      display: flex; gap: .65rem; justify-content: center;
      margin-top: .5rem;
    }
    .btn-ghost, .btn-primary {
      padding: .55rem 1rem; border-radius: .5rem; font-size: .88rem;
      font-weight: 500; cursor: pointer; text-decoration: none;
      text-align: center; transition: opacity .15s;
    }
    .btn-ghost { background: transparent; color: #475569; border: 1px solid #cbd5e1; }
    .btn-ghost:hover { background: #f1f5f9; }
    .btn-primary { background: #4f46e5; color: #fff; border: 0; }
    .btn-primary:hover { opacity: .9; }
  `],
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
