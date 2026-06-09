import { Injectable, signal } from "@angular/core";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

@Injectable({ providedIn: "root" })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, kind: ToastKind = "info", ttlMs = 4000): void {
    const toast: Toast = { id: this.nextId++, kind, message };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), ttlMs);
  }

  success(msg: string): void { this.show(msg, "success"); }
  error(msg: string): void { this.show(msg, "error", 6000); }
  info(msg: string): void { this.show(msg, "info"); }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
