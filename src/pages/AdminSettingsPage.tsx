import React, { useEffect, useState } from "react";
import { adminGetSmtpSettings, adminSaveSmtpSettings, type SmtpSettings } from "../api/admin";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export default function AdminSettingsPage() {
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [security, setSecurity] = useState("SSL");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");

  async function load() {
    setError(null);
    try {
      const cfg = await adminGetSmtpSettings();
      setSmtp(cfg);
      setHost(cfg.host || "");
      setPort(cfg.port ? String(cfg.port) : "");
      setSecurity(cfg.security || "SSL");
      setUsername(cfg.username || "");
      setFromEmail(cfg.from_email || "");
      setFromName(cfg.from_name || "");
    } catch (err: unknown) {
      setError(errorMessage(err, "Nelze načíst SMTP nastavení."));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await adminSaveSmtpSettings({
        host: host.trim() || null,
        port: port.trim() ? Number(port) : null,
        security,
        username: username.trim() || null,
        password: password.trim() || null,
        from_email: fromEmail.trim() || null,
        from_name: fromName.trim() || null,
      });
      setSmtp(res);
      setPassword("");
    } catch (err: unknown) {
      setError(errorMessage(err, "Uložení se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <section className="card pad">
        <div style={{ fontSize: 18, fontWeight: 850 }}>Nastaveni</div>
        <div style={{ color: "var(--muted)", marginTop: 4 }}>SMTP pro odesilani resetovacich odkazu.</div>

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

        <form onSubmit={onSave} className="stack" style={{ gap: 10, marginTop: 12 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <div className="label">SMTP host</div>
              <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.example.cz" />
            </div>
            <div>
              <div className="label">Port</div>
              <input className="input" value={port} onChange={(e) => setPort(e.target.value)} placeholder="465" />
            </div>
            <div>
              <div className="label">Zabezpeceni</div>
              <select className="input" value={security} onChange={(e) => setSecurity(e.target.value)}>
                <option value="SSL">SSL</option>
                <option value="STARTTLS">STARTTLS</option>
                <option value="NONE">NONE</option>
              </select>
            </div>
            <div>
              <div className="label">Uzivatelske jmeno</div>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@example.cz" />
            </div>
            <div>
              <div className="label">Heslo</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={smtp?.password_set ? "Zmenit heslo" : "Zadat heslo"}
              />
            </div>
            <div>
              <div className="label">From e-mail</div>
              <input className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@hotelchodovasc.cz" />
            </div>
            <div>
              <div className="label">From jmeno</div>
              <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="ASC Hotel Chodov" />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn solid" disabled={saving}>
              {saving ? "Ukladam…" : "Ulozit"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
