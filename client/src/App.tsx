import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/components/auth-context";
import { ProtectedLayout } from "@/components/protected-layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import VehiclesPage from "@/pages/vehicles/list";
import NewVehiclePage from "@/pages/vehicles/new";
import EditVehiclePage from "@/pages/vehicles/edit";
import VehicleDetailPage from "@/pages/vehicles/detail";
import RegistrationsPage from "@/pages/registrations";
import DocumentsPage from "@/pages/documents";
import SearchPage from "@/pages/search";
import ReportsPage from "@/pages/reports";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/new" element={<NewVehiclePage />} />
          <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
          <Route path="/vehicles/:id/edit" element={<EditVehiclePage />} />
          <Route path="/registrations" element={<RegistrationsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
