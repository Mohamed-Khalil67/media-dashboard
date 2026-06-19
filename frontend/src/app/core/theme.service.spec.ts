import { TestBed } from "@angular/core/testing";
import { ThemeService } from "./theme.service";

describe("ThemeService", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("reads the saved theme from localStorage on construction", () => {
    localStorage.setItem("theme", "dark");
    const svc = TestBed.configureTestingModule({ providers: [ThemeService] }).inject(ThemeService);
    expect(svc.dark()).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("defaults to false (light) when no theme is saved and prefers-color-scheme is light", () => {
    const svc = TestBed.configureTestingModule({ providers: [ThemeService] }).inject(ThemeService);
    expect(svc.dark()).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle flips the signal, persists to localStorage, and toggles the html class", () => {
    const svc = TestBed.configureTestingModule({ providers: [ThemeService] }).inject(ThemeService);
    expect(svc.dark()).toBe(false);

    svc.toggle();
    expect(svc.dark()).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    svc.toggle();
    expect(svc.dark()).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
