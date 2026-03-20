import React, { useEffect, useState } from "react";
import { adminCreateUser, adminDeleteUser, adminListInstances, adminListUsers, adminSendUserReset, adminUpdateUser, type PortalUser } from "../api/admin";
import type { EmploymentTemplate } from "../types/employment";
import { employmentTemplateLabel as formatEmploymentTemplateLabel } from "../utils/uiLabels";

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
  { value: "HPP", label: formatEmploymentTemplateLabel("HPP") },
  { value: "DPP_DPC", label: formatEmploymentTemplateLabel("DPP_DPC") },
];

function employmentTemplateLabel(value: PortalUser["employment_template"]): string {
  return formatEmploymentTemplateLabel(value);
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
  const userCount = users?.length ?? 0;
  const configuredPasswordCount = (users ?? []).filter((user) => user.has_password).length;

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
    <div className="admin-page">
      <section className="card admin-hero">
        <div className="admin-hero-copy">
          <div className="eyebrow">Administrace · Uživatelé</div>
          <h1 className="admin-hero-title">Přístupy zaměstnanců</h1>
          <div className="admin-hero-text">
            Správa přístupů, obnovy hesla a propojení docházkových profilů. Auditované akce jsou seskupené do dvou jasných bloků, aby na široké obrazovce nevznikala hluchá místa.
          </div>
        </div>
        <div className="admin-kpis">
          <div className="admin-kpi">
            <div className="admin-kpi-value">{userCount}</div>
            <div className="admin-kpi-label">Celkový počet účtů</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-value">{configuredPasswordCount}</div>
            <div className="admin-kpi-label">Účty s nastaveným heslem</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-value">{editingUserId ? 1 : 0}</div>
            <div className="admin-kpi-label">Právě upravované účty</div>
          </div>
        </div>
      </section>

      <div className="admin-two-column">
        <section className="card pad admin-side-card">
          <div style={{ fontSize: 18, fontWeight: 850 }}>Nový uživatel</div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>Vytvoření přístupu a jednorázová migrace stávajících docházek.</div>

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

          <form onSubmit={onCreate} className="stack" style={{ gap: 12, marginTop: 12 }}>
          <div className="admin-form-grid">
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
                <option value="employee">Zaměstnanec</option>
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
            <div className="admin-note-box">
              <div className="admin-note-title">Migrace historických záznamů</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                Automatická migrace vytvoří chybějící uživatele podle názvu v docházce a přiřadí k nim odpovídající profil.
              </div>
            </div>
            <div className="admin-card-actions">
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
            <div>
              <div style={{ fontWeight: 850 }}>Seznam uživatelů</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Reset hesla má platnost 24 hodin. Smazání uživatele maže i jeho docházku.
              </div>
            </div>
            <div className="chip">{userCount} účtů celkem</div>
          </div>

          <div className="admin-scroll" style={{ marginTop: 12 }}>
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
                      <td style={{ fontWeight: 700, lineHeight: 1.4 }}>{u.name}</td>
                      <td style={{ color: "var(--muted)" }}>{u.email}</td>
                      <td>
                        <span className="chip">{u.role === "employee" ? "Zaměstnanec" : u.role}</span>
                      </td>
                      <td>{employmentTemplateLabel(u.employment_template)}</td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            background: u.has_password ? "rgba(16,185,129,0.09)" : "rgba(35,41,44,0.05)",
                            borderColor: u.has_password ? "rgba(16,185,129,0.24)" : "var(--kb-border)",
                            color: u.has_password ? "#047857" : "var(--kb-muted)",
                          }}
                        >
                          {u.has_password ? "Nastaveno" : "Nenastaveno"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "grid", gap: 6, justifyContent: "end" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <button type="button" className="btn sm" onClick={() => startEdit(u)} disabled={saving}>
                              Upravit
                            </button>
                            <button type="button" className="btn sm" onClick={() => sendReset(u.id)} disabled={saving}>
                              Poslat odkaz
                            </button>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => deleteUser(u)}
                              disabled={saving}
                              style={{ borderColor: "rgba(255,0,0,0.22)", color: "var(--kb-red)" }}
                            >
                              Smazat
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {editingUserId ? (
            <form onSubmit={onUpdate} className="stack" style={{ gap: 12, marginTop: 16 }}>
              <div className="admin-form-grid">
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
                  <option value="employee">Zaměstnanec</option>
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
              <div className="admin-card-actions">
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Upravujete uživatele s identifikátorem {editingUserId}.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
    </div>
  );
}
