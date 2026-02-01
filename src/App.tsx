import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import EmployeePage from "./pages/EmployeePage";
import AdminLayout from "./pages/AdminLayout";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminInstancesPage from "./pages/AdminInstancesPage";
import AdminExportPage from "./pages/AdminExportPage";
import AdminAttendanceSheetsPage from "./pages/AdminAttendanceSheetsPage";
import AdminShiftPlanPage from "./pages/AdminShiftPlanPage";
import { PendingPage } from "./pages/PendingPage";

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
    <div className="deployment-badge" aria-label="Informace o nasazeni">
      <div>Dagmar Frontend: {frontendCommit || "-"}</div>
      <div>Dagmar Backend: {backendCommit || "-"}</div>
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
        <Route path="/pending" element={<PendingPage />} />

        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="instances" replace />} />
          <Route path="instances" element={<AdminInstancesPage />} />
          <Route path="dochazka" element={<AdminAttendanceSheetsPage />} />
          <Route path="plan-sluzeb" element={<AdminShiftPlanPage />} />
          <Route path="export" element={<AdminExportPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <DeploymentBadge />
    </>
  );
}
