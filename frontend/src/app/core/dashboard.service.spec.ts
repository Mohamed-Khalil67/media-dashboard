import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { DashboardService } from "./dashboard.service";
import { environment } from "../../environments/environment";

describe("DashboardService HTTP contract", () => {
  let svc: DashboardService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/metrics`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DashboardService],
    });
    svc = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("getOverview attaches the range query", async () => {
    const pending = svc.getOverview("7d");
    const req = http.expectOne((r) => r.url === `${base}/overview` && r.params.get("range") === "7d");
    expect(req.request.method).toBe("GET");
    req.flush({ spend: 10, revenue: 30, roas: 3, orders: 1, aov: 30, impressions: 0, clicks: 0, ctr: 0, delta: { spend: 0, revenue: 0, roas: 0, orders: 0 }, previous: { spend: 0, revenue: 0, roas: 0, orders: 0 } });
    await pending;
  });

  it("getOverview forwards custom date range when both since+until are present", async () => {
    const pending = svc.getOverview("7d", { since: "2026-06-01", until: "2026-06-07" });
    const req = http.expectOne((r) => r.params.get("since") === "2026-06-01" && r.params.get("until") === "2026-06-07");
    req.flush({ spend: 0, revenue: 0, roas: 0, orders: 0, aov: 0, impressions: 0, clicks: 0, ctr: 0, delta: { spend: 0, revenue: 0, roas: 0, orders: 0 }, previous: { spend: 0, revenue: 0, roas: 0, orders: 0 } });
    await pending;
  });

  it("getOverview forwards connectionId + platform", async () => {
    const pending = svc.getOverview("7d", { connectionId: "c_1", platform: "facebook" });
    const req = http.expectOne((r) => r.params.get("connectionId") === "c_1" && r.params.get("platform") === "facebook");
    req.flush({ spend: 0, revenue: 0, roas: 0, orders: 0, aov: 0, impressions: 0, clicks: 0, ctr: 0, delta: { spend: 0, revenue: 0, roas: 0, orders: 0 }, previous: { spend: 0, revenue: 0, roas: 0, orders: 0 } });
    await pending;
  });

  it("getCampaigns unwraps the { campaigns: [...] } envelope", async () => {
    const pending = svc.getCampaigns("7d");
    const req = http.expectOne((r) => r.url === `${base}/campaigns`);
    req.flush({ campaigns: [{ campaignId: "c1", name: "C1", spend: 50 }] });
    const out = await pending;
    expect(out).toHaveLength(1);
    expect(out[0].campaignId).toBe("c1");
  });

  it("getShopifyOrdersList serializes optional filters", async () => {
    const pending = svc.getShopifyOrdersList({ connectionId: "shop_1", status: "paid", q: "alice", limit: 25 });
    const req = http.expectOne((r) =>
      r.url === `${base}/shopify/orders` &&
      r.params.get("connectionId") === "shop_1" &&
      r.params.get("status") === "paid" &&
      r.params.get("q") === "alice" &&
      r.params.get("limit") === "25"
    );
    req.flush({ orders: [], nextCursor: null });
    await pending;
  });

  it("getShopifyOrdersSummary defaults to no params when none supplied", async () => {
    const pending = svc.getShopifyOrdersSummary();
    const req = http.expectOne((r) => r.url === `${base}/shopify/orders-summary` && r.params.keys().length === 0);
    req.flush({ orders: 0, revenue: 0, avgItemsPerOrder: 0 });
    await pending;
  });
});
