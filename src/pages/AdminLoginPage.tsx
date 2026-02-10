import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { adminLogin, getAdminMe } from "../api/admin";
import Button from "../ui/Button";
import { Card } from "../ui/Card";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function parseNextParam(search: string): string | null {
  const params = new URLSearchParams(search);
  const next = params.get("next");
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

export default function AdminLoginPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const nextPath = useMemo(() => parseNextParam(loc.search) ?? "/admin/instances", [loc.search]);
  const logoUrl = useMemo(() => "/KajovoDagmar-dochazka.png", []);

  const [email, setEmail] = useState("");
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
    if (!email || !password) {
      setError("Vyplňte e-mail a heslo.");
      return;
    }

    setSubmitting(true);
    try {
      await adminLogin({ username: email, password });
      nav(nextPath, { replace: true });
    } catch (err: unknown) {
      setError(errorMessage(err, "Přihlášení se nezdařilo."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="kb-page" style={{ minHeight: "calc(100vh - var(--kb-systembar-h))", display: "grid", placeItems: "center" }}>
      <div className="kb-container" style={{ maxWidth: 560 }}>
        <Card className="kb-card-pad">
          <div className="kb-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div className="kb-row" style={{ alignItems: "center" }}>
              <img src={logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "contain" }} />
              <div>
                <div className="kb-card-title">Administrace</div>
                <div className="kb-card-sub">KájovoDagmar docházkový systém</div>
              </div>
            </div>
            <a href="/download/admin.apk" className="kb-btn kb-btn-ghost" style={{ textDecoration: "none" }}>
              APK
            </a>
          </div>

          {error ? <div className="kb-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <form onSubmit={onSubmit} className="kb-stack" style={{ marginTop: 14 }}>
            <div className="kb-field">
              <div className="kb-label">Admin e-mail</div>
              <input
                className="kb-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jmeno@domena.cz"
                disabled={submitting}
              />
            </div>

            <div className="kb-field">
              <div className="kb-label">Admin heslo</div>
              <input
                className="kb-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting}
              />
            </div>

            <Button type="submit" disabled={submitting} variant="primary" style={{ width: "100%", justifyContent: "center" }}>
              {submitting ? "Přihlašuji…" : "Přihlásit"}
            </Button>

            <div className="kb-help" style={{ textAlign: "center" }}>
              Přístup je určen pouze administrátorům.
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
