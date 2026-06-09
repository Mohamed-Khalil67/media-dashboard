import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, contentChild, inject, input, signal } from "@angular/core";

@Component({
  selector: "app-dropdown",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dd" #root>
      <button class="dd-trigger" (click)="toggle()" [class.open]="open()">
        <ng-content select="[trigger]" />
        <span class="caret">▾</span>
      </button>
      @if (open()) {
        <div class="dd-menu" [class.right]="align() === 'right'" (click)="onMenuClick($event)">
          <ng-content select="[menu]" />
        </div>
      }
    </div>
  `,
  styles: [`
    .dd { position: relative; display: inline-block; }
    .dd-trigger {
      display: flex; align-items: center; gap: .5rem;
      background: var(--card-bg); border: 1px solid var(--card-bd); color: var(--text);
      padding: .45rem .85rem; border-radius: .5rem; cursor: pointer; font-size: .85rem;
      transition: border-color .12s;
    }
    .dd-trigger:hover, .dd-trigger.open { border-color: #4f46e5; }
    .caret { color: var(--muted); font-size: .65rem; }
    .dd-menu {
      position: absolute; top: calc(100% + .35rem); left: 0; z-index: 50;
      background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: .5rem;
      box-shadow: var(--shadow); min-width: 14rem; padding: .35rem; color: var(--text);
    }
    .dd-menu.right { left: auto; right: 0; }
  `],
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
