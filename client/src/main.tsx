import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { BrandProvider } from "@/lib/brand-context";
import { ToastProvider } from "@/lib/toast-context";
import { AuthProvider } from "@/components/auth-context";
import { ProtectedLayout } from "@/components/protected-layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import VehiclesPage from "@/pages/vehicles/list";
import NewVehiclePage from "@/pages/vehicles/new";
import EditVehiclePage from "@/pages/vehicles/edit";
import VehicleDetailPage from "@/pages/vehicles/detail";
import DriversPage from "@/pages/drivers/list";
import DriverDetailPage from "@/pages/drivers/detail";
import RegistrationsPage from "@/pages/registrations";
import RegistrationHistoryPage from "@/pages/registrations/history";
import InsurancesPage from "@/pages/insurances";
import DocumentsPage from "@/pages/documents";
import SearchPage from "@/pages/search";
import ReportsPage from "@/pages/reports";
import AuditLogsPage from "@/pages/audit";
import UsersPage from "@/pages/admin/users";
import NotificationsPage from "@/pages/notifications";
import RolesPage from "@/pages/admin/roles";
import SettingsPage from "@/pages/admin/settings";
import ProfilePage from "@/pages/profile";
import "./index.css";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "vehicles", element: <VehiclesPage /> },
      { path: "vehicles/new", element: <NewVehiclePage /> },
      { path: "vehicles/:id", element: <VehicleDetailPage /> },
      { path: "vehicles/:id/edit", element: <EditVehiclePage /> },
      { path: "drivers", element: <DriversPage /> },
      { path: "drivers/:id", element: <DriverDetailPage /> },
      { path: "registrations", element: <RegistrationsPage /> },
      { path: "registrations/:id/history", element: <RegistrationHistoryPage /> },
      { path: "insurances", element: <InsurancesPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "audit", element: <AuditLogsPage /> },
      { path: "admin/users", element: <UsersPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "admin/roles", element: <RolesPage /> },
      { path: "admin/settings", element: <SettingsPage /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrandProvider>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </BrandProvider>
  </React.StrictMode>
);
