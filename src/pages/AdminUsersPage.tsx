import React, { useEffect, useState } from "react";
import { adminCreateUser, adminDeleteUser, adminListInstances, adminListUsers, adminSendUserReset, adminUpdateUser, type PortalUser } from "../api/admin";
import type { EmploymentTemplate } from "../types/employment";

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

function makeEmailFromAttendanceName(name: string): string {
  const slug = normalizedLabel(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
  return `${slug || "uzivatel"}@migration.local`;
}

const EMPLOYMENT_OPTIONS: Array<{ value: EmploymentTemplate; label: string }> = [
  { value: "HPP", label: "HPP" },
  { value: "DPP_DPC", label: "DPP / DPČ" },
];

function employmentTemplateLabel(value: PortalUser["employment_template"]): string {
  if (value === "HPP") return "HPP";
  if (value === "DPP_DPC") return "DPP / DPČ";
  return "Neuvedeno";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [employmentTemplate, setEmploymentTemplate] = useState<EmploymentTemplate>("DPP_DPC");
  const [saving, setSaving] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("employee");
  const [editEmploymentTemplate, setEditEmploymentTemplate] = useState<EmploymentTemplate>("DPP_DPC");

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
      await adminCreateUser({ name: name.trim(), email: email.trim(), role, employment_template: employmentTemplate });
      setName("");
      setEmail("");
      setEmploymentTemplate("DPP_DPC");
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, "Uložení se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: PortalUser) {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditEmploymentTemplate(u.employment_template === "HPP" ? "HPP" : "DPP_DPC");
  }

  function cancelEdit() {
    setEditingUserId(null);
    setEditName("");
    setEditEmail("");
    setEditRole("employee");
    setEditEmploymentTemplate("DPP_DPC");
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUserId) return;
    if (!editName.trim() || !editEmail.trim()) {
      setError("Vyplňte jméno a e-mail.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminUpdateUser(editingUserId, {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        employment_template: editEmploymentTemplate,
      });
      await load();
      cancelEdit();
    } catch (err: unknown) {
      setError(errorMessage(err, "Uložení změn se nezdařilo."));
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

  async function deleteUser(user: PortalUser) {
    const confirmed = window.confirm(`Smazat uživatele ${user.name}? Tímto se smaže i jeho docházka.`);
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    try {
      await adminDeleteUser(user.id);
      if (editingUserId === user.id) cancelEdit();
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, "Smazání uživatele se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  async function migrateAttendancesToUsers() {
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
            email: makeEmailFromAttendanceName(displayName),
            role: "employee",
            employment_template: inst.employment_template,
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

        {migrationResult ? (
          <div
            style={{
              border: "1px solid rgba(16,185,129,0.35)",
              background: "rgba(16,185,129,0.08)",
              borderRadius: 12,
              padding: 12,
              color: "#047857",
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
            <div>
              <div className="label">Úvazek</div>
              <select className="input" value={employmentTemplate} onChange={(e) => setEmploymentTemplate(e.target.value as EmploymentTemplate)}>
                {EMPLOYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Reset hesla má platnost 24 hodin. Smazání uživatele maže i jeho docházku.</div>
        </div>

        <div style={{ overflow: "auto", marginTop: 12 }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Jméno</th>
                <th>E-mail</th>
                <th>Role</th>
                <th>Úvazek</th>
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
                (users || []).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role === "employee" ? "Zamestnanec" : u.role}</td>
                    <td>{employmentTemplateLabel(u.employment_template)}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{u.has_password ? "nastaveno" : "nenastaveno"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button type="button" className="btn sm" onClick={() => startEdit(u)} disabled={saving}>
                          Upravit
                        </button>
                        <button type="button" className="btn sm" onClick={() => sendReset(u.id)} disabled={saving}>
                          Poslat link
                        </button>
                        <button type="button" className="btn sm" onClick={() => deleteUser(u)} disabled={saving}>
                          Smazat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {editingUserId ? (
          <form onSubmit={onUpdate} className="stack" style={{ gap: 10, marginTop: 16 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div>
                <div className="label">Jméno</div>
                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <div className="label">E-mail</div>
                <input className="input" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div>
                <div className="label">Druh pohledu</div>
                <select className="input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  <option value="employee">Zamestnanec</option>
                </select>
              </div>
              <div>
                <div className="label">Úvazek</div>
                <select className="input" value={editEmploymentTemplate} onChange={(e) => setEditEmploymentTemplate(e.target.value as EmploymentTemplate)}>
                  {EMPLOYMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Upravujete uživatele ID {editingUserId}.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={cancelEdit} disabled={saving}>
                  Zrušit
                </button>
                <button type="submit" className="btn solid" disabled={saving}>
                  {saving ? "Ukládám…" : "Uložit změny"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
