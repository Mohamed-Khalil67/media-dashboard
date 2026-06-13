import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { AdminService } from "./admin.service";
import { environment } from "../../environments/environment";

describe("AdminService HTTP contract", () => {
  let svc: AdminService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/admin`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdminService],
    });
    svc = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("listUsers unwraps the { users: [...] } envelope", async () => {
    const pending = svc.listUsers();
    const req = http.expectOne(`${base}/users`);
    expect(req.request.method).toBe("GET");
    req.flush({
      users: [
        { id: "u1", email: "a@x.com", name: null, role: "admin", disabled: false, createdAt: "2026-01-01", firebaseUid: "fb1" },
      ],
    });
    const out = await pending;
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe("a@x.com");
  });

  it("createUser POSTs to /users and unwraps the user from the envelope", async () => {
    const pending = svc.createUser({ email: "new@x.com", password: "validPass1", role: "client" });
    const req = http.expectOne(`${base}/users`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toMatchObject({ email: "new@x.com", role: "client" });
    req.flush({
      user: { id: "u_new", email: "new@x.com", name: null, role: "client", disabled: false, createdAt: "2026-06-01", firebaseUid: "fb_new" },
    });
    const user = await pending;
    expect(user.email).toBe("new@x.com");
    expect(user.id).toBe("u_new");
  });

  it("updateUser PATCHes the right URL and unwraps the user", async () => {
    const pending = svc.updateUser("u_x", { role: "media_buyer" });
    const req = http.expectOne(`${base}/users/u_x`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ role: "media_buyer" });
    req.flush({
      user: { id: "u_x", email: "x@x.com", name: null, role: "media_buyer", disabled: false, createdAt: "2026-01-01", firebaseUid: "fb_x" },
    });
    const out = await pending;
    expect(out.role).toBe("media_buyer");
  });

  it("setPassword POSTs to /users/:id/password and resolves void", async () => {
    const pending = svc.setPassword("u_x", "brandNewPass1");
    const req = http.expectOne(`${base}/users/u_x/password`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ password: "brandNewPass1" });
    req.flush({ ok: true });
    await expect(pending).resolves.toBeUndefined();
  });

  it("deleteUser sends DELETE and resolves void", async () => {
    const pending = svc.deleteUser("u_x");
    const req = http.expectOne(`${base}/users/u_x`);
    expect(req.request.method).toBe("DELETE");
    req.flush({ ok: true });
    await expect(pending).resolves.toBeUndefined();
  });

  it("previewDelete GETs /users/:id/delete-preview and returns user + cascade", async () => {
    const pending = svc.previewDelete("u_target");
    const req = http.expectOne(`${base}/users/u_target/delete-preview`);
    expect(req.request.method).toBe("GET");
    req.flush({
      user: { id: "u_target", email: "preview@x.com", name: "Preview", role: "media_buyer" },
      cascade: { connections: 2, campaigns: 15, insights: 420, syncRuns: 30, shopifyOrders: 0, alertRules: 1, workspaceMembers: 1 },
    });
    const out = await pending;
    expect(out.user.role).toBe("media_buyer");
    expect(out.cascade.insights).toBe(420);
  });
});
