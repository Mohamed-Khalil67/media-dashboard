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

  it("authReady flips to true after the first auth-state callback fires", () => {
    expect(svc.authReady()).toBe(false);
    gateway.__triggerAuthChange(null);
    expect(svc.authReady()).toBe(true);
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
    req.flush({
      user: { id: "u1", email: "me@x.com", name: "Me", role: "admin", createdAt: "2026-01-01" },
    });
    await pending;
    expect(svc.user()?.email).toBe("me@x.com");
    expect(svc.user()?.role).toBe("admin");
    expect(localStorage.getItem("auth.user")).toContain("me@x.com");
  });

  it("checkMigration GETs /auth/check-migration with the URL-encoded email", async () => {
    const pending = svc.checkMigration("foo+bar@example.com");
    const req = http.expectOne(`${base}/auth/check-migration?email=${encodeURIComponent("foo+bar@example.com")}`);
    expect(req.request.method).toBe("GET");
    req.flush({ exists: true, pendingMigration: true });
    const out = await pending;
    expect(out).toEqual({ exists: true, pendingMigration: true });
  });

  it("requestPasswordResetWithVerification surfaces emailSent + devLink", async () => {
    const pending = svc.requestPasswordResetWithVerification("user@x.com");
    const req = http.expectOne(`${base}/auth/password-reset`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ email: "user@x.com" });
    req.flush({ emailSent: true, devLink: "https://auth/reset?code=abc" });
    const out = await pending;
    expect(out.emailSent).toBe(true);
    expect(out.devLink).toBe("https://auth/reset?code=abc");
  });

  it("requestPasswordResetWithVerification surfaces needsRegistration flag", async () => {
    const pending = svc.requestPasswordResetWithVerification("never@signed.in");
    const req = http.expectOne(`${base}/auth/password-reset`);
    req.flush({ emailSent: true, needsRegistration: true });
    const out = await pending;
    expect(out.needsRegistration).toBe(true);
  });

  it("login delegates to the gateway with the right args", async () => {
    await svc.login("u@x.com", "secret");
    expect(gateway.signInSpy).toHaveBeenCalledWith("u@x.com", "secret");
  });

  it("logout clears state and navigates to /login", async () => {
    localStorage.setItem("auth.user", "x");
    svc.user.set({ id: "u", email: "u@x.com", name: null, role: "client" } as any);
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

    await svc.logout();

    expect(gateway.signOutSpy).toHaveBeenCalledTimes(1);
    expect(svc.user()).toBeNull();
    expect(localStorage.getItem("auth.user")).toBeNull();
    expect(navSpy).toHaveBeenCalledWith(["/login"]);
  });

  it("signOutAndRedirectDenied navigates to /login with denied=1", async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

    await svc.signOutAndRedirectDenied();

    expect(gateway.signOutSpy).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith(["/login"], { queryParams: { denied: 1 } });
  });

  it("token() returns whatever the gateway resolves (Bearer header shim)", async () => {
    const t = await svc.token();
    expect(t).toBe("stub-token");
  });
});
