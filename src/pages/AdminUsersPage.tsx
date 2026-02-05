import React, { useEffect, useState } from "react";
import { adminCreateUser, adminListUsers, adminSendUserReset, type PortalUser } from "../api/admin";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListUsers();
      setUsers(res.users || []);
    } catch (err: unknown) {
      setError(errorMessage(err, "Nepodařilo se načíst uživatele."));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Vyplňte jméno a e-mail.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminCreateUser({ name: name.trim(), email: email.trim(), role });
      setName("");
      setEmail("");
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, "Uložení se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  async function sendReset(userId: number) {
    setSaving(true);
    setError(null);
    try {
      await adminSendUserReset(userId);
    } catch (err: unknown) {
      setError(errorMessage(err, "Odeslání odkazu se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <section className="card pad">
        <div style={{ fontSize: 18, fontWeight: 850 }}>Uživatelé</div>
        <div style={{ color: "var(--muted)", marginTop: 4 }}>Správa přístupů pro zaměstnance.</div>

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

        <form onSubmit={onCreate} className="stack" style={{ gap: 10, marginTop: 12 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <div className="label">Jméno</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Např. Jana Nováková" />
            </div>
            <div>
              <div className="label">E-mail</div>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hotelchodovasc.cz"
              />
            </div>
            <div>
              <div className="label">Druh pohledu</div>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="employee">Zamestnanec</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn solid" disabled={saving}>
              {saving ? "Ukládám…" : "Přidat"}
            </button>
          </div>
        </form>
      </section>

      <section className="card pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 850 }}>Seznam uživatelů</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Reset hesla má platnost 24 hodin.</div>
        </div>

        <div style={{ overflow: "auto", marginTop: 12 }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Jméno</th>
                <th>E-mail</th>
                <th>Role</th>
                <th>Heslo</th>
                <th style={{ textAlign: "right" }}>Akce</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)" }}>
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && (users || []).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)" }}>
                    Zatím nejsou žádní uživatelé.
                  </td>
                </tr>
              )}
              {!loading &&
                (users || []).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role === "employee" ? "Zamestnanec" : u.role}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{u.has_password ? "nastaveno" : "nenastaveno"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn sm" onClick={() => sendReset(u.id)} disabled={saving}>
                        Poslat link
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
