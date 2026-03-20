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
      setError(errorMessage(err, "Nelze načíst nastavení odchozí pošty."));
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
    <div className="admin-page">
      <section className="card admin-hero">
        <div className="admin-hero-copy">
          <div className="eyebrow">Administrace · Nastavení</div>
          <h1 className="admin-hero-title">Odchozí pošta</h1>
          <div className="admin-hero-text">
            Nastavení odesílání zpráv pro obnovu hesla. Důležité technické údaje, bezpečnostní volby i identita odesílatele jsou rozdělené do širšího ergonomického rozvržení.
          </div>
        </div>
        <div className="admin-kpis">
          <div className="admin-kpi">
            <div className="admin-kpi-value">{smtp?.host || "—"}</div>
            <div className="admin-kpi-label">Používaný server</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-value">{smtp?.password_set ? "Ano" : "Ne"}</div>
            <div className="admin-kpi-label">Uložené heslo</div>
          </div>
        </div>
      </section>

      <div className="admin-two-column">
        <section className="card pad">
          <div style={{ fontSize: 18, fontWeight: 850 }}>Nastavení doručování</div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>Nastavení odchozí pošty pro rozesílání odkazů k obnově hesla.</div>

        {error ? (
          <div
            style={{
              border: "1px solid rgba(255,0,0,0.35)",
              background: "rgba(255,0,0,0.08)",
              borderRadius: 12,
              padding: 12,
              color: "var(--kb-red)",
              marginTop: 12,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

          <form onSubmit={onSave} className="stack" style={{ gap: 12, marginTop: 12 }}>
          <div className="admin-form-grid">
            <div>
              <div className="label">Server odchozí pošty</div>
              <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.example.cz" />
            </div>
            <div>
              <div className="label">Port</div>
              <input className="input" value={port} onChange={(e) => setPort(e.target.value)} placeholder="465" />
            </div>
            <div>
              <div className="label">Zabezpečení spojení</div>
              <select className="input" value={security} onChange={(e) => setSecurity(e.target.value)}>
                <option value="SSL">Šifrované spojení</option>
                <option value="STARTTLS">Navázání šifrování po připojení</option>
                <option value="NONE">Bez šifrování</option>
              </select>
            </div>
            <div>
              <div className="label">Přihlašovací jméno</div>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@example.cz" />
            </div>
            <div>
              <div className="label">Heslo</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={smtp?.password_set ? "Změnit heslo" : "Zadat heslo"}
              />
            </div>
            <div>
              <div className="label">Odesílací e-mail</div>
              <input className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@hotelchodovasc.cz" />
            </div>
            <div>
              <div className="label">Jméno odesílatele</div>
              <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="ASC Hotel Chodov" />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn solid" disabled={saving}>
              {saving ? "Ukládám…" : "Uložit"}
            </button>
          </div>
          </form>
        </section>

        <aside className="stack admin-side-card">
          <section className="card pad">
            <div style={{ fontWeight: 850 }}>Doporučený postup</div>
            <ul className="admin-note-list">
              <li>Nejdříve vyplňte server, port a způsob zabezpečení spojení.</li>
              <li>Poté doplňte přihlašovací jméno, heslo a identitu odesílatele.</li>
              <li>Po uložení ověřte obnovu hesla odesláním skutečného odkazu.</li>
            </ul>
          </section>

          <section className="card pad">
            <div style={{ fontWeight: 850 }}>Aktuální stav</div>
            <div className="admin-note-box" style={{ marginTop: 12 }}>
              <div className="admin-note-title">Uložené údaje</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
                Server: <strong>{smtp?.host || "neuvedeno"}</strong>
                <br />
                Port: <strong>{smtp?.port ? String(smtp.port) : "neuvedeno"}</strong>
                <br />
                Odesílatel: <strong>{smtp?.from_name || "neuvedeno"}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
