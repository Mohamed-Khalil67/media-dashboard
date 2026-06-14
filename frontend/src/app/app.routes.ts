import { Routes } from "@angular/router";
import { authGuard, guestGuard } from "./core/auth.guard";
import { blockClientGuard, roleGuard } from "./core/role.guard";

export const routes: Routes = [
  {
    path: "login",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/auth/login.component").then((m) => m.LoginComponent),
  },
  {
    path: "register",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/auth/register.component").then((m) => m.RegisterComponent),
  },
  {
    path: "forgot-password",
    canActivate: [guestGuard],
    loadComponent: () => import("./features/auth/forgot-password.component").then((m) => m.ForgotPasswordComponent),
  },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () => import("./shared/app-shell.component").then((m) => m.AppShellComponent),
    children: [
      { path: "dashboard", redirectTo: "dashboard/facebook", pathMatch: "full" },
      {
        path: "dashboard/shopify",
        loadComponent: () =>
          import("./features/dashboard/shopify-dashboard.component").then((m) => m.ShopifyDashboardComponent),
      },
      {
        path: "dashboard/shopify/orders",
        loadComponent: () =>
          import("./features/dashboard/shopify-orders.component").then((m) => m.ShopifyOrdersComponent),
      },
      {
        path: "dashboard/:platform",
        loadComponent: () =>
          import("./features/dashboard/dashboard.component").then((m) => m.DashboardComponent),
      },
      {
        path: "connections",
        canActivate: [blockClientGuard],
        loadComponent: () => import("./features/connections/connections.component").then((m) => m.ConnectionsComponent),
      },
      {
        path: "alerts",
        canActivate: [blockClientGuard],
        loadComponent: () => import("./features/alerts/alerts.component").then((m) => m.AlertsComponent),
      },
      {
        path: "workspaces",
        canActivate: [blockClientGuard],
        loadComponent: () => import("./features/workspaces/workspaces.component").then((m) => m.WorkspacesComponent),
      },
      {
        path: "admin/access",
        canActivate: [roleGuard("admin")],
        loadComponent: () => import("./features/admin/admin-access.component").then((m) => m.AdminAccessComponent),
      },
      { path: "", redirectTo: "dashboard/facebook", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "" },
];
