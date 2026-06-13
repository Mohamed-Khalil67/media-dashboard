import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { App } from "./app";

describe("App root", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // App uses <router-outlet>, so the test bed needs a real Router context
      // even though we never navigate. An empty route table is enough.
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it("instantiates without errors", () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it("renders the router outlet and the global status bar", async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("router-outlet")).not.toBeNull();
    expect(root.querySelector("app-status-bar")).not.toBeNull();
  });
});
