import { Routes } from "@angular/router";
import { authGuard, guestGuard } from "./core/auth.guard";

export const routes: Routes = [
  {
    path: "",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/landing/landing/landing.component").then((m) => m.LandingComponent),
    pathMatch: "full",
  },
  {
    path: "login",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/auth/login/login.component").then((m) => m.LoginComponent),
  },
  {
    path: "register",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/auth/register/register.component").then((m) => m.RegisterComponent),
  },
  {
    path: "forgot-password",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/auth/forgot-password/forgot-password.component").then((m) => m.ForgotPasswordComponent),
  },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () => import("./shared/app-shell/app-shell.component").then((m) => m.AppShellComponent),
    children: [
      { path: "dashboard", redirectTo: "dashboard/facebook", pathMatch: "full" },
      {
        path: "dashboard/shopify",
        loadComponent: () =>
          import("./features/dashboard/shopify-dashboard/shopify-dashboard.component").then((m) => m.ShopifyDashboardComponent),
      },
      {
        path: "dashboard/shopify/orders",
        loadComponent: () =>
          import("./features/dashboard/shopify-orders/shopify-orders.component").then((m) => m.ShopifyOrdersComponent),
      },
      {
        path: "dashboard/:platform",
        loadComponent: () =>
          import("./features/dashboard/dashboard/dashboard.component").then((m) => m.DashboardComponent),
      },
      {
        path: "creatives",
        loadComponent: () =>
          import("./features/creatives/creative-library/creative-library.component").then((m) => m.CreativeLibraryComponent),
      },
      {
        path: "creatives/:id",
        loadComponent: () =>
          import("./features/creatives/creative-diagnosis/creative-diagnosis.component").then((m) => m.CreativeDiagnosisComponent),
      },
      {
        path: "connections",
        loadComponent: () => import("./features/connections/connections/connections.component").then((m) => m.ConnectionsComponent),
      },
    ],
  },
  {
    path: "guide",
    loadComponent: () => import("./features/guide/guide/guide.component").then((m) => m.GuideComponent),
  },
  { path: "**", redirectTo: "" },
];
