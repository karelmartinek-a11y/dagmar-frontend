import React, { useEffect, useMemo, useState } from "react";
import { adminCreateUser, adminListInstances, adminListUsers, adminSendUserReset, adminUpdateUser, type PortalUser } from "../api/admin";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function normalizedLabel(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("cs-CZ");
}

function makeEmailFromAttendanceName(name: string, fallbackDomain: string): string {
  const slug = normalizedLabel(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
  return `${slug || "uzivatel"}@${fallbackDomain}`;
}

function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhoneValid(value: string): boolean {
  const phone = value.trim();
  if (!phone) return true;
  return /^\+?[0-9\s()-]{6,20}$/.test(phone);
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function isDomainValid(value: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value);
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [saving, setSaving] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [migrationDomain, setMigrationDomain] = useState("migration.local");
  const [migrationConfirmed, setMigrationConfirmed] = useState(false);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

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

  const editingUser = useMemo(() => (users || []).find((u) => u.id === editingUserId) ?? null, [users, editingUserId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Vyplňte jméno a e-mail.");
      return;
    }
    if (!isEmailValid(email)) {
      setError("Zadejte platný e-mail.");
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

  function startEdit(user: PortalUser) {
    setEditingUserId(user.id);
    setEditName((user.name ?? "").trim());
    setEditEmail((user.email ?? "").trim());
    setEditPhone((user.phone ?? "").trim());
    setEditError(null);
  }

  function cancelEdit() {
    setEditingUserId(null);
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingUser) return;
    if (!editName.trim() || !editEmail.trim()) {
      setEditError("Jméno a e-mail jsou povinné.");
      return;
    }
    if (!isEmailValid(editEmail)) {
      setEditError("Zadejte platný e-mail.");
      return;
    }
    if (!isPhoneValid(editPhone)) {
      setEditError("Telefon má neplatný formát.");
      return;
    }

    setSaving(true);
    setEditError(null);
    setError(null);
    try {
      await adminUpdateUser(editingUser.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || null,
      });
      await load();
      cancelEdit();
    } catch (err: unknown) {
      setEditError(errorMessage(err, "Uložení změn se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  async function migrateAttendancesToUsers() {
    const domain = normalizeDomain(migrationDomain);
    if (!isDomainValid(domain)) {
      setError("Zadejte platnou doménu pro fallback e-maily (např. migration.local).");
      return;
    }
    if (!migrationConfirmed) {
      setError("Potvrďte prosím, že souhlasíte s generováním fallback e-mailů.");
      return;
    }

    const accepted = window.confirm(
      `Budou se generovat fallback e-maily ve tvaru uzivatel@${domain}. Chcete pokračovat?`
    );
    if (!accepted) return;

    setSaving(true);
    setError(null);
    setMigrationResult(null);

    try {
      const [usersRes, instancesRes] = await Promise.all([adminListUsers(), adminListInstances()]);
      const existingUsers = usersRes.users || [];
      const activeInstances = instancesRes.instances.filter((it) => it.status === "ACTIVE" && it.display_name);

      const usersByName = new Map<string, PortalUser>();
      for (const u of existingUsers) {
        const key = normalizedLabel(u.name);
        if (key && !usersByName.has(key)) usersByName.set(key, u);
      }

      let created = 0;
      let linked = 0;
      let skipped = 0;

      for (const inst of activeInstances) {
        const displayName = (inst.display_name ?? "").trim();
        const key = normalizedLabel(displayName);
        if (!key) {
          skipped += 1;
          continue;
        }

        let user = usersByName.get(key);

        if (!user) {
          user = await adminCreateUser({
            name: displayName,
            email: makeEmailFromAttendanceName(displayName, domain),
            role: "employee",
            profile_instance_id: inst.id,
          });
          created += 1;
          linked += 1;
          usersByName.set(key, user);
          continue;
        }

        if (user.profile_instance_id === inst.id) {
          skipped += 1;
          continue;
        }

        await adminUpdateUser(user.id, { profile_instance_id: inst.id });
        linked += 1;
      }

      setMigrationResult(`Migrace hotová. Vytvořeno: ${created}, přiřazeno: ${linked}, přeskočeno: ${skipped}.`);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, "Migrace docházek na uživatele se nezdařila."));
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

        {migrationResult ? (
          <div
            style={{
              border: "1px solid rgba(38,43,49,0.35)",
              background: "rgba(38,43,49,0.08)",
              borderRadius: 12,
              padding: 12,
              color: "var(--kb-brand-ink-800)",
              marginTop: 12,
              fontSize: 13,
            }}
          >
            {migrationResult}
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
          <div
            style={{
              border: "1px solid rgba(245, 158, 11, 0.35)",
              background: "rgba(245, 158, 11, 0.09)",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>Migrace docházek: fallback e-maily</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Pokud uživatel neexistuje, vytvoří se s fallback e-mailem. Před spuštěním potvrďte doménu.
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(220px, 320px) 1fr" }}>
              <div>
                <div className="label">Doména fallback e-mailu</div>
                <input
                  className="input"
                  value={migrationDomain}
                  onChange={(e) => setMigrationDomain(e.target.value)}
                  placeholder="migration.local"
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={migrationConfirmed}
                  onChange={(e) => setMigrationConfirmed(e.target.checked)}
                />
                Rozumím, že se budou generovat fallback e-maily pro nové uživatele.
              </label>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={saving || loading} onClick={migrateAttendancesToUsers}>
              {saving ? "Migruji…" : "Migrovat docházky na uživatele"}
            </button>
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
                <th>Telefon</th>
                <th>Role</th>
                <th>Heslo</th>
                <th style={{ textAlign: "right" }}>Akce</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--muted)" }}>
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && (users || []).length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--muted)" }}>
                    Zatím nejsou žádní uživatelé.
                  </td>
                </tr>
              )}
              {!loading &&
                (users || []).map((u) => {
                  const isEditing = editingUserId === u.id;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700 }}>
                        {isEditing ? (
                          <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        ) : (
                          u.name || "—"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input className="input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
                        ) : (
                          u.email || "—"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input className="input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+420..." />
                        ) : (
                          u.phone || "—"
                        )}
                      </td>
                      <td>{u.role === "employee" ? "Zamestnanec" : u.role}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{u.has_password ? "nastaveno" : "nenastaveno"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {isEditing ? (
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <button type="button" className="btn sm solid" onClick={saveEdit} disabled={saving}>
                              Uložit
                            </button>
                            <button type="button" className="btn sm" onClick={cancelEdit} disabled={saving}>
                              Zrušit
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <button type="button" className="btn sm" onClick={() => startEdit(u)} disabled={saving}>
                              Upravit
                            </button>
                            <button type="button" className="btn sm" onClick={() => sendReset(u.id)} disabled={saving}>
                              Poslat link
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {editError ? <div style={{ color: "var(--kb-red)", marginTop: 10, fontSize: 13 }}>{editError}</div> : null}
      </section>
    </div>
  );
}
