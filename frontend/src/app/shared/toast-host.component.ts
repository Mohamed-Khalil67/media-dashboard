import { Component, inject } from "@angular/core";
import { ToastService } from "../core/toast.service";

@Component({
  selector: "app-toast-host",
  imports: [],
  template: `
    <div class="toast-host" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast toast--{{ t.kind }}" role="status">
          <span>{{ t.message }}</span>
          <button type="button" (click)="toasts.dismiss(t.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-host {
      position: fixed; top: 1rem; right: 1rem; z-index: 9999;
      display: flex; flex-direction: column; gap: .5rem; max-width: 22rem;
    }
    .toast {
      display: flex; align-items: center; gap: .75rem;
      padding: .75rem 1rem; border-radius: .5rem; color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,.15); font-size: .9rem;
    }
    .toast button {
      margin-left: auto; background: transparent; border: 0; color: inherit;
      font-size: 1.25rem; cursor: pointer; line-height: 1;
    }
    .toast--success { background: #16a34a; }
    .toast--error   { background: #dc2626; }
    .toast--info    { background: #2563eb; }
  `],
})
export class ToastHostComponent {
  readonly toasts = inject(ToastService);
}
