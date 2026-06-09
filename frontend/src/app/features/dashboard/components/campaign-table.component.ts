import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { CampaignAggregate } from "../../../core/models/metrics.models";

type SortKey = "name" | "platform" | "spend" | "revenue" | "roas" | "frequency";

@Component({
  selector: "app-campaign-table",
  imports: [CurrencyPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      <header>
        <h3>Campaigns</h3>
        <p class="muted">{{ campaigns().length }} total</p>
      </header>

      @if (campaigns().length === 0) {
        <div class="empty">No campaigns yet.</div>
      } @else {
        <table>
          <thead>
            <tr>
              <th (click)="toggleSort('name')">Campaign</th>
              <th (click)="toggleSort('platform')">Platform</th>
              <th (click)="toggleSort('spend')" class="num">Spend</th>
              <th (click)="toggleSort('revenue')" class="num">Revenue</th>
              <th (click)="toggleSort('roas')" class="num">ROAS</th>
              <th (click)="toggleSort('frequency')" class="num">Freq.</th>
            </tr>
          </thead>
          <tbody>
            @for (c of sorted(); track c.campaignId) {
              <tr>
                <td class="name">
                  <div>{{ c.name }}</div>
                  <small class="muted">{{ c.status }}</small>
                </td>
                <td><span class="badge badge--{{ c.platform }}">{{ c.platform }}</span></td>
                <td class="num">{{ c.spend | currency: "USD":"symbol":"1.0-0" }}</td>
                <td class="num">{{ c.revenue | currency: "USD":"symbol":"1.0-0" }}</td>
                <td class="num">
                  <span class="roas" [class.roas--good]="c.roas >= 2" [class.roas--bad]="c.roas < 1 && c.spend > 0">
                    {{ c.roas | number: "1.2-2" }}x
                  </span>
                </td>
                <td class="num">{{ c.frequency | number: "1.2-2" }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </article>
  `,
  styles: [`
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1rem 1.25rem; }
    header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .5rem; }
    h3 { margin: 0; font-size: 1rem; }
    .muted { color: #94a3b8; font-size: .8rem; margin: 0; }
    .empty { text-align: center; color: #64748b; padding: 2rem 1rem; font-size: .9rem; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th { text-align: left; background: #f8fafc; color: #475569; font-weight: 500; padding: .5rem .75rem; cursor: pointer; user-select: none; }
    th.num { text-align: right; }
    td { padding: .65rem .75rem; border-bottom: 1px solid #e2e8f0; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.name div { font-weight: 500; color: #0f172a; }
    td.name small { color: #94a3b8; text-transform: capitalize; }
    .badge { padding: .15rem .5rem; border-radius: 999px; font-size: .7rem; font-weight: 500; text-transform: capitalize; }
    .badge--facebook { background: #dbeafe; color: #1e40af; }
    .badge--tiktok   { background: #fce7f3; color: #9d174d; }
    .badge--shopify  { background: #dcfce7; color: #166534; }
    .roas { font-weight: 500; }
    .roas--good { color: #16a34a; }
    .roas--bad  { color: #dc2626; }
  `],
})
export class CampaignTableComponent {
  readonly campaigns = input.required<CampaignAggregate[]>();
  readonly sortKey = signal<SortKey>("spend");
  readonly sortDir = signal<"asc" | "desc">("desc");

  readonly sorted = computed(() => {
    const list = [...this.campaigns()];
    const key = this.sortKey();
    const dir = this.sortDir() === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return list;
  });

  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === "name" || key === "platform" ? "asc" : "desc");
    }
  }
}
