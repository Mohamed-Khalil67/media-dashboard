import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { AuthService } from "./auth.service";
import { ToastService } from "./toast.service";

/** Attaches the JWT to outgoing requests and, on 401, logs the user out. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const token = auth.token();

  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((err) => {
      if (err.status === 401 && auth.isLoggedIn()) {
        toast.error("Session expired. Please sign in again.");
        auth.logout();
      } else if (err.status >= 500) {
        toast.error("Something went wrong on our end. Please try again.");
      }
      return throwError(() => err);
    })
  );
};
