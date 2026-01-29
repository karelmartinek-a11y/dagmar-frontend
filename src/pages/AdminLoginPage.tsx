import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { adminLogin, getAdminMe } from "../api/admin";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

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
  const nav = useNavigate();
  const loc = useLocation();

  const nextPath = useMemo(() => parseNextParam(loc.search) ?? "/admin/instances", [loc.search]);
  const logoUrl = useMemo(() => "/brand/logo.svg", []);

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
    } catch (err: unknown) {
      setError(errorMessage(err, "Přihlášení se nezdařilo."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(180deg, #e0f2ff 0%, #f8fbff 40%, #ffffff 100%)",
      }}
    >
      <div className="card pad" style={{ width: "min(520px, 100%)", boxShadow: "var(--shadow-2)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <img
            src={logoUrl}
            alt="DAGMAR Docházka"
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "#e0f2fe",
              padding: 8,
              border: "1px solid #bae6fd",
            }}
            loading="eager"
            decoding="async"
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 850 }}>DAGMAR — Admin</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Přihlášení do administrace</div>
          </div>
        </div>

        {error ? (
          <div
            style={{
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              borderRadius: 12,
              padding: 12,
              color: "#b91c1c",
              marginBottom: 12,
              fontSize: 13,
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

          <button type="submit" disabled={submitting} className="btn solid" style={{ width: "100%", justifyContent: "center" }}>
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
              borderRadius: 12,
              border: "1px solid rgba(59,130,246,0.35)",
              background: "rgba(59,130,246,0.08)",
              color: "#0f172a",
              fontWeight: 700,
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
