import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAdminMe } from "../api/admin";
import { AndroidDownloadBanner } from "../components/AndroidDownloadBanner";

type MeState =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "auth"; username: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AdminLayout() {
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
    <div className="container" style={{ padding: "10px 0 30px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 12px 10px" }}>
        <AndroidDownloadBanner downloadUrl="/download/adminhcasc.apk" appName="DAGMAR Admin" storageKey="dagmar_admin_banner" />
      </div>
      {me.kind === "loading" ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(180deg, #0b1b3a 0%, #0a1226 35%, #070b14 100%)",
            color: "#e8eefc",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <img src="/brand/logo.svg" alt="DAGMAR" style={{ width: 180, height: 180, objectFit: "contain" }} />
            <div style={{ fontWeight: 800, fontSize: 18 }}>Načítám…</div>
          </div>
        </div>
      ) : null}

      <header className="header" style={{ position: "sticky", top: 0, zIndex: 50, marginBottom: 18 }}>
        <div className="header-inner">
          <div className="brand" style={{ gap: 12 }}>
            <img src="/brand/icon.svg" alt="DAGMAR" />
            <div>
              <div className="title">DAGMAR Admin</div>
              <div className="subtitle">{me.kind === "auth" ? me.username : ""}</div>
            </div>
          </div>
          <nav className="header-actions" aria-label="Admin menu">
            {items.map((it) => (
              <NavLink key={it.to} to={it.to} className={({ isActive }) => cx("btn", "ghost", isActive && "primary")} end>
                {it.icon}
                <span>{it.label}</span>
              </NavLink>
            ))}
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
          </nav>
        </div>
      </header>

      <main className="stack">
        <Outlet />
      </main>
    </div>
  );
}
