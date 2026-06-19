import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter, Router } from "@angular/router";
import { AuthService } from "./auth.service";
import { FIREBASE_AUTH_GATEWAY, FirebaseAuthGateway } from "./firebase-auth.gateway";
import { environment } from "../../environments/environment";

function makeStubGateway(): FirebaseAuthGateway & {
  __triggerAuthChange: (u: any) => void;
  __callbacks: Array<(u: any) => void>;
  signInSpy: ReturnType<typeof vi.fn>;
  signOutSpy: ReturnType<typeof vi.fn>;
  sendPasswordResetSpy: ReturnType<typeof vi.fn>;
} {
  const callbacks: Array<(u: any) => void> = [];
  const signInSpy = vi.fn().mockResolvedValue(undefined);
  const signOutSpy = vi.fn().mockResolvedValue(undefined);
  const sendPasswordResetSpy = vi.fn().mockResolvedValue(undefined);
  return {
    currentUser: null,
    onAuthStateChanged(cb) { callbacks.push(cb); },
    signIn: signInSpy,
    register: vi.fn().mockResolvedValue(undefined),
    signOut: signOutSpy,
    sendPasswordResetEmail: sendPasswordResetSpy,
    getIdToken: vi.fn().mockResolvedValue("stub-token"),
    __triggerAuthChange: (u: any) => callbacks.forEach((cb) => cb(u)),
    __callbacks: callbacks,
    signInSpy,
    signOutSpy,
    sendPasswordResetSpy,
  };
}

describe("AuthService", () => {
  let svc: AuthService;
  let http: HttpTestingController;
  let gateway: ReturnType<typeof makeStubGateway>;
  const base = environment.apiUrl;

  beforeEach(() => {
    localStorage.clear();
    gateway = makeStubGateway();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: FIREBASE_AUTH_GATEWAY, useValue: gateway },
        AuthService,
      ],
    });
    svc = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("subscribes to onAuthStateChanged exactly once on construction", () => {
    expect(gateway.__callbacks).toHaveLength(1);
  });

  it("clears cached user + localStorage on sign-out callback", () => {
    localStorage.setItem("auth.user", JSON.stringify({ id: "u_old", email: "old@x.com" }));
    gateway.__triggerAuthChange(null);
    expect(svc.user()).toBeNull();
    expect(localStorage.getItem("auth.user")).toBeNull();
  });

  it("refreshMe writes the unwrapped user into the signal AND localStorage", async () => {
    const pending = svc.refreshMe();
    const req = http.expectOne(`${base}/auth/me`);
    expect(req.request.method).toBe("GET");
    req.flush({ user: { id: "u1", email: "me@x.com", name: "Me", createdAt: "2026-01-01" } });
    await pending;
    expect(svc.user()?.email).toBe("me@x.com");
    expect(localStorage.getItem("auth.user")).toContain("me@x.com");
  });

  describe("logout — ephemeral wipe", () => {
    it("calls POST /auth/logout BEFORE Firebase signOut (server wipes data first)", async () => {
      localStorage.setItem("auth.user", "x");
      svc.user.set({ id: "u", email: "u@x.com", name: null } as any);
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

      const order: string[] = [];
      gateway.signOutSpy.mockImplementation(async () => { order.push("firebase-signout"); });

      const pending = svc.logout();
      const req = http.expectOne(`${base}/auth/logout`);
      expect(req.request.method).toBe("POST");
      order.push("backend-logout");
      req.flush({ ok: true });

      await pending;

      // Backend wipe must happen first; Firebase sign-out follows.
      expect(order).toEqual(["backend-logout", "firebase-signout"]);
      expect(gateway.signOutSpy).toHaveBeenCalledTimes(1);
      expect(svc.user()).toBeNull();
      expect(localStorage.getItem("auth.user")).toBeNull();
      expect(navSpy).toHaveBeenCalledWith(["/"]);
    });

    it("still signs out of Firebase even if the backend wipe call fails", async () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

      const pending = svc.logout();
      const req = http.expectOne(`${base}/auth/logout`);
      req.error(new ProgressEvent("error"), { status: 500, statusText: "boom" });

      await pending;

      expect(gateway.signOutSpy).toHaveBeenCalledTimes(1);
      expect(svc.user()).toBeNull();
      expect(navSpy).toHaveBeenCalledWith(["/"]);
    });
  });

  it("login delegates to the gateway with the right args", async () => {
    await svc.login("u@x.com", "secret");
    expect(gateway.signInSpy).toHaveBeenCalledWith("u@x.com", "secret");
  });

  it("token() returns whatever the gateway resolves (Bearer header shim)", async () => {
    const t = await svc.token();
    expect(t).toBe("stub-token");
  });

  it("requestPasswordResetWithVerification POSTs and surfaces the result", async () => {
    const pending = svc.requestPasswordResetWithVerification("user@x.com");
    const req = http.expectOne(`${base}/auth/password-reset`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ email: "user@x.com" });
    req.flush({ emailSent: true, devLink: "https://auth/reset?code=abc" });
    const out = await pending;
    expect(out.emailSent).toBe(true);
    expect(out.devLink).toBe("https://auth/reset?code=abc");
  });
});
