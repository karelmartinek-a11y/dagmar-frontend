import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { adminLogin, getAdminMe } from "../api/admin";
import { AndroidDownloadBanner } from "../components/AndroidDownloadBanner";
import { useDeviceVariant } from "../hooks/useDeviceVariant";
import dagmarLogo from "../assets/dagmar-logo.png";

function parseNextParam(search: string): string | null {
  const params = new URLSearchParams(search);
  const next = params.get("next");
  if (!next) return null;
  // prevent open redirects
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

export default function AdminLoginPage() {
  useDeviceVariant();

  const nav = useNavigate();
  const loc = useLocation();

  const nextPath = useMemo(() => parseNextParam(loc.search) ?? "/admin/instances", [loc.search]);

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await getAdminMe();
        if (!mounted) return;
        if (me?.username) {
          nav(nextPath, { replace: true });
        }
      } catch {
        // not logged in
      }
    })();
    return () => {
      mounted = false;
    };
  }, [nav, nextPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Vyplňte heslo.");
      return;
    }

    setSubmitting(true);
    try {
      await adminLogin({ password });
      nav(nextPath, { replace: true });
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : null;
      setError(msg ?? "Přihlášení se nezdařilo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dg-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(520px, 100%)", marginBottom: 10 }}>
        <AndroidDownloadBanner downloadUrl="/download/adminhcasc.apk" appName="DAGMAR Admin" storageKey="dagmar_admin_banner" />
      </div>
      <div className="dg-card pad" style={{ width: "min(520px, 100%)", boxShadow: "var(--shadow-2)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <img
            src={dagmarLogo}
            alt="DAGMAR"
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "rgba(10,196,254,0.14)",
              padding: 9,
              border: "1px solid rgba(10,196,254,0.28)",
            }}
            loading="eager"
            decoding="async"
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>DAGMAR — Admin</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Přihlášení do administrace</div>
          </div>
        </div>

        {error ? (
          <div
            style={{
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              borderRadius: 14,
              padding: 12,
              color: "#b91c1c",
              marginBottom: 12,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="stack" style={{ gap: 12 }}>
          <div>
            <div className="label">Admin heslo</div>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting}
            />
          </div>

          <button type="submit" disabled={submitting} className="dg-btn solid" style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? "Přihlašuji…" : "Přihlásit"}
          </button>

          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
            Přístup je určen pouze administrátorům. Uživatelské jméno se nezadává, stačí heslo. Doména:
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}> dagmar.hcasc.cz</span>
          </div>

          <a
            href="/download/adminhcasc.apk"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(10,196,254,0.30)",
              background: "rgba(10,196,254,0.10)",
              color: "rgba(7,20,36,0.92)",
              fontWeight: 900,
              textDecoration: "none",
              width: "100%",
            }}
          >
            📥 Stáhnout AdminHCASC (APK)
          </a>
        </form>
      </div>
    </div>
  );
}
