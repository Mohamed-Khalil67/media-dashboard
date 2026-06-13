import { CanActivateFn, Router } from "@angular/router";
import { effect, inject } from "@angular/core";
import { AuthService } from "./auth.service";

/**
 * Waits for the first Firebase auth state hydration before deciding.
 * If hydrated and signed in → allow. Otherwise → redirect to /login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return new Promise<boolean>((resolve) => {
    if (auth.authReady()) {
      if (auth.isLoggedIn()) return resolve(true);
      router.navigate(["/login"]);
      return resolve(false);
    }
    const ref = effect(() => {
      if (!auth.authReady()) return;
      // Order matters: destroy BEFORE resolve so a subsequent signal change
      // can't re-fire this effect and call resolve() a second time.
      ref.destroy();
      if (auth.isLoggedIn()) return resolve(true);
      router.navigate(["/login"]);
      resolve(false);
    });
  });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return new Promise<boolean>((resolve) => {
    if (auth.authReady()) {
      if (!auth.isLoggedIn()) return resolve(true);
      router.navigate(["/dashboard"]);
      return resolve(false);
    }
    const ref = effect(() => {
      if (!auth.authReady()) return;
      // Order matters: destroy BEFORE resolve. See note in authGuard above.
      ref.destroy();
      if (!auth.isLoggedIn()) return resolve(true);
      router.navigate(["/dashboard"]);
      resolve(false);
    });
  });
};
