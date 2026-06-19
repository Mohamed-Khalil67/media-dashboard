import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { AlertsService } from "./alerts.service";
import { environment } from "../../environments/environment";

describe("AlertsService HTTP contract", () => {
  let svc: AlertsService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/alerts`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AlertsService],
    });
    svc = TestBed.inject(AlertsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("list unwraps the { alerts: [...] } envelope and forwards filters", async () => {
    const pending = svc.list("c_1", "facebook");
    const req = http.expectOne((r) => r.url === base && r.params.get("connectionId") === "c_1" && r.params.get("platform") === "facebook");
    req.flush({ alerts: [{ ruleId: "r1", campaignName: "C1", metric: "roas", operator: "lt", threshold: 1, actualValue: 0.5 }] });
    const out = await pending;
    expect(out).toHaveLength(1);
  });

  it("list omits params when no filters supplied", async () => {
    const pending = svc.list();
    const req = http.expectOne((r) => r.url === base && r.params.keys().length === 0);
    req.flush({ alerts: [] });
    await pending;
  });

  it("listRules unwraps the { rules: [...] } envelope", async () => {
    const pending = svc.listRules();
    const req = http.expectOne(`${base}/rules`);
    req.flush({ rules: [{ id: "r1", metric: "roas", operator: "lt", threshold: 1, enabled: true }] });
    const out = await pending;
    expect(out).toHaveLength(1);
  });

  it("createRule POSTs the metric/operator/threshold triple", async () => {
    const pending = svc.createRule("roas", "lt", 1.5);
    const req = http.expectOne(`${base}/rules`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ metric: "roas", operator: "lt", threshold: 1.5 });
    req.flush({ rule: { id: "r_new", metric: "roas", operator: "lt", threshold: 1.5, enabled: true } });
    const out = await pending;
    expect(out.id).toBe("r_new");
  });

  it("updateRule PATCHes only the supplied fields", async () => {
    const pending = svc.updateRule("r_1", { enabled: false });
    const req = http.expectOne(`${base}/rules/r_1`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ enabled: false });
    req.flush({ rule: { id: "r_1", metric: "roas", operator: "lt", threshold: 1, enabled: false } });
    const out = await pending;
    expect(out.enabled).toBe(false);
  });

  it("deleteRule sends DELETE and resolves void", async () => {
    const pending = svc.deleteRule("r_1");
    const req = http.expectOne(`${base}/rules/r_1`);
    expect(req.request.method).toBe("DELETE");
    req.flush({ ok: true });
    await expect(pending).resolves.toBeUndefined();
  });
});
