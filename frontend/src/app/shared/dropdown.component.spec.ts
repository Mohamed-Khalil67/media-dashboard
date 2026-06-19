import { Component } from "@angular/core";
import { TestBed, ComponentFixture } from "@angular/core/testing";
import { DropdownComponent } from "./dropdown.component";

@Component({
  imports: [DropdownComponent],
  template: `
    <app-dropdown [align]="align">
      <span trigger>Open me</span>
      <div menu>
        <button (click)="onMenuClick()">Click in menu</button>
      </div>
    </app-dropdown>
    <button id="outside" (click)="onOutside()">Outside</button>
  `,
})
class HostComponent {
  align: "left" | "right" = "left";
  onMenuClick(): void {}
  onOutside(): void {}
}

describe("DropdownComponent", () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    fixture = TestBed.configureTestingModule({ imports: [HostComponent] }).createComponent(HostComponent);
    fixture.detectChanges();
  });

  function findTrigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(".dd-trigger") as HTMLButtonElement;
  }
  function findMenu(): HTMLElement | null {
    return fixture.nativeElement.querySelector(".dd-menu");
  }

  it("starts closed", () => {
    expect(findMenu()).toBeNull();
  });

  it("toggles open when the trigger is clicked", () => {
    findTrigger().click();
    fixture.detectChanges();
    expect(findMenu()).not.toBeNull();
  });

  it("toggles closed when the trigger is clicked twice", () => {
    findTrigger().click();
    fixture.detectChanges();
    findTrigger().click();
    fixture.detectChanges();
    expect(findMenu()).toBeNull();
  });

  it("closes when a click happens outside the dropdown", () => {
    findTrigger().click();
    fixture.detectChanges();
    expect(findMenu()).not.toBeNull();

    const outside = fixture.nativeElement.querySelector("#outside") as HTMLButtonElement;
    outside.click();
    fixture.detectChanges();
    expect(findMenu()).toBeNull();
  });

  it("stays open when a click happens inside the menu", () => {
    findTrigger().click();
    fixture.detectChanges();
    const menuButton = fixture.nativeElement.querySelector(".dd-menu button") as HTMLButtonElement;
    menuButton.click();
    fixture.detectChanges();
    expect(findMenu()).not.toBeNull();
  });

  it("applies the .right class when align='right'", () => {
    // Recreate the fixture with align='right' set before first change detection
    // to avoid an ExpressionChangedAfterItHasBeenChecked error.
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.align = "right";
    f.detectChanges();
    const trigger = f.nativeElement.querySelector(".dd-trigger") as HTMLButtonElement;
    trigger.click();
    f.detectChanges();
    const menu = f.nativeElement.querySelector(".dd-menu") as HTMLElement;
    expect(menu.classList.contains("right")).toBe(true);
  });
});
