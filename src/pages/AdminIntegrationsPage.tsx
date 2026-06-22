import { useEffect, useMemo, useState } from "react";
import {
  adminCreateIntegrationClient,
  adminDisableIntegrationClient,
  adminEnableIntegrationClient,
  adminListIntegrationClients,
  adminRevokeIntegrationSecret,
  adminRotateIntegrationClient,
  type IntegrationClient,
} from "../api/admin";
import { ConfirmDialog, EmptyState, FilterBar, InlineNotice, PageHeader, StateBadge } from "../components/admin/AdminUI";
import Button from "../ui/Button";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

type SecretModalState =
  | { kind: "closed" }
  | { kind: "open"; clientName: string; token: string; fingerprint: string | null; last4: string | null };

type ActionState =
  | { kind: "none" }
  | { kind: "disable"; client: IntegrationClient }
  | { kind: "enable"; client: IntegrationClient }
  | { kind: "revoke"; client: IntegrationClient }
  | { kind: "rotate"; client: IntegrationClient };

function parseNumberList(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  ).sort((a, b) => a - b);
}

function parseStringList(value: string): string[] {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean))).sort();
}

export default function AdminIntegrationsPage() {
  const [clients, setClients] = useState<IntegrationClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionState, setActionState] = useState<ActionState>({ kind: "none" });
  const [secretState, setSecretState] = useState<SecretModalState>({ kind: "closed" });
  const [form, setForm] = useState({
    name: "",
    scopes: "integration:health, employments:read",
    allowedEmploymentIds: "",
    allowedEmployeeIds: "",
    ipAllowlist: "",
    expiresAt: "",
    createdBy: "admin-web",
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setClients(await adminListIntegrationClients());
    } catch (err) {
      setError(errorMessage(err, "Nepodařilo se načíst integrační klienty."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const token = query.trim().toLowerCase();
    if (!token) return clients;
    return clients.filter((client) => {
      const haystack = `${client.name} ${client.status} ${client.scopes.join(" ")} ${client.active_secret_fingerprint || ""}`.toLowerCase();
      return haystack.includes(token);
    });
  }, [clients, query]);

  async function runAction(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setActionState({ kind: "none" });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Operace nad integračním klientem selhala."));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminCreateIntegrationClient({
        name: form.name.trim(),
        scopes: parseStringList(form.scopes),
        allowed_employment_ids: parseNumberList(form.allowedEmploymentIds),
        allowed_employee_ids: parseNumberList(form.allowedEmployeeIds),
        ip_allowlist: parseStringList(form.ipAllowlist),
        expires_at: form.expiresAt.trim() || null,
        created_by: form.createdBy.trim() || null,
      });
      setSecretState({
        kind: "open",
        clientName: result.client.name,
        token: result.plaintext_token,
        fingerprint: result.client.active_secret_fingerprint,
        last4: result.client.active_secret_last4,
      });
      setForm({
        name: "",
        scopes: "integration:health, employments:read",
        allowedEmploymentIds: "",
        allowedEmployeeIds: "",
        ipAllowlist: "",
        expiresAt: "",
        createdBy: "admin-web",
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Nepodařilo se vytvořit integračního klienta."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page-grid">
      <PageHeader
        eyebrow="Externí API"
        title="Integrace"
        description="Správa read-only integračních klientů pro externí systémy včetně scope, rozsahu dat, expirace a rotace tokenů."
        actions={
          <div className="admin-action-stack">
            <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading || busy}>
              Obnovit seznam
            </Button>
          </div>
        }
      />

      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      <FilterBar>
        <input className="kb-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrovat podle názvu, stavu nebo scope" />
      </FilterBar>

      <div className="admin-overview-grid">
        <section className="admin-surface">
          <div className="admin-surface-head">
            <div>
              <div className="admin-surface-title">Nový integrační klient</div>
              <div className="admin-surface-subtitle">Plaintext token se zobrazí pouze jednou po vytvoření nebo rotaci.</div>
            </div>
          </div>
          <form className="admin-stack" onSubmit={onCreate}>
            <div className="admin-form-grid">
              <div>
                <div className="kb-label">Název klienta</div>
                <input className="kb-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Např. mzdový import" required />
              </div>
              <div>
                <div className="kb-label">Created by</div>
                <input className="kb-input" value={form.createdBy} onChange={(event) => setForm((current) => ({ ...current, createdBy: event.target.value }))} placeholder="admin-web" />
              </div>
              <div>
                <div className="kb-label">Scopes</div>
                <input className="kb-input" value={form.scopes} onChange={(event) => setForm((current) => ({ ...current, scopes: event.target.value }))} placeholder="integration:health, employments:read" />
              </div>
              <div>
                <div className="kb-label">Povolené employment_id</div>
                <input className="kb-input" value={form.allowedEmploymentIds} onChange={(event) => setForm((current) => ({ ...current, allowedEmploymentIds: event.target.value }))} placeholder="1, 2, 3" />
              </div>
              <div>
                <div className="kb-label">Povolené employee_id</div>
                <input className="kb-input" value={form.allowedEmployeeIds} onChange={(event) => setForm((current) => ({ ...current, allowedEmployeeIds: event.target.value }))} placeholder="10, 11" />
              </div>
              <div>
                <div className="kb-label">IP allowlist</div>
                <input className="kb-input" value={form.ipAllowlist} onChange={(event) => setForm((current) => ({ ...current, ipAllowlist: event.target.value }))} placeholder="89.221.222.92, 10.0.0.0/24" />
              </div>
              <div>
                <div className="kb-label">Expires at (ISO 8601)</div>
                <input className="kb-input" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} placeholder="2026-12-31T23:59:59Z" />
              </div>
            </div>
            <div className="admin-action-row">
              <Button type="submit" variant="primary" disabled={busy || !form.name.trim()}>
                {busy ? "Vytvářím..." : "Vytvořit klienta"}
              </Button>
            </div>
          </form>
        </section>

        <section className="admin-surface">
          <div className="admin-surface-head">
            <div>
              <div className="admin-surface-title">Existující klienti</div>
              <div className="admin-surface-subtitle">{filtered.length} z {clients.length} klientů odpovídá filtru.</div>
            </div>
          </div>
          {loading ? (
            <InlineNotice>Načítám integrační klienty…</InlineNotice>
          ) : filtered.length === 0 ? (
            <EmptyState title="Žádní klienti" description="Zatím nebyl vytvořen žádný integrační klient." />
          ) : (
            <div className="admin-list">
              {filtered.map((client) => (
                <div key={client.id} className="admin-list-row">
                  <div>
                    <div className="admin-list-title">{client.name}</div>
                    <div className="admin-list-subtitle">
                      ID {client.id} · scopes: {client.scopes.join(", ") || "žádné"} · fingerprint {client.active_secret_fingerprint || "—"} · last4 {client.active_secret_last4 || "—"}
                    </div>
                    <div className="admin-list-subtitle">
                      employment_id: {client.allowed_employment_ids.join(", ") || "vše"} · employee_id: {client.allowed_employee_ids.join(", ") || "vše"} · IP: {client.ip_allowlist.join(", ") || "bez omezení"}
                    </div>
                    <div className="admin-list-subtitle">
                      expires {client.expires_at ? new Date(client.expires_at).toLocaleString("cs-CZ") : "nikdy"} · last used {client.last_used_at ? new Date(client.last_used_at).toLocaleString("cs-CZ") : "nikdy"}
                    </div>
                  </div>
                  <div className="admin-action-stack">
                    <StateBadge
                      tone={
                        client.status === "ACTIVE"
                          ? "ok"
                          : client.status === "DISABLED"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {client.status}
                    </StateBadge>
                    <div className="admin-action-row">
                      <Button type="button" variant="secondary" disabled={busy} onClick={() => setActionState({ kind: "rotate", client })}>
                        Rotovat token
                      </Button>
                      {client.status === "ACTIVE" ? (
                        <Button type="button" variant="ghost" disabled={busy} onClick={() => setActionState({ kind: "disable", client })}>
                          Zakázat
                        </Button>
                      ) : null}
                      {client.status === "DISABLED" ? (
                        <Button type="button" variant="primary" disabled={busy} onClick={() => setActionState({ kind: "enable", client })}>
                          Povolit
                        </Button>
                      ) : null}
                      {client.status !== "REVOKED" ? (
                        <Button type="button" variant="danger" disabled={busy} onClick={() => setActionState({ kind: "revoke", client })}>
                          Revokovat secret
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={actionState.kind !== "none"}
        title={
          actionState.kind === "disable"
            ? "Zakázat klienta"
            : actionState.kind === "enable"
              ? "Povolit klienta"
              : actionState.kind === "revoke"
                ? "Revokovat aktivní secret"
                : actionState.kind === "rotate"
                  ? "Rotovat token"
                  : ""
        }
        description={
          actionState.kind === "rotate"
            ? "Stávající token bude okamžitě zneplatněn a nový plaintext token se zobrazí pouze jednou."
            : "Tato operace změní produkční stav integračního klienta."
        }
        confirmLabel={
          actionState.kind === "disable"
            ? "Zakázat"
            : actionState.kind === "enable"
              ? "Povolit"
              : actionState.kind === "revoke"
                ? "Revokovat"
                : "Rotovat"
        }
        tone={actionState.kind === "revoke" ? "danger" : "default"}
        busy={busy}
        onClose={() => setActionState({ kind: "none" })}
        onConfirm={() =>
          void runAction(async () => {
            if (actionState.kind === "disable") {
              await adminDisableIntegrationClient(actionState.client.id);
              return;
            }
            if (actionState.kind === "enable") {
              await adminEnableIntegrationClient(actionState.client.id);
              return;
            }
            if (actionState.kind === "revoke") {
              await adminRevokeIntegrationSecret(actionState.client.id);
              return;
            }
            if (actionState.kind === "rotate") {
              const result = await adminRotateIntegrationClient(actionState.client.id);
              setSecretState({
                kind: "open",
                clientName: result.client.name,
                token: result.plaintext_token,
                fingerprint: result.client.active_secret_fingerprint,
                last4: result.client.active_secret_last4,
              });
            }
          })
        }
      />

      <ConfirmDialog
        open={secretState.kind === "open"}
        title="Jednorázově zobrazený token"
        description={
          secretState.kind === "open" ? (
            <div className="admin-stack">
              <div>Klient: <strong>{secretState.clientName}</strong></div>
              <div>Tento token už později v administraci neuvidíte. Uložte ho bezpečným způsobem do cílového systému.</div>
              <div className="admin-dialog-stat-value" style={{ wordBreak: "break-all" }}>{secretState.token}</div>
              <div>Fingerprint: {secretState.fingerprint || "—"} · last4: {secretState.last4 || "—"}</div>
            </div>
          ) : undefined
        }
        confirmLabel="Zavřít"
        onConfirm={() => setSecretState({ kind: "closed" })}
        onClose={() => setSecretState({ kind: "closed" })}
      />
    </div>
  );
}
