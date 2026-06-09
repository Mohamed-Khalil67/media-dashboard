import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly dark = signal(this.initialDark());

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.dark.update((v) => !v);
    localStorage.setItem("theme", this.dark() ? "dark" : "light");
    this.apply();
  }

  private initialDark(): boolean {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  }

  private apply(): void {
    document.documentElement.classList.toggle("dark", this.dark());
  }
}
