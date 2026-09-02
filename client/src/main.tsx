import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { BrandProvider } from "@/lib/brand-context";
import { ToastProvider } from "@/lib/toast-context";
import { AuthProvider } from "@/components/auth-context";
import { ProtectedLayout } from "@/components/protected-layout";
import LoginPage from "@/pages/login";
import "./index.css";

// Route-level code splitting: each page (and its dependency tree — notably
// echarts for reports/dashboard) loads only when visited. Login stays eager
// so the very first paint of the app is unchanged.
const DashboardPage = React.lazy(() => import("@/pages/dashboard"));
const VehiclesPage = React.lazy(() => import("@/pages/vehicles/list"));
const NewVehiclePage = React.lazy(() => import("@/pages/vehicles/new"));
const EditVehiclePage = React.lazy(() => import("@/pages/vehicles/edit"));
const VehicleDetailPage = React.lazy(() => import("@/pages/vehicles/detail"));
const DriversPage = React.lazy(() => import("@/pages/drivers/list"));
const DriverDetailPage = React.lazy(() => import("@/pages/drivers/detail"));
const RegistrationsPage = React.lazy(() => import("@/pages/registrations"));
const RegistrationHistoryPage = React.lazy(() => import("@/pages/registrations/history"));
const InsurancesPage = React.lazy(() => import("@/pages/insurances"));
const InsuranceHistoryPage = React.lazy(() => import("@/pages/insurances/history"));
const DocumentsPage = React.lazy(() => import("@/pages/documents"));
const SearchPage = React.lazy(() => import("@/pages/search"));
const ReportsPage = React.lazy(() => import("@/pages/reports"));
const AuditLogsPage = React.lazy(() => import("@/pages/audit"));
const UsersPage = React.lazy(() => import("@/pages/admin/users"));
const NotificationsPage = React.lazy(() => import("@/pages/notifications"));
const RolesPage = React.lazy(() => import("@/pages/admin/roles"));
const SettingsPage = React.lazy(() => import("@/pages/admin/settings"));
const ProfilePage = React.lazy(() => import("@/pages/profile"));

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
      { path: "insurances/:id/history", element: <InsuranceHistoryPage /> },
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
