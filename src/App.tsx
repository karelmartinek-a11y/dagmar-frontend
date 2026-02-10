import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import EmployeePage from "./pages/EmployeePage";
import AdminLayout from "./pages/AdminLayout";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminInstancesPage from "./pages/AdminInstancesPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminExportPage from "./pages/AdminExportPage";
import AdminAttendanceSheetsPage from "./pages/AdminAttendanceSheetsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminShiftPlanPage from "./pages/AdminShiftPlanPage";
import AdminPrintsPage from "./pages/AdminPrintsPage";
import AdminPrintPreviewPage from "./pages/AdminPrintPreviewPage";
import { PendingPage } from "./pages/PendingPage";
import PortalResetPage from "./pages/PortalResetPage";

type VersionPayload = {
  frontend_commit?: string;
  backend_deploy_tag?: string;
};

function DeploymentBadge() {
  const [frontendCommit, setFrontendCommit] = useState<string | null>(null);
  const [backendCommit, setBackendCommit] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadFrontend = async () => {
      try {
        const resp = await fetch("/frontend-version.json", { cache: "no-store" });
        if (!resp.ok) return;
        const data = (await resp.json()) as VersionPayload;
        if (active) setFrontendCommit(data.frontend_commit || null);
      } catch {
        if (active) setFrontendCommit(null);
      }
    };

    const loadBackend = async () => {
      try {
        const resp = await fetch("/api/version", { cache: "no-store" });
        if (!resp.ok) return;
        const data = (await resp.json()) as VersionPayload;
        if (active) setBackendCommit(data.backend_deploy_tag || null);
      } catch {
        if (active) setBackendCommit(null);
      }
    };

    loadFrontend();
    loadBackend();

    return () => {
      active = false;
    };
  }, []);

  if (!frontendCommit && !backendCommit) {
    return null;
  }

  return (
    <div className="kb-deployment" aria-label="Informace o nasazení">
      <div>Frontend: {frontendCommit || "-"}</div>
      <div>Backend: {backendCommit || "-"}</div>
    </div>
  );
}

/**
 * Routes:
 * - /app        Zaměstnanec (web i Android WebView)
 * - /admin      Admin UI (layout + podstránky)
 * - /admin/login
 */
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/app" element={<EmployeePage />} />
        <Route path="/reset" element={<PortalResetPage />} />
        <Route path="/pending" element={<PendingPage />} />

        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="instances" replace />} />
          <Route path="instances" element={<AdminInstancesPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="dochazka" element={<AdminAttendanceSheetsPage />} />
          <Route path="plan-sluzeb" element={<AdminShiftPlanPage />} />
          <Route path="export" element={<AdminExportPage />} />
          <Route path="tisky" element={<AdminPrintsPage />} />
          <Route path="tisky/preview" element={<AdminPrintPreviewPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <DeploymentBadge />
    </>
  );
}
