import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { portalResetPassword } from "../api/portal";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function getToken(search: string): string {
  const params = new URLSearchParams(search);
  return (params.get("token") || "").trim();
}

export default function PortalResetPage() {
  const loc = useLocation();
  const token = getToken(loc.search);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Odkaz není platný.");
      return;
    }
    if (!password.trim()) {
      setError("Zadejte nové heslo.");
      return;
    }
    setSaving(true);
    try {
      await portalResetPassword({ token, password });
      setSuccess(true);
    } catch (err: unknown) {
      setError(errorMessage(err, "Nastavení hesla se nezdařilo."));
    } finally {
      setSaving(false);
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
        <div style={{ fontSize: 18, fontWeight: 850 }}>Nastaveni nebo zmena hesla</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Platnost odkazu 24 hodin.</div>

        {error ? (
          <div
            style={{
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              borderRadius: 12,
              padding: 12,
              color: "#b91c1c",
              marginTop: 12,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            style={{
              border: "1px solid rgba(16,185,129,0.35)",
              background: "rgba(16,185,129,0.1)",
              borderRadius: 12,
              padding: 12,
              color: "#047857",
              marginTop: 12,
              fontSize: 13,
            }}
          >
            Heslo bylo nastaveno. Muzete se prihlasit.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="stack" style={{ gap: 12, marginTop: 12 }}>
            <div>
              <div className="label">Nove heslo</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Zadejte nove heslo"
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
            <button type="submit" className="btn solid" disabled={saving}>
              {saving ? "Ukladam…" : "Ulozit heslo"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
