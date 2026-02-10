import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAdminMe } from "../api/admin";
import Button from "../ui/Button";

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
      to: "/admin/users",
      label: "Uživatelé",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke="currentColor" strokeWidth="2" />
          <path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
      to: "/admin/plan-sluzeb",
      label: "Plán služeb",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M4 10h16M10 6v4M14 6v4M14 14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      to: "/admin/tisky",
      label: "Tisky",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 9V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="5" y="9" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 13h8M8 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
    {
      to: "/admin/settings",
      label: "Nastavení",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" stroke="currentColor" strokeWidth="2" />
          <path
            d="M3 12h3m12 0h3M12 3v3m0 12v3m-6.4-2.4 2.1-2.1m8.6-8.6 2.1-2.1m0 14.8-2.1-2.1m-8.6-8.6-2.1-2.1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="kb-admin">
      {me.kind === "loading" ? (
        <div className="kb-intro" role="status" aria-label="Načítání">
          <div className="kb-intro-card">
            <div className="kb-intro-top">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/KajovoDagmar-dochazka.png" alt="" style={{ height: 38, width: "auto" }} />
              </div>
            </div>
            <div>
              <div className="kb-intro-title">Administrace</div>
              <div className="kb-intro-sub">Načítám…</div>
            </div>
            <div className="kb-spinner" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      <aside className="kb-sidebar" aria-label="Admin navigace">
        <div className="kb-sidebar-head">
          <img src="/KajovoDagmar-dochazka.png" alt="" className="kb-sidebar-logo" />
          <div>
            <div className="kb-sidebar-title">Administrace</div>
            <div className="kb-sidebar-sub">{me.kind === "auth" ? me.username : ""}</div>
          </div>
        </div>

        <nav className="kb-nav">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) => cx("kb-navlink", isActive && "active")}
              end
            >
              {it.icon}
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="kb-sidebar-foot">
          <form
            method="post"
            action="/api/v1/admin/logout"
            onSubmit={(e) => {
              e.preventDefault();
              onLogout();
            }}
          >
            <Button type="submit" variant="primary" style={{ width: "100%" }}>
              Odhlásit
            </Button>
          </form>
        </div>
      </aside>

      <main className="kb-admin-main">
        <Outlet />
      </main>
    </div>
  );
}
