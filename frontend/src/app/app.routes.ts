import { Routes } from "@angular/router";
import { authGuard, guestGuard } from "./core/auth.guard";

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
    path: "",
    canActivate: [authGuard],
    loadComponent: () => import("./shared/app-shell.component").then((m) => m.AppShellComponent),
    children: [
      {
        path: "dashboard",
        loadComponent: () => import("./features/dashboard/dashboard.component").then((m) => m.DashboardComponent),
      },
      {
        path: "connections",
        loadComponent: () => import("./features/connections/connections.component").then((m) => m.ConnectionsComponent),
      },
      {
        path: "alerts",
        loadComponent: () => import("./features/alerts/alerts.component").then((m) => m.AlertsComponent),
      },
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "" },
];
