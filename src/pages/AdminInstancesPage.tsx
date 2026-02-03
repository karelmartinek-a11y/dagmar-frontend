import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminActivateInstance,
  adminDeactivateInstance,
  adminDeleteInstance,
  adminDeletePendingInstances,
  adminGetSettings,
  adminListInstances,
  adminMergeInstances,
  adminRenameInstance,
  adminRevokeInstance,
  adminSetSettings,
  adminSetTemplate,
  type AdminInstance,
} from "../api/admin";
import type { EmploymentTemplate } from "../api/instances";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";

export type AdminInstanceRow = AdminInstance;

function cx(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normDisplayName(v: string): string {
  return v
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function clientTypeLabel(t: AdminInstanceRow["client_type"]): string {
  return t === "ANDROID" ? "Android" : "Web";
}

function clientTypeIcon(t: AdminInstanceRow["client_type"]) {
  if (t === "ANDROID") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminInstancesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminInstanceRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [settingsCutoff, setSettingsCutoff] = useState<string>("17:00");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminInstanceRow["status"]>("ALL");

  const [activateOpen, setActivateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [selected, setSelected] = useState<AdminInstanceRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [template, setTemplate] = useState<EmploymentTemplate>("DPP_DPC");
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function refresh() {
    setLoading(true);
    setPageError(null);
    try {
      const [instancesRes, settingsRes] = await Promise.all([adminListInstances(), adminGetSettings()]);
      setRows(instancesRes.instances);
      setSettingsCutoff(settingsRes.afternoon_cutoff);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setPageError(errorMessage(err, "Nepodařilo se načíst seznam instancí."));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setPageError(null);
    try {
      await adminSetSettings(settingsCutoff);
      const s = await adminGetSettings();
      setSettingsCutoff(s.afternoon_cutoff);
    } catch (err: unknown) {
      setPageError(errorMessage(err, "Uložení nastavení se nezdařilo."));
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const counts = useMemo(() => {
    const all = rows ?? [];
    const out: Record<"ALL" | AdminInstanceRow["status"], number> = {
      ALL: all.length,
      PENDING: 0,
      ACTIVE: 0,
      REVOKED: 0,
      DEACTIVATED: 0,
    };
    for (const r of all) out[r.status] += 1;
    return out;
  }, [rows]);

  const queryFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = rows ?? [];
    if (!q) return all;
    return all.filter((r) => {
      const hay = [r.id, r.display_name ?? "", r.client_type, r.status].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const pending = useMemo(() => {
    return queryFiltered
      .filter((r) => r.status === "PENDING")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [queryFiltered]);

  const filtered = useMemo(() => {
    return queryFiltered
      .filter((r) => r.status !== "PENDING")
      .filter((r) => (statusFilter === "ALL" ? true : r.status === statusFilter))
      .sort((a, b) => {
        const prio = (s: AdminInstanceRow["status"]) => {
          if (s === "ACTIVE") return 0;
          if (s === "DEACTIVATED") return 1;
          return 2;
        };
        const dp = prio(a.status) - prio(b.status);
        if (dp !== 0) return dp;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [queryFiltered, statusFilter]);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows ?? []) {
      if (r.display_name) map.set(r.id, r.display_name);
    }
    return map;
  }, [rows]);

  const selectedRows = useMemo(() => {
    const all = rows ?? [];
    return all.filter((r) => selectedIds.has(r.id));
  }, [rows, selectedIds]);

  function isMergeSelectable(r: AdminInstanceRow): boolean {
    return r.status === "ACTIVE" && !r.profile_instance_id;
  }

  function toggleSelection(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openMerge() {
    if (selectedRows.length < 2) return;
    setMergeTargetId(selectedRows[0]?.id ?? null);
    setMergeError(null);
    setMergeOpen(true);
  }

  async function doMerge() {
    if (!mergeTargetId) return;
    const sourceIds = selectedRows.map((r) => r.id).filter((id) => id !== mergeTargetId);
    if (sourceIds.length === 0) {
      setMergeError("Vyberte cilovou instanci i alespon jeden zdroj.");
      return;
    }
    setMergeSaving(true);
    setMergeError(null);
    try {
      await adminMergeInstances(mergeTargetId, sourceIds);
      setMergeOpen(false);
      setMergeTargetId(null);
      await refresh();
    } catch (err: unknown) {
      setMergeError(errorMessage(err, "Slouceni instanci se nezdarilo."));
    } finally {
      setMergeSaving(false);
    }
  }

  function openActivate(r: AdminInstanceRow) {
    setSelected(r);
    setDisplayName(r.display_name ?? "");
    setTemplate(r.employment_template ?? "DPP_DPC");
    setModalError(null);
    setActivateOpen(true);
  }

  async function doDeletePendingAll() {
    if (pending.length === 0) return;
    const ok = window.confirm(`Smazat všechny čekající instance (${pending.length} ks)? Akce je nevratná.`);
    if (!ok) return;
    setBulkDeleting(true);
    setPageError(null);
    try {
      await adminDeletePendingInstances();
      await refresh();
    } catch (err: unknown) {
      setPageError(errorMessage(err, "Hromadné smazání se nezdařilo."));
    } finally {
      setBulkDeleting(false);
    }
  }

  function openRename(r: AdminInstanceRow) {
    setSelected(r);
    setDisplayName(r.display_name ?? "");
    setModalError(null);
    setRenameOpen(true);
  }

  async function doActivate() {
    if (!selected) return;
    const name = normDisplayName(displayName);
    if (!name) {
      setModalError("Vyplňte jméno a příjmení.");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await adminActivateInstance(selected.id, name, template);
      setActivateOpen(false);
      setSelected(null);
      await refresh();
    } catch (err: unknown) {
      setModalError(errorMessage(err, "Aktivace se nezdařila."));
    } finally {
      setSaving(false);
    }
  }

  async function doRename() {
    if (!selected) return;
    const name = normDisplayName(displayName);
    if (!name) {
      setModalError("Vyplňte jméno a příjmení.");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await adminRenameInstance(selected.id, name);
      setRenameOpen(false);
      setSelected(null);
      await refresh();
    } catch (err: unknown) {
      setModalError(errorMessage(err, "Přejmenování se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  async function doRevoke(r: AdminInstanceRow) {
    const ok = window.confirm(
      `Opravdu chcete zařízení revokovat?\n\n${r.display_name ? `Jméno: ${r.display_name}\n` : ""}ID: ${r.id}`
    );
    if (!ok) return;
    setSaving(true);
    setPageError(null);
    try {
      await adminRevokeInstance(r.id);
      await refresh();
    } catch (err: unknown) {
      setPageError(errorMessage(err, "Revokace se nezdařila."));
    } finally {
      setSaving(false);
    }
  }

  async function doDeactivate(r: AdminInstanceRow) {
    const ok = window.confirm(
      `Deaktivovat zařízení?\n\n${r.display_name ? `Jméno: ${r.display_name}\n` : ""}ID: ${r.id}\n` +
        "Token bude zneplatněn a zařízení se nebude moci znovu registrovat."
    );
    if (!ok) return;
    setSaving(true);
    setPageError(null);
    try {
      await adminDeactivateInstance(r.id);
      await refresh();
    } catch (err: unknown) {
      setPageError(errorMessage(err, "Deaktivace se nezdařila."));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(r: AdminInstanceRow) {
    const ok = window.confirm(
      `Smazat instanci? Tato akce je nevratná a odstraní i historii tokenu.\n` +
        `${r.status !== "REVOKED" ? "Instanci nejprve revokujeme a poté smažeme.\n" : ""}\n` +
        `${r.display_name ? `Jméno: ${r.display_name}\n` : ""}ID: ${r.id}`
    );
    if (!ok) return;
    setSaving(true);
    setPageError(null);
    try {
      await adminDeleteInstance(r.id);
      await refresh();
    } catch (err: unknown) {
      setPageError(errorMessage(err, "Smazání se nezdařilo."));
    } finally {
      setSaving(false);
    }
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1400);
    } catch {
      window.prompt("Zkopírujte ID instance:", id);
    }
  }

  const pills: Array<{
    value: "ALL" | AdminInstanceRow["status"];
    label: string;
    count: number;
  }> = [
    { value: "ALL", label: "Vše", count: counts.ALL },
    { value: "PENDING", label: "Ke schválení", count: counts.PENDING },
    { value: "ACTIVE", label: "Aktivní", count: counts.ACTIVE },
    { value: "DEACTIVATED", label: "Deaktivovaná", count: counts.DEACTIVATED },
    { value: "REVOKED", label: "Revokované", count: counts.REVOKED },
  ];

  return (
    <div
      className="stack"
      style={{
        gap: 16,
        width: "100%",
      }}
    >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            width: "100%",
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 850 }}>Zařízení</div>
            <div style={{ color: "var(--muted)" }}>Schvalování a správa instancí (WEB/ANDROID).</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <button
              type="button"
              onClick={openMerge}
              className="btn"
              disabled={selectedRows.length < 2 || saving || loading}
              title="Sloucit vybrane aktivni entity"
            >
              Sloucit entity
            </button>
            <button type="button" onClick={() => navigate("/admin/dochazka")} className="btn">
              Docházkové listy
            </button>
            <button type="button" onClick={refresh} disabled={loading || saving} className="btn">
              {loading ? "Načítám…" : "Obnovit"}
            </button>
          </div>
        </div>

        <div className="card pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="label" style={{ marginBottom: 0 }}>
            Odpolední cutoff (HH:MM)
          </div>
          <input
            className="input"
            style={{ width: 110 }}
            value={settingsCutoff}
            onChange={(e) => setSettingsCutoff(e.target.value)}
            placeholder="17:00"
          />
          <button type="button" className="btn" onClick={saveSettings} disabled={settingsSaving}>
            {settingsSaving ? "Ukládám…" : "Uložit"}
          </button>
        </div>

        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ minWidth: 260, flex: "1 1 320px" }}>
              <div className="label">Hledat</div>
              <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jméno, ID, typ…"
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {pills.map((p) => (
              <button
                key={p.value}
                type="button"
                className={cx("pill-filter", statusFilter === p.value && "active")}
                onClick={() => setStatusFilter(p.value)}
              >
                <span>{p.label}</span>
                <span className="count">{p.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {pageError ? (
        <div
          style={{
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            borderRadius: 12,
            padding: 12,
            color: "#b91c1c",
          }}
        >
          {pageError}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="card pad">
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 850 }}>Ke schválení</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                Vyberte zařízení a klikněte na <strong>Aktivovat</strong>. Doplníte jméno a klient si token vyzvedne sám.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="badge pending">
                <span className="b-dot" aria-hidden="true" />
                <span>{pending.length} čeká</span>
              </span>
              <button
                type="button"
                className="btn sm danger"
                onClick={doDeletePendingAll}
                disabled={bulkDeleting || saving}
                title="Smazat všechny čekající instance"
              >
                SMAZAT VŠECHNY INSTANCE KE SCHVÁLENÍ
              </button>
            </div>
          </div>

          <div className="instance-cards" style={{ marginTop: 12 }}>
            {pending.map((r) => (
              <div key={r.id} className="instance-card">
                <div className="instance-card-head">
                  <div className="instance-card-icon" aria-hidden>
                    {clientTypeIcon(r.client_type)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 850 }}>{r.display_name ?? clientTypeLabel(r.client_type)}</div>
                      <Badge status="PENDING" />
                    </div>
                    <div className="instance-card-meta">
                      <div>Vytvořeno: {fmtDateTime(r.created_at)}</div>
                      <div>Online: {fmtDateTime(r.last_seen_at ?? null)}</div>
                    </div>
                    {r.display_name ? (
                      <div className="instance-card-meta" style={{ marginTop: 6 }}>
                        <div>Jméno z registrace: {r.display_name}</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="label">ID instance</div>
                  <div className="instance-card-id">{r.id}</div>
                </div>

                <div className="instance-card-actions">
                  <button type="button" className="btn sm" onClick={() => copyId(r.id)}>
                    {copiedId === r.id ? "Zkopírováno" : "Kopírovat ID"}
                  </button>
                  <button type="button" className="btn sm solid" onClick={() => openActivate(r)} disabled={saving}>
                    Aktivovat
                  </button>
                  <button type="button" className="btn sm danger" onClick={() => doDelete(r)} disabled={saving}>
                    Smazat
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ width: "100%" }}>
        <table className="table" style={{ width: "100%", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "44px" }}>
                <span className="sr-only">Vyber</span>
              </th>
              <th style={{ width: "90px" }}>Stav</th>
              <th style={{ width: "180px" }}>Jméno</th>
              <th style={{ width: "170px" }}>Slouceno do</th>
              <th style={{ width: "140px" }}>Typ smlouvy</th>
              <th style={{ width: "90px" }}>Typ</th>
              <th style={{ width: "150px" }}>Vytvořeno</th>
              <th style={{ width: "150px" }}>Naposledy online</th>
              <th style={{ width: "220px" }}>ID instance</th>
              <th style={{ textAlign: "right" }}>Akce</th>
            </tr>
          </thead>
          <tbody>
            {(rows === null || loading) && (
              <tr>
                <td colSpan={10} style={{ color: "var(--muted)" }}>
                  Načítám…
                </td>
              </tr>
            )}

            {rows !== null && !loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ color: "var(--muted)" }}>
                  Žádné instance.
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((r) => (
                <tr key={r.id} style={r.status === "PENDING" ? { background: "rgba(245,158,11,0.06)" } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Vyber instanci"
                      disabled={!isMergeSelectable(r)}
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => toggleSelection(r.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td style={{ fontWeight: 700 }}>{r.display_name ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>
                    {r.profile_instance_id ? (
                      <span>{profileNameById.get(r.profile_instance_id) ?? r.profile_instance_id}</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>-</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={r.employment_template || "DPP_DPC"}
                      onChange={async (e) => {
                        setSaving(true);
                        setPageError(null);
                        try {
                          await adminSetTemplate(r.id, e.target.value as EmploymentTemplate);
                          await refresh();
                        } catch (err: unknown) {
                          setPageError(errorMessage(err, "Nepodařilo se uložit typ smlouvy."));
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      style={{ minWidth: 120 }}
                    >
                      <option value="DPP_DPC">DPP/DPČ</option>
                      <option value="HPP">HPP</option>
                    </select>
                  </td>
                  <td>{clientTypeLabel(r.client_type)}</td>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{fmtDateTime(r.last_seen_at ?? null)}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
                    {r.id}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {r.status === "ACTIVE" ? (
                        <button type="button" className="btn sm" onClick={() => openRename(r)} disabled={saving}>
                          Přejmenovat
                        </button>
                      ) : null}
                      {r.status === "ACTIVE" ? (
                        <button type="button" className="btn sm warn" onClick={() => doDeactivate(r)} disabled={saving}>
                          Deaktivovat
                        </button>
                      ) : null}
                      {r.status === "DEACTIVATED" ? (
                        <button type="button" className="btn sm" onClick={() => openActivate(r)} disabled={saving}>
                          Reaktivovat
                        </button>
                      ) : null}
                      {r.status !== "REVOKED" && r.status !== "DEACTIVATED" ? (
                        <button type="button" className="btn sm danger" onClick={() => doRevoke(r)} disabled={saving}>
                          Revokovat
                        </button>
                      ) : null}
                      <button type="button" className="btn sm danger" onClick={() => doDelete(r)} disabled={saving}>
                        Smazat
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={activateOpen}
        title="Aktivovat zařízení"
        description={selected ? `ID: ${selected.id}` : undefined}
        onClose={() => {
          if (saving) return;
          setActivateOpen(false);
          setSelected(null);
          setModalError(null);
          setTemplate("DPP_DPC");
        }}
        onConfirm={doActivate}
        confirmText="Aktivovat"
        cancelText="Zrušit"
        loading={saving}
        disableConfirm={!normDisplayName(displayName)}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {selected ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "var(--muted)", fontSize: 13 }}>
              <div>
                <strong>Typ:</strong> {clientTypeLabel(selected.client_type)}
              </div>
              <div>
                <strong>Vytvořeno:</strong> {fmtDateTime(selected.created_at)}
              </div>
            </div>
          ) : null}

          <div>
            <div className="label">Jméno a příjmení</div>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Např. Jan Novák"
              autoFocus
            />
          </div>

          <div>
            <div className="label">Typ smlouvy</div>
            <select
              className="input"
              value={template}
              onChange={(e) => setTemplate(e.target.value as EmploymentTemplate)}
              style={{ maxWidth: 200 }}
            >
              <option value="DPP_DPC">DPP/DPČ</option>
              <option value="HPP">HPP</option>
            </select>
          </div>

          {modalError ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{modalError}</div> : null}
        </div>
      </Modal>

      <Modal
        open={mergeOpen}
        title="Sloucit entity"
        description="Vyberte cilovou instanci. Ostatni se priradi k jejimu profilu dochazky."
        onClose={() => {
          if (mergeSaving) return;
          setMergeOpen(false);
          setMergeError(null);
        }}
        onConfirm={doMerge}
        confirmText="Sloucit"
        cancelText="Zrusit"
        loading={mergeSaving}
        disableConfirm={!mergeTargetId || selectedRows.length < 2}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Slouceni presune dochazku a plan smen do cilove entity. Zdrojove entity zustanou aktivni, ale budou sdilet
            jeden profil.
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {selectedRows.map((r) => (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  name="merge-target"
                  value={r.id}
                  checked={mergeTargetId === r.id}
                  onChange={() => setMergeTargetId(r.id)}
                />
                <span style={{ fontWeight: 700 }}>{r.display_name ?? clientTypeLabel(r.client_type)}</span>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>{r.id}</span>
              </label>
            ))}
          </div>

          {mergeError ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{mergeError}</div> : null}
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        title="Přejmenovat zařízení"
        description={selected ? `ID: ${selected.id}` : undefined}
        onClose={() => {
          if (saving) return;
          setRenameOpen(false);
          setSelected(null);
          setModalError(null);
        }}
        onConfirm={doRename}
        confirmText="Uložit"
        cancelText="Zrušit"
        loading={saving}
        disableConfirm={!normDisplayName(displayName)}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div className="label">Jméno a příjmení</div>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Např. Jan Novák"
              autoFocus
            />
          </div>
          {modalError ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{modalError}</div> : null}
        </div>
      </Modal>
    </div>
  );
}
