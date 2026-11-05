import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, contentChild, inject, input, signal } from "@angular/core";

@Component({
  selector: "app-dropdown",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./dropdown.component.html",
  styleUrl: "./dropdown.component.css",
})
export class DropdownComponent implements OnInit, OnDestroy {
  readonly align = input<"left" | "right">("left");
  readonly open = signal(false);
  @ViewChild("root", { static: true }) root!: ElementRef<HTMLElement>;

  private clickOutsideHandler = (e: MouseEvent) => {
    if (!this.root.nativeElement.contains(e.target as Node)) this.open.set(false);
  };

  ngOnInit(): void {
    document.addEventListener("click", this.clickOutsideHandler, true);
  }
  ngOnDestroy(): void {
    document.removeEventListener("click", this.clickOutsideHandler, true);
  }

  toggle(): void { this.open.update((v) => !v); }
  close(): void { this.open.set(false); }
  onMenuClick(_e: MouseEvent): void { /* keep open; consumers close manually */ }
}
