import { Component } from "@angular/core";
import { TestBed, ComponentFixture } from "@angular/core/testing";
import { KpiCardComponent } from "./kpi-card.component";

@Component({
  imports: [KpiCardComponent],
  template: `
    <app-kpi-card
      [label]="label"
      [value]="value"
      [format]="format"
      [prefix]="prefix"
      [suffix]="suffix"
      [delta]="delta"
      [previous]="previous"
      [subtext]="subtext" />
  `,
})
class HostComponent {
  label = "Spend";
  value = 1234;
  format = "1.0-0";
  prefix: string | null = null;
  suffix: string | null = null;
  delta: number | null = null;
  previous: number | null = null;
  subtext: string | null = null;
}

function mount(setup: (h: HostComponent) => void): ComponentFixture<HostComponent> {
  const fixture = TestBed.configureTestingModule({ imports: [HostComponent] }).createComponent(HostComponent);
  setup(fixture.componentInstance);
  fixture.detectChanges();
  return fixture;
}

describe("KpiCardComponent", () => {
  it("renders label + value formatted by format string", () => {
    const fixture = mount((h) => { h.label = "Revenue"; h.value = 1234; h.format = "1.0-0"; });
    expect(fixture.nativeElement.querySelector(".label").textContent).toBe("Revenue");
    expect(fixture.nativeElement.querySelector(".value").textContent).toContain("1,234");
  });

  it("does not render the delta pill when delta is absent", () => {
    const fixture = mount((h) => { h.delta = null; });
    expect(fixture.nativeElement.querySelector(".pill")).toBeNull();
  });

  it("renders a green pill with ▲ for positive delta", () => {
    const fixture = mount((h) => { h.delta = 0.12; });
    const pill = fixture.nativeElement.querySelector(".pill");
    expect(pill).not.toBeNull();
    expect(pill.classList.contains("pill--up")).toBe(true);
    expect(pill.classList.contains("pill--down")).toBe(false);
    expect(pill.textContent).toContain("▲");
  });

  it("renders a red pill with ▼ for negative delta", () => {
    const fixture = mount((h) => { h.delta = -0.08; });
    const pill = fixture.nativeElement.querySelector(".pill");
    expect(pill.classList.contains("pill--down")).toBe(true);
    expect(pill.textContent).toContain("▼");
  });

  it("shows 'vs <previous> last period' subline when previous is provided", () => {
    const fixture = mount((h) => { h.previous = 1000; h.prefix = "E£"; });
    expect(fixture.nativeElement.querySelector(".sub").textContent.trim()).toContain("vs E£1,000 last period");
  });

  it("falls back to subtext when previous is absent", () => {
    const fixture = mount((h) => { h.subtext = "across 42 orders"; });
    expect(fixture.nativeElement.querySelector(".sub").textContent.trim()).toBe("across 42 orders");
  });

  it("renders no subline when both previous and subtext are absent", () => {
    const fixture = mount(() => { /* defaults */ });
    expect(fixture.nativeElement.querySelector(".sub")).toBeNull();
  });

  it("renders prefix and suffix around the value", () => {
    const fixture = mount((h) => { h.prefix = "E£"; h.suffix = "%"; h.value = 12.5; h.format = "1.1-1"; });
    const valueEl = fixture.nativeElement.querySelector(".value");
    expect(valueEl.querySelector(".prefix").textContent).toBe("E£");
    expect(valueEl.querySelector(".suffix").textContent).toBe("%");
    expect(valueEl.textContent).toContain("12.5");
  });
});
