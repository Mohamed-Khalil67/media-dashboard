import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { AdminService } from "../../core/admin.service";
import { AuthService } from "../../core/auth.service";
import { StatusBarService } from "../../core/status-bar.service";
import {
  AdminUserDto,
  DeletePreviewResponse,
  ROLE_LABELS,
  ROLE_OPTIONS,
  UpdateUserPayload,
} from "../../core/models/admin.models";
import { UserRole } from "../../core/models/auth.models";

@Component({
  selector: "app-admin-access",
  imports: [ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Close whichever modal is open on Escape. The handlers are no-ops when no
    // modal is showing, so it's safe to always listen.
    "(document:keydown.escape)": "onEscape()",
  },
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Access control</h1>
          <p class="muted">Manage who can sign in. Every account here is a real Firebase user.</p>
        </div>
        <button class="btn-primary" type="button" (click)="openCreate()">+ Add user</button>
      </header>

      @if (loadError(); as e) {
        <div class="banner banner--error">{{ e }}</div>
      }

      @if (loading()) {
        <div class="card empty">Loading users…</div>
      } @else if (users().length === 0) {
        <div class="card empty">No users yet. Click <strong>Add user</strong> to create your first one.</div>
      } @else {
        <div class="card">
          <table class="users">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th class="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr [class.disabled-row]="u.disabled">
                  <td class="email">
                    {{ u.email }}
                    @if (u.id === selfId()) { <span class="self-tag">you</span> }
                  </td>
                  <td>{{ u.name ?? '—' }}</td>
                  <td>
                    @if (u.disabled) {
                      <span
                        class="role-frozen role-{{ u.role }}"
                        title="Role is locked while the account is disabled. Re-enable to change it."
                      >🔒 {{ roleLabel(u.role) }}</span>
                    } @else {
                      <select
                        #roleSelect
                        class="role-select role-{{ u.role }}"
                        [disabled]="u.id === selfId() || rowBusy() === u.id"
                        (change)="requestRoleChange(u, asRole($event), roleSelect)"
                        [title]="u.id === selfId() ? 'You cannot change your own role' : ''"
                      >
                        @for (r of roleOptions; track r) {
                          <option [value]="r" [selected]="r === u.role">{{ roleLabel(r) }}</option>
                        }
                      </select>
                    }
                  </td>
                  <td>
                    @if (u.disabled) {
                      <span class="pill pill--off">Disabled</span>
                    } @else {
                      <span class="pill pill--on">Active</span>
                    }
                  </td>
                  <td class="muted">{{ u.createdAt | date:'mediumDate' }}</td>
                  <td class="actions">
                    <button
                      type="button"
                      class="btn-ghost"
                      [disabled]="u.id === selfId() || rowBusy() === u.id"
                      (click)="openResetPassword(u)"
                    >Reset password</button>
                    @if (u.disabled) {
                      <button
                        type="button"
                        class="btn-ghost"
                        [disabled]="rowBusy() === u.id"
                        (click)="toggleDisabled(u, false)"
                      >Re-enable</button>
                    } @else {
                      <button
                        type="button"
                        class="btn-ghost"
                        [disabled]="u.id === selfId() || rowBusy() === u.id"
                        (click)="toggleDisabled(u, true)"
                      >Disable</button>
                    }
                    <button
                      type="button"
                      class="btn-danger"
                      [disabled]="u.id === selfId() || rowBusy() === u.id"
                      (click)="openDelete(u)"
                    >Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (creating()) {
      <div class="modal-backdrop" (click)="closeCreate()">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title" (click)="$event.stopPropagation()">
          <h2 id="create-user-title">Add new user</h2>
          <form [formGroup]="createForm" (ngSubmit)="submitCreate()">
            <div class="field">
              <label for="c-email">Email</label>
              <input id="c-email" type="email" formControlName="email" autocomplete="off" placeholder="user@example.com" />
            </div>
            <div class="field">
              <label for="c-name">Name <span class="muted">(optional)</span></label>
              <input id="c-name" type="text" formControlName="name" autocomplete="off" placeholder="Acme Corp — primary contact" />
            </div>
            <div class="field">
              <label for="c-role">Role</label>
              <select id="c-role" formControlName="role">
                @for (r of roleOptions; track r) {
                  <option [value]="r">{{ roleLabel(r) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="c-pass">Password <span class="muted">(min 8 chars)</span></label>
              <div class="pass-row">
                <input
                  id="c-pass"
                  [type]="showPass() ? 'text' : 'password'"
                  formControlName="password"
                  autocomplete="new-password"
                  placeholder="••••••••"
                />
                <button type="button" class="btn-ghost" (click)="showPass.set(!showPass())">
                  {{ showPass() ? 'Hide' : 'Show' }}
                </button>
              </div>
              <div class="strength" [attr.data-level]="passwordStrength()">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
            @if (createError(); as e) { <div class="banner banner--error">{{ e }}</div> }
            <div class="actions-row">
              <button type="button" class="btn-ghost" (click)="closeCreate()">Cancel</button>
              <button type="submit" class="btn-primary" [disabled]="createForm.invalid || submitting()">
                {{ submitting() ? 'Creating…' : 'Create user' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (resetTarget(); as target) {
      <div class="modal-backdrop" (click)="closeReset()">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" (click)="$event.stopPropagation()">
          <h2 id="reset-password-title">Reset password</h2>
          <p>Set a new password for <strong>{{ target.email }}</strong>. They can change it later.</p>
          <form [formGroup]="resetForm" (ngSubmit)="submitReset(target)">
            <div class="field">
              <label for="r-pass">New password</label>
              <div class="pass-row">
                <input
                  id="r-pass"
                  [type]="showResetPass() ? 'text' : 'password'"
                  formControlName="password"
                  autocomplete="new-password"
                  placeholder="At least 8 chars"
                />
                <button type="button" class="btn-ghost" (click)="showResetPass.set(!showResetPass())">
                  {{ showResetPass() ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            @if (resetError(); as e) { <div class="banner banner--error">{{ e }}</div> }
            <div class="actions-row">
              <button type="button" class="btn-ghost" (click)="closeReset()">Cancel</button>
              <button type="submit" class="btn-primary" [disabled]="resetForm.invalid || submitting()">
                {{ submitting() ? 'Saving…' : 'Set password' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (roleChange(); as rc) {
      <div class="modal-backdrop" (click)="cancelRoleChange()">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="role-change-title" (click)="$event.stopPropagation()">
          <h2 id="role-change-title">Confirm role change</h2>

          <div class="user-card">
            <strong>{{ rc.user.email }}</strong>
            @if (rc.user.name) { <span class="muted">— {{ rc.user.name }}</span> }
          </div>

          @if (rc.verifying) {
            <p class="muted">Verifying the user's current role…</p>
          } @else {
            @if (rc.serverRole !== rc.expectedRole) {
              <div class="banner banner--warn">
                <strong>Heads up:</strong> their role was already changed elsewhere.
                The dashboard showed <strong>{{ roleLabel(rc.expectedRole) }}</strong>,
                but the server currently has them as
                <strong>{{ roleLabel(rc.serverRole) }}</strong>.
                You're about to overwrite that.
              </div>
            }

            <div class="role-transition">
              <span class="role-pill role-{{ rc.serverRole }}">{{ roleLabel(rc.serverRole) }}</span>
              <span class="arrow">→</span>
              <span class="role-pill role-{{ rc.newRole }}">{{ roleLabel(rc.newRole) }}</span>
            </div>

            <p class="muted role-explainer">
              @switch (rc.newRole) {
                @case ('admin') { They will gain full access to the admin panel — including creating, disabling, and deleting users. }
                @case ('media_buyer') { They will be able to connect platforms, manage campaigns, edit alert rules, and trigger syncs. }
                @case ('client') { They will lose all write access and only be able to view dashboards, filters, and stats. }
              }
            </p>

            @if (roleChangeError(); as e) { <div class="banner banner--error">{{ e }}</div> }

            <div class="actions-row">
              <button type="button" class="btn-ghost" (click)="cancelRoleChange()">Cancel</button>
              <button
                type="button"
                class="btn-primary"
                [disabled]="submitting() || rc.serverRole === rc.newRole"
                (click)="confirmRoleChange()"
              >{{ submitting() ? 'Saving…' : (rc.serverRole === rc.newRole ? 'Already that role' : 'Confirm change') }}</button>
            </div>
          }
        </div>
      </div>
    }

    @if (deleteTarget(); as target) {
      <div class="modal-backdrop" (click)="closeDelete()">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-user-title" (click)="$event.stopPropagation()">
          <h2 id="delete-user-title">Delete user</h2>
          <p>
            Permanently removes <strong>{{ target.email }}</strong>. This cannot be undone.
          </p>
          <p class="muted">
            What gets deleted: the Firebase Auth account, the allowlist entry, and the User row.
            Workspaces they share with others stay intact — other members keep their seats.
          </p>

          @if (previewLoading()) {
            <div class="cascade-preview cascade-preview--loading">
              Counting what will be wiped…
            </div>
          } @else if (previewError()) {
            <div class="cascade-preview cascade-preview--error">
              Couldn't count the cascade. Proceeding will still hard-delete everything they own.
            </div>
          } @else if (deletePreview(); as p) {
            <div class="cascade-preview" role="status" aria-live="polite">
              <div class="cascade-head">This will also cascade-delete:</div>
              <ul class="cascade-list">
                <li><strong>{{ p.cascade.connections }}</strong> connection(s)</li>
                <li><strong>{{ p.cascade.campaigns }}</strong> campaign(s)</li>
                <li><strong>{{ p.cascade.insights }}</strong> insight row(s)</li>
                <li><strong>{{ p.cascade.syncRuns }}</strong> sync run record(s)</li>
                <li><strong>{{ p.cascade.shopifyOrders }}</strong> Shopify order row(s)</li>
                <li><strong>{{ p.cascade.alertRules }}</strong> alert rule(s)</li>
                <li><strong>{{ p.cascade.workspaceMembers }}</strong> workspace membership(s)</li>
              </ul>
              @if (isHighImpactDelete(p)) {
                <p class="cascade-warn">
                  ⚠ Large blast radius. Anyone sharing those workspaces will lose visibility
                  into this user's data.
                </p>
              }
            </div>
          }

          <p class="muted">Type their email to confirm:</p>
          <input
            class="confirm-input"
            type="text"
            autocomplete="off"
            [placeholder]="target.email"
            [value]="deleteConfirm()"
            (input)="deleteConfirm.set(asValue($event))"
          />
          @if (deleteError(); as e) { <div class="banner banner--error">{{ e }}</div> }
          <div class="actions-row">
            <button type="button" class="btn-ghost" (click)="closeDelete()">Cancel</button>
            <button
              type="button"
              class="btn-danger"
              [disabled]="deleteConfirm() !== target.email || submitting()"
              (click)="submitDelete(target)"
            >{{ submitting() ? 'Deleting…' : 'Delete user' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: 1rem; }
    .page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .page-head h1 { margin: 0 0 .25rem; font-size: 1.5rem; color: var(--text); }
    .muted { color: var(--text-muted); }
    p.muted, .page-head .muted { margin: 0; font-size: .9rem; }

    .card {
      background: var(--card-bg); border: 1px solid var(--card-bd);
      border-radius: .75rem; padding: 1rem; overflow: hidden;
    }
    .empty { text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; }

    table.users { width: 100%; border-collapse: collapse; font-size: .9rem; }
    table.users th, table.users td { padding: .65rem .75rem; text-align: left; border-bottom: 1px solid var(--card-bd); }
    table.users th { color: var(--text-muted); font-weight: 500; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
    table.users tbody tr:last-child td { border-bottom: 0; }
    table.users tbody tr:hover { background: var(--ghost-bg); }
    table.users .actions { text-align: right; white-space: nowrap; }
    .disabled-row td { opacity: .55; }

    .email { font-weight: 500; color: var(--text); }
    .self-tag {
      display: inline-block; margin-left: .35rem;
      background: var(--accent-soft); color: var(--accent);
      font-size: .65rem; font-weight: 600; padding: .1rem .4rem; border-radius: 999px;
      text-transform: uppercase; letter-spacing: .04em;
    }

    .role-select {
      padding: .25rem .5rem; border-radius: .35rem; border: 1px solid var(--card-bd);
      background: var(--card-bg); color: var(--text); font-size: .85rem; cursor: pointer;
    }
    .role-select:disabled { cursor: not-allowed; opacity: .8; }
    .role-admin { border-color: #dc2626; color: #dc2626; }
    .role-media_buyer { border-color: #4f46e5; color: #4f46e5; }
    .role-client { border-color: #64748b; color: #475569; }

    /* Shown in place of the role-select when the user is disabled. Reads as a
       locked badge so it's obvious you can't change the role until you re-enable. */
    .role-frozen {
      display: inline-flex; align-items: center; gap: .3rem;
      padding: .25rem .6rem; border-radius: .35rem;
      font-size: .82rem; font-weight: 600;
      border: 1px dashed var(--card-bd, #cbd5e1);
      background: var(--ghost-bg, #f8fafc);
      cursor: not-allowed; user-select: none;
    }
    .role-frozen.role-admin { color: #b91c1c; border-color: #fecaca; }
    .role-frozen.role-media_buyer { color: #4338ca; border-color: #c7d2fe; }
    .role-frozen.role-client { color: #475569; }

    /* Role-change confirmation modal */
    .user-card {
      padding: .65rem .85rem; background: var(--ghost-bg, #f1f5f9);
      border-radius: .5rem; font-size: .9rem; color: var(--text);
    }
    .role-transition {
      display: flex; align-items: center; justify-content: center; gap: .75rem;
      padding: 1rem; background: var(--ghost-bg, #f8fafc);
      border-radius: .6rem;
    }
    .role-pill {
      padding: .3rem .85rem; border-radius: 999px; font-size: .85rem; font-weight: 600;
      border: 1.5px solid;
    }
    .role-pill.role-admin { background: color-mix(in srgb, #dc2626 12%, transparent); }
    .role-pill.role-media_buyer { background: color-mix(in srgb, #4f46e5 12%, transparent); }
    .role-pill.role-client { background: color-mix(in srgb, #64748b 12%, transparent); }
    .arrow { color: var(--text-muted); font-size: 1.2rem; font-weight: 700; }
    .role-explainer { font-size: .85rem; line-height: 1.45; }
    .banner--warn {
      background: #fef3c7; color: #78350f; border: 1px solid #fde68a;
      padding: .65rem .85rem; border-radius: .5rem; font-size: .85rem; line-height: 1.5;
    }
    :host-context(html.dark) .banner--warn {
      background: #422006; color: #fde68a; border-color: #78350f;
    }

    .pill { display: inline-block; padding: .15rem .55rem; border-radius: 999px; font-size: .72rem; font-weight: 600; }
    .pill--on { background: color-mix(in srgb, #16a34a 18%, transparent); color: #15803d; }
    .pill--off { background: color-mix(in srgb, #64748b 18%, transparent); color: #475569; }

    .btn-primary, .btn-ghost, .btn-danger {
      padding: .45rem .85rem; border-radius: .4rem; font-size: .85rem; font-weight: 500;
      cursor: pointer; border: 1px solid transparent; transition: opacity .12s, transform .08s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover:not(:disabled) { opacity: .9; }
    .btn-ghost { background: transparent; color: var(--text); border-color: var(--card-bd); }
    .btn-ghost:hover:not(:disabled) { background: var(--ghost-bg); }
    .btn-danger { background: transparent; color: #dc2626; border-color: #fecaca; }
    .btn-danger:hover:not(:disabled) { background: #fef2f2; }
    :host-context(html.dark) .btn-danger { border-color: #7f1d1d; }
    :host-context(html.dark) .btn-danger:hover:not(:disabled) { background: #450a0a; }
    .btn-primary:disabled, .btn-ghost:disabled, .btn-danger:disabled { opacity: .55; cursor: not-allowed; }
    table.users .actions .btn-ghost, table.users .actions .btn-danger { margin-left: .35rem; padding: .3rem .6rem; font-size: .8rem; }

    .banner { padding: .65rem .85rem; border-radius: .5rem; font-size: .85rem; }
    .banner--error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    :host-context(html.dark) .banner--error { background: #450a0a; border-color: #7f1d1d; }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .55);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
      backdrop-filter: blur(4px); padding: 1rem;
    }
    .modal {
      background: var(--card-bg); border: 1px solid var(--card-bd);
      border-radius: .75rem; padding: 1.5rem; width: 100%; max-width: 28rem;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
      display: flex; flex-direction: column; gap: 1rem;
    }
    .modal h2 { margin: 0; font-size: 1.15rem; color: var(--text); }
    .modal p { margin: 0; color: var(--text); font-size: .9rem; line-height: 1.45; }

    .field { display: flex; flex-direction: column; gap: .35rem; }
    .field label { font-size: .85rem; color: var(--text); font-weight: 500; }
    .field input, .field select {
      padding: .55rem .7rem; border: 1px solid var(--card-bd); border-radius: .4rem;
      background: var(--card-bg); color: var(--text); font-size: .9rem;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
    .pass-row { display: flex; gap: .35rem; }
    .pass-row input { flex: 1; }

    .strength {
      display: flex; gap: .25rem; margin-top: .25rem;
    }
    .strength span {
      flex: 1; height: 4px; background: var(--card-bd); border-radius: 2px; transition: background .15s;
    }
    .strength[data-level="1"] span:nth-child(1) { background: #ef4444; }
    .strength[data-level="2"] span:nth-child(-n+2) { background: #f59e0b; }
    .strength[data-level="3"] span:nth-child(-n+3) { background: #84cc16; }
    .strength[data-level="4"] span { background: #16a34a; }

    .confirm-input {
      padding: .55rem .7rem; border: 1px solid var(--card-bd); border-radius: .4rem;
      background: var(--card-bg); color: var(--text); font-size: .9rem;
    }

    .actions-row { display: flex; gap: .5rem; justify-content: flex-end; }

    .cascade-preview {
      background: var(--card-bg); border: 1px solid var(--card-bd);
      border-radius: .45rem; padding: .65rem .85rem; font-size: .82rem;
    }
    .cascade-preview--loading { color: var(--text-muted); font-style: italic; }
    .cascade-preview--error { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    .cascade-head { font-weight: 500; margin-bottom: .4rem; }
    .cascade-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: .15rem .85rem; }
    .cascade-list li { color: var(--text-muted); }
    .cascade-list strong { color: var(--text); font-variant-numeric: tabular-nums; }
    .cascade-warn { margin: .55rem 0 0; padding: .45rem .6rem; background: #fef3c7; color: #92400e; border-radius: .35rem; }
    :host-context(html.dark) .cascade-warn { background: #422006; color: #fcd34d; }
  `],
})
export class AdminAccessComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly status = inject(StatusBarService);
  private readonly fb = inject(FormBuilder);

  readonly roleOptions = ROLE_OPTIONS;
  readonly roleLabel = (r: UserRole) => ROLE_LABELS[r];

  readonly users = signal<AdminUserDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly rowBusy = signal<string | null>(null);

  readonly creating = signal(false);
  readonly resetTarget = signal<AdminUserDto | null>(null);
  readonly deleteTarget = signal<AdminUserDto | null>(null);
  readonly submitting = signal(false);
  readonly showPass = signal(false);
  // Mask the admin reset-password input by default so temp passwords don't
  // leak in screenshares; admins can still toggle visibility when they need it.
  readonly showResetPass = signal(false);
  readonly createError = signal<string | null>(null);
  readonly resetError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly deleteConfirm = signal("");
  // Cascade preview (loaded fresh whenever the delete modal opens).
  readonly deletePreview = signal<DeletePreviewResponse | null>(null);
  readonly previewLoading = signal(false);
  readonly previewError = signal(false);

  readonly roleChange = signal<{
    user: AdminUserDto;
    newRole: UserRole;
    /** What the table thought the role was at click time. */
    expectedRole: UserRole;
    /** Freshly-fetched role from the server. Defaults to expectedRole while verifying. */
    serverRole: UserRole;
    /** Reference to the <select> so we can revert it on cancel without re-rendering the whole list. */
    selectEl: HTMLSelectElement;
    verifying: boolean;
  } | null>(null);
  readonly roleChangeError = signal<string | null>(null);

  readonly selfId = computed(() => this.auth.user()?.id ?? null);

  readonly createForm = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    name: [""],
    role: ["client" as UserRole, [Validators.required]],
    password: ["", [Validators.required, Validators.minLength(8)]],
  });

  readonly resetForm = this.fb.nonNullable.group({
    password: ["", [Validators.required, Validators.minLength(8)]],
  });

  readonly passwordStrength = computed(() => {
    const v = this.createForm.controls.password.value;
    if (!v) return 0;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v) && v.length >= 12) score++;
    return score;
  });

  ngOnInit(): void {
    this.refresh();
  }

  asValue(e: Event): string { return (e.target as HTMLInputElement).value; }
  asRole(e: Event): UserRole { return (e.target as HTMLSelectElement).value as UserRole; }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.users.set(await this.admin.listUsers());
    } catch (err: any) {
      this.loadError.set(err?.error?.message ?? "Could not load users.");
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.createForm.reset({ email: "", name: "", role: "client", password: "" });
    this.createError.set(null);
    this.showPass.set(false);
    this.creating.set(true);
  }
  closeCreate(): void { this.creating.set(false); }

  openResetPassword(u: AdminUserDto): void {
    this.resetForm.reset({ password: "" });
    this.resetError.set(null);
    this.showResetPass.set(false);
    this.resetTarget.set(u);
  }
  closeReset(): void { this.resetTarget.set(null); }

  openDelete(u: AdminUserDto): void {
    this.deleteConfirm.set("");
    this.deleteError.set(null);
    this.deletePreview.set(null);
    this.previewError.set(false);
    this.deleteTarget.set(u);
    void this.loadDeletePreview(u.id);
  }

  closeDelete(): void {
    this.deleteTarget.set(null);
    this.deletePreview.set(null);
    this.previewError.set(false);
  }

  private async loadDeletePreview(userId: string): Promise<void> {
    this.previewLoading.set(true);
    this.previewError.set(false);
    try {
      const preview = await this.admin.previewDelete(userId);
      // Only apply if the modal is still open against the same user — a fast
      // close+reopen could otherwise show counts for the previous target.
      if (this.deleteTarget()?.id === userId) {
        this.deletePreview.set(preview);
      }
    } catch {
      if (this.deleteTarget()?.id === userId) this.previewError.set(true);
    } finally {
      if (this.deleteTarget()?.id === userId) this.previewLoading.set(false);
    }
  }

  /**
   * Flag "this is going to hurt" when the cascade reaches a meaningful scale.
   * Chosen heuristically: anything > 1k insights or > 5 connections gets a
   * visible warning so the admin pauses on a media-buyer delete that wipes
   * a team's reporting history.
   */
  isHighImpactDelete(p: DeletePreviewResponse): boolean {
    return p.cascade.insights > 1000 || p.cascade.connections > 5;
  }

  /**
   * Single Escape handler for all four modals. Only the open modal reacts —
   * the others are already in a closed state, so calling their close() is a
   * harmless no-op. Order is deliberate: confirmation modals close first so
   * a stacked role-change-on-top-of-create scenario unwinds the topmost view.
   */
  onEscape(): void {
    if (this.roleChange()) return this.cancelRoleChange();
    if (this.deleteTarget()) return this.closeDelete();
    if (this.resetTarget()) return this.closeReset();
    if (this.creating()) return this.closeCreate();
  }

  async submitCreate(): Promise<void> {
    if (this.createForm.invalid) return;
    this.submitting.set(true);
    this.createError.set(null);
    try {
      const raw = this.createForm.getRawValue();
      const payload = {
        email: raw.email.trim().toLowerCase(),
        password: raw.password,
        role: raw.role,
        ...(raw.name.trim() ? { name: raw.name.trim() } : {}),
      };
      const created = await this.admin.createUser(payload);
      this.users.update((list) => [...list, created]);
      this.status.success(`Created ${created.email}`);
      this.creating.set(false);
    } catch (err: any) {
      this.createError.set(this.friendly(err) ?? "Could not create user.");
    } finally {
      this.submitting.set(false);
    }
  }

  async submitReset(target: AdminUserDto): Promise<void> {
    if (this.resetForm.invalid) return;
    this.submitting.set(true);
    this.resetError.set(null);
    try {
      const password = this.resetForm.controls.password.value;
      await this.admin.setPassword(target.id, password);
      this.status.success(`Password reset for ${target.email}`);
      this.resetTarget.set(null);
    } catch (err: any) {
      this.resetError.set(this.friendly(err) ?? "Could not reset password.");
    } finally {
      this.submitting.set(false);
    }
  }

  async submitDelete(target: AdminUserDto): Promise<void> {
    if (this.deleteConfirm() !== target.email) return;
    this.submitting.set(true);
    this.deleteError.set(null);
    try {
      await this.admin.deleteUser(target.id);
      this.users.update((list) => list.filter((u) => u.id !== target.id));
      this.status.success(`Deleted ${target.email}`);
      this.deleteTarget.set(null);
    } catch (err: any) {
      this.deleteError.set(this.friendly(err) ?? "Could not delete user.");
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Triggered when the admin picks a different option in the role <select>.
   * Doesn't commit the change — opens a confirmation modal first. While the modal
   * is up we re-fetch the user from the server so the admin can see the real
   * current role (in case it drifted from the cached list).
   */
  async requestRoleChange(user: AdminUserDto, newRole: UserRole, selectEl: HTMLSelectElement): Promise<void> {
    if (user.role === newRole) return;
    this.roleChangeError.set(null);
    this.roleChange.set({
      user,
      newRole,
      expectedRole: user.role,
      serverRole: user.role,
      selectEl,
      verifying: true,
    });

    try {
      const fresh = await this.admin.listUsers();
      this.users.set(fresh);
      const current = fresh.find((u) => u.id === user.id);
      const target = this.roleChange();
      if (!target || target.user.id !== user.id) return; // modal was already dismissed

      if (!current) {
        this.status.error("That user no longer exists.");
        this.cancelRoleChange();
        return;
      }
      this.roleChange.set({
        ...target,
        user: current,
        serverRole: current.role,
        verifying: false,
      });
    } catch (err: any) {
      this.roleChangeError.set(this.friendly(err) ?? "Couldn't verify the user's current role.");
      const target = this.roleChange();
      if (target) this.roleChange.set({ ...target, verifying: false });
    }
  }

  cancelRoleChange(): void {
    const target = this.roleChange();
    if (target) {
      // Reset the native <select> to whatever the server says is current; that
      // way the cell never lies about the actual server-side role.
      target.selectEl.value = target.serverRole;
    }
    this.roleChange.set(null);
    this.roleChangeError.set(null);
  }

  async confirmRoleChange(): Promise<void> {
    const target = this.roleChange();
    if (!target || target.verifying) return;
    if (target.serverRole === target.newRole) {
      // No-op — refresh table to reflect server truth and bail.
      this.users.update((list) => list.map((u) => (u.id === target.user.id ? { ...u, role: target.serverRole } : u)));
      this.roleChange.set(null);
      return;
    }

    this.submitting.set(true);
    this.roleChangeError.set(null);
    try {
      const updated = await this.admin.updateUser(target.user.id, { role: target.newRole });
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      this.status.success(`Role updated for ${updated.email}: ${updated.role}`);
      this.roleChange.set(null);
    } catch (err: any) {
      this.roleChangeError.set(this.friendly(err) ?? "Could not change role.");
      // Revert the select so it matches whatever role the server still has.
      target.selectEl.value = target.serverRole;
    } finally {
      this.submitting.set(false);
    }
  }

  async toggleDisabled(user: AdminUserDto, disabled: boolean): Promise<void> {
    await this.patchUser(user, { disabled });
  }

  private async patchUser(user: AdminUserDto, patch: UpdateUserPayload): Promise<void> {
    this.rowBusy.set(user.id);
    try {
      const updated = await this.admin.updateUser(user.id, patch);
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      this.status.success("Updated");
    } catch (err: any) {
      this.status.error(this.friendly(err) ?? "Could not update user.");
    } finally {
      this.rowBusy.set(null);
    }
  }

  private friendly(err: any): string | null {
    const code = err?.error?.error;
    const msg = err?.error?.message;
    if (msg) return msg;
    if (code === "email_exists") return "An account with that email already exists.";
    if (code === "weak_password") return "Password must be at least 8 characters.";
    if (code === "invalid_email") return "That email address doesn't look right.";
    if (code === "invalid_role") return "Pick a valid role.";
    if (code === "role_locked_while_disabled") return "Re-enable this account before changing its role.";
    return null;
  }
}
