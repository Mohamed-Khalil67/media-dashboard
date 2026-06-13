import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, from, switchMap, throwError } from "rxjs";
import { AuthService } from "./auth.service";
import { StatusBarService } from "./status-bar.service";

/** Attaches the Firebase ID token to outgoing requests and, on 401, logs the user out. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const status = inject(StatusBarService);

  return from(auth.token()).pipe(
    switchMap((token) => {
      const authed = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authed).pipe(
        catchError((err) => {
          const backendError = err?.error?.error;
          if (err.status === 403 && backendError === "access_denied") {
            const msg = err?.error?.message ?? "This email isn't authorized to access this workspace.";
            status.error(msg);
            auth.signOutAndRedirectDenied();
          } else if (err.status === 401 && auth.isLoggedIn()) {
            status.error("Session expired. Please sign in again.");
            auth.logout();
          } else if (err.status >= 500) {
            status.error("Something went wrong on our end. Please try again.");
          }
          return throwError(() => err);
        }),
      );
    }),
  );
};
