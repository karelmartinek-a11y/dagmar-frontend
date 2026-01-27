/**
 * Provizorní stránka Plán služeb, aby odkaz v menu nevedl na /pending.
 * Zatím jen zobrazí informaci, než bude implementováno plné UI.
 */
export default function AdminShiftPlanPage() {
  return (
    <div className="dg-card pad" style={{ maxWidth: 820 }}>
      <h1 style={{ marginTop: 0, marginBottom: 12 }}>Plán služeb</h1>
      <p style={{ marginBottom: 10 }}>
        Plánování směn bude doplněno. Tato stránka je dočasná, aby odkaz v menu nevedl na čekací obrazovku.
      </p>
      <p style={{ color: "var(--muted)" }}>
        Pokud potřebujete plán služeb exportovat, použijte prosím sekci <strong>Export</strong>.
      </p>
    </div>
  );
}
