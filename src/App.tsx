import { Navigate, Route, Routes } from "react-router-dom";
import EmployeePage from "./pages/EmployeePage";
import AdminLayout from "./pages/AdminLayout";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminInstancesPage from "./pages/AdminInstancesPage";
import AdminExportPage from "./pages/AdminExportPage";
import AdminAttendanceSheetsPage from "./pages/AdminAttendanceSheetsPage";
import { PendingPage } from "./pages/PendingPage";

/**
 * Routes:
 * - /app        Zaměstnanec (web i Android WebView)
 * - /admin      Admin UI (layout + podstránky)
 * - /admin/login
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />

      <Route path="/app" element={<EmployeePage />} />
      <Route path="/pending" element={<PendingPage />} />

      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="instances" replace />} />
        <Route path="instances" element={<AdminInstancesPage />} />
        <Route path="dochazka" element={<AdminAttendanceSheetsPage />} />
        <Route path="export" element={<AdminExportPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
