import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { adminLogin, getAdminMe } from "../api/admin";
import Button from "../ui/Button";
import { Card } from "../ui/Card";
import { APP_NAME_LONG, BRAND_ASSETS } from "../brand/brand";

const ADMIN_FALLBACK_PATH = "/admin/users";
const VALID_ADMIN_PATHS = new Set([
  "/admin",
  "/admin/users",
  "/admin/dochazka",
  "/admin/plan-sluzeb",
  "/admin/export",
  "/admin/tisky",
  "/admin/tisky/preview",
  "/admin/settings",
]);

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

  const pathname = new URL(next, window.location.origin).pathname;
  if (!VALID_ADMIN_PATHS.has(pathname)) return null;

  return next;
}

export default function AdminLoginPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const nextPath = useMemo(() => parseNextParam(loc.search) ?? ADMIN_FALLBACK_PATH, [loc.search]);

  const [email, setEmail] = useState("provoz@hotelchodovasc.cz");
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
    if (email.trim().toLowerCase() !== "provoz@hotelchodovasc.cz") {
      setError("Pro administraci použijte účet provoz@hotelchodovasc.cz.");
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
              <img src={BRAND_ASSETS.logoMark} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "contain" }} />
              <div>
                <div className="kb-card-title">Administrace</div>
                <div className="kb-card-sub">{APP_NAME_LONG}</div>
              </div>
            </div>
          </div>

          {error ? <div className="kb-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <form onSubmit={onSubmit} className="kb-stack" style={{ marginTop: 14 }}>
            <div className="kb-field">
              <div className="kb-label">E-mail správce</div>
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
              <div className="kb-label">Heslo správce</div>
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
              Přístup je určen pouze administrátorům (provoz@hotelchodovasc.cz).
            </div>
            <div className="kb-help" style={{ textAlign: "center" }}>
              Zapomenuté heslo admina řešte přes podporu: <a href="mailto:provoz@hotelchodovasc.cz">provoz@hotelchodovasc.cz</a>.
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
