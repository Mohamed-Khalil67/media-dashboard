import { inject, effect } from "@angular/core";
import { Router, CanActivateFn } from "@angular/router";
import { AuthService } from "./auth.service";
import { UserRole } from "./models/auth.models";

/**
 * Waits for the first Firebase auth-state hydration before deciding, then
 * runs the supplied predicate against the resolved user. Without the wait,
 * a hard refresh of a guarded route reads `auth.user()` as `null` before
 * Firebase has rehydrated, and the guard bounces the user incorrectly.
 */
function whenAuthReady(predicate: () => boolean, router: Router, auth: AuthService): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (auth.authReady()) {
      if (predicate()) return resolve(true);
      router.navigate(["/dashboard"]);
      return resolve(false);
    }
    const ref = effect(() => {
      if (!auth.authReady()) return;
      ref.destroy();
      if (predicate()) return resolve(true);
      router.navigate(["/dashboard"]);
      resolve(false);
    });
  });
}

/**
 * Route guard that requires the signed-in user to have a specific app role.
 * Non-matching users get bounced to /dashboard (a route they're allowed to see)
 * rather than to /login, so they aren't logged out for a navigation mistake.
 */
export const roleGuard = (required: UserRole): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenAuthReady(() => auth.user()?.role === required, router, auth);
};

/** Blocks clients from a route; allows everyone else through. */
export const blockClientGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenAuthReady(() => auth.user()?.role !== "client", router, auth);
};
