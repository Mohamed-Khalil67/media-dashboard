import { Injectable, signal } from "@angular/core";

export type StatusKind = "success" | "error" | "info";

export interface StatusPill {
  id: number;
  kind: StatusKind;
  message: string;
}

/**
 * Single-pill transient status notifications shown in the bottom-left corner.
 * Replaces the older ToastService card-style pop-ups.
 *
 * Only one pill is visible at a time — a newer message replaces an older one.
 */
@Injectable({ providedIn: "root" })
export class StatusBarService {
  readonly current = signal<StatusPill | null>(null);
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: StatusKind = "info", ttlMs = 2500): void {
    if (this.timer) clearTimeout(this.timer);
    const pill: StatusPill = { id: this.nextId++, kind, message };
    this.current.set(pill);
    const ttl = kind === "error" ? Math.max(ttlMs, 4000) : ttlMs;
    this.timer = setTimeout(() => this.dismiss(pill.id), ttl);
  }

  success(msg: string): void { this.show(msg, "success"); }
  error(msg: string): void   { this.show(msg, "error"); }
  info(msg: string): void    { this.show(msg, "info"); }

  dismiss(id?: number): void {
    if (id !== undefined && this.current()?.id !== id) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.current.set(null);
  }
}
