import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAdminMe } from "../api/admin";
import { AndroidDownloadBanner } from "../components/AndroidDownloadBanner";
import { BrandLoader } from "../components/BrandLoader";
import { useDeviceVariant } from "../hooks/useDeviceVariant";
import dagmarLogo from "../assets/dagmar-logo.png";

type MeState =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "auth"; username: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AdminLayout() {
  useDeviceVariant();
  const navigate = useNavigate();
  const [me, setMe] = React.useState<MeState>({ kind: "loading" });

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await getAdminMe();
        if (!mounted) return;
        if (!r.authenticated || !r.username) {
          setMe({ kind: "anon" });
          navigate("/admin/login", { replace: true });
          return;
        }
        setMe({ kind: "auth", username: r.username });
      } catch {
        if (!mounted) return;
        setMe({ kind: "anon" });
        navigate("/admin/login", { replace: true });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  function onLogout() {
    try {
      sessionStorage.removeItem("dagmar_csrf");
    } catch {
      // ignore
    }
    window.location.assign("/api/v1/admin/logout");
  }

  const items: Array<{ to: string; label: string; icon: React.ReactNode }> = [
    {
      to: "/admin/instances",
      label: "Zařízení",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 7h13M8 12h13M8 17h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3.5 7h.01M3.5 12h.01M3.5 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      to: "/admin/dochazka",
      label: "Docházkové listy",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 3v3M17 3v3M4 8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M8 12h4M8 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      to: "/admin/export",
      label: "Export",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 9l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="dg-page">
      <div className="container" style={{ padding: "10px 0 0" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 12px 10px" }}>
          <AndroidDownloadBanner downloadUrl="/download/adminhcasc.apk" appName="DAGMAR Admin" storageKey="dagmar_admin_banner" />
        </div>
      </div>

      {me.kind === "loading" ? <BrandLoader fullscreen logoSrc={dagmarLogo} title="Načítám administraci…" subtitle="DAGMAR Admin" /> : null}

      <header className="dg-topbar" style={{ marginBottom: 0 }}>
        <div className="dg-topbar-inner">
          <div className="dg-brand">
            <img src={dagmarLogo} alt="DAGMAR" className="dg-brand-logo" decoding="async" loading="eager" />
            <div className="dg-brand-text">
              <div className="dg-brand-title">DAGMAR Admin</div>
              <div className="dg-brand-subtitle">{me.kind === "auth" ? me.username : ""}</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <form
              method="post"
              action="/api/v1/admin/logout"
              onSubmit={(e) => {
                e.preventDefault();
                onLogout();
              }}
            >
              <button type="submit" className="btn solid">
                Odhlásit
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="dg-admin-shell">
        <aside className="dg-sidebar" aria-label="Admin navigace">
          <div className="dg-sidebar-head">
            <div style={{ fontWeight: 900 }}>Menu</div>
            <div style={{ fontSize: 12, color: "rgba(7,20,36,0.60)", marginTop: 3 }}>Správa instancí a exportů</div>
          </div>
          <nav className="dg-nav">
            {items.map((it) => (
              <NavLink key={it.to} to={it.to} className={({ isActive }) => cx(isActive && "active")} end>
                {it.icon}
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="dg-admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
