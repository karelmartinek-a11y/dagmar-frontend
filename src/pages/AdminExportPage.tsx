import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { adminExportBulkUrl, adminExportInstanceUrl } from "../api/admin";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthToYYYYMM(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseYYYYMM(s: string): { year: number; month: number } | null {
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function prevMonth(yyyyMm: string): string {
  const parsed = parseYYYYMM(yyyyMm);
  if (!parsed) return yyyyMm;
  let { year, month } = parsed;
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${pad2(month)}`;
}

function nextMonth(yyyyMm: string): string {
  const parsed = parseYYYYMM(yyyyMm);
  if (!parsed) return yyyyMm;
  let { year, month } = parsed;
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${pad2(month)}`;
}

export default function AdminExportPage() {
  const defaultMonth = useMemo(() => monthToYYYYMM(new Date()), []);
  const [month, setMonth] = useState<string>(defaultMonth);
  const [instanceId, setInstanceId] = useState<string>("");

  const bulkUrl = useMemo(() => {
    const m = parseYYYYMM(month);
    if (!m) return null;
    return adminExportBulkUrl(month);
  }, [month]);

  const instanceUrl = useMemo(() => {
    const m = parseYYYYMM(month);
    if (!m) return null;
    const trimmed = instanceId.trim();
    if (!trimmed) return null;
    return adminExportInstanceUrl(month, trimmed);
  }, [month, instanceId]);

  const monthValid = useMemo(() => parseYYYYMM(month) !== null, [month]);

  return (
    <div className="admin-page">
      <section className="card admin-hero">
        <div className="admin-hero-copy">
          <div className="eyebrow">Administrace · Export</div>
          <h1 className="admin-hero-title">Export docházky</h1>
          <div className="admin-hero-text">
            Připravte export pro jedno zařízení nebo hromadné stažení za celý měsíc. Ovládání je rozdělené tak, aby výběr období a akce byly čitelné i na široké obrazovce.
          </div>
        </div>

        <div className="admin-kpis">
          <div className="admin-kpi">
            <div className="admin-kpi-value">{month}</div>
            <div className="admin-kpi-label">Zvolený měsíc</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-value">{instanceId.trim() ? 1 : 0}</div>
            <div className="admin-kpi-label">Připravené jednotlivé zařízení</div>
          </div>
        </div>
      </section>

      {!monthValid && (
        <div style={warnBox}>
          Zadejte měsíc například ve tvaru <strong>2026-03</strong>.
        </div>
      )}

      <div className="admin-two-column">
        <section style={card} className="admin-side-card">
          <div className="admin-note-box" style={{ marginBottom: 14 }}>
            <div className="admin-note-title">Volba období</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setMonth((m) => prevMonth(m))}
                style={btnSecondary}
                title="Předchozí měsíc"
              >
                ←
              </button>
              <input
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                inputMode="numeric"
                placeholder="například 2026-03"
                aria-label="Měsíc"
                style={{ ...input, width: 160, textAlign: "center", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              />
              <button
                type="button"
                onClick={() => setMonth((m) => nextMonth(m))}
                style={btnSecondary}
                title="Další měsíc"
              >
                →
              </button>
            </div>
          </div>

          <section>
            <h2 style={h2}>Jednotlivý export</h2>
            <div style={{ color: "rgba(35,41,44,0.7)", fontSize: 13, marginTop: 6 }}>
              Zadejte <strong>identifikátor zařízení</strong> a stáhněte export pro vybraný měsíc.
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <input
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="například inst-001"
                aria-label="Identifikátor zařízení"
                style={{ ...input, width: 360, maxWidth: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              />

              <a
                href={instanceUrl ?? "#"}
                onClick={(e) => {
                  if (!instanceUrl) e.preventDefault();
                }}
                style={{
                  ...btnPrimary,
                  opacity: instanceUrl ? 1 : 0.5,
                  pointerEvents: instanceUrl ? "auto" : "none",
                  textDecoration: "none",
                }}
                download
              >
                Stáhnout export
              </a>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(35,41,44,0.6)" }}>
              Tip: identifikátor zařízení najdete v přehledu zařízení v administraci.
            </div>
          </section>

          <div className="admin-note-box" style={{ marginTop: 14 }}>
            <div className="admin-note-title">Kontrola před stažením</div>
            <ul className="admin-note-list" style={{ marginTop: 6 }}>
              <li>Ověřte, že je zvolen správný měsíc.</li>
              <li>Pro jednotlivý export použijte úplný identifikátor zařízení.</li>
              <li>Pokud export chybí, zkontrolujte nejdřív stav zařízení v administraci.</li>
            </ul>
          </div>

        </section>

        <div className="stack">
          <section style={card}>
            <h2 style={h2}>Hromadné stažení</h2>
            <div style={{ color: "rgba(35,41,44,0.7)", fontSize: 13, marginTop: 6 }}>
              Stáhne balík exportů pro všechna aktivní zařízení za vybraný měsíc.
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <a
                href={bulkUrl ?? "#"}
                onClick={(e) => {
                  if (!bulkUrl) e.preventDefault();
                }}
                style={{
                  ...btnPrimary,
                  opacity: bulkUrl ? 1 : 0.5,
                  pointerEvents: bulkUrl ? "auto" : "none",
                  textDecoration: "none",
                }}
                download
              >
                Stáhnout balík
              </a>
              <div style={{ fontSize: 12, color: "rgba(35,41,44,0.6)" }}>
                Souborové názvy obsahují název zařízení a zvolený měsíc, například <code style={codeStyle}>nazev_zarizeni_2026-03</code>.
              </div>
            </div>
          </section>

          <section style={card}>
            <h2 style={h2}>Poznámky</h2>
            <ul className="admin-note-list">
              <li>Export pracuje s uloženými hodnotami <strong>příchod</strong> a <strong>odchod</strong> v čase, nebo s prázdnou hodnotou.</li>
              <li>Datum se ukládá ve tvaru rok-měsíc-den, například <strong>2026-03-20</strong>.</li>
              <li>Pokud je zařízení zneplatněné, může být export prázdný podle dostupných dat.</li>
            </ul>
          </section>

          <section style={card}>
            <h2 style={h2}>Co export obsahuje</h2>
            <div style={{ color: "rgba(35,41,44,0.75)", fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>
              V jednotlivém i hromadném exportu jsou připravené docházkové záznamy za celý kalendářní měsíc. Struktura je vhodná
              pro další zpracování i archivaci.
            </div>
            <div className="admin-note-box" style={{ marginTop: 14 }}>
              <div className="admin-note-title">Doporučené použití</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
                Jednotlivý export je vhodný pro ruční kontrolu jedné osoby. Hromadné stažení je vhodné pro měsíční archiv nebo předání účetnímu zpracování.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  background: "white",
  border: "1px solid rgba(35,41,44,0.10)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 8px 26px rgba(35,41,44,0.06)",
};

const h2: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
};

const input: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid rgba(35,41,44,0.16)",
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
};

const btnPrimary: CSSProperties = {
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  padding: "0 14px",
  fontWeight: 800,
  fontSize: 14,
  border: "1px solid rgba(38,43,49,0.25)",
  background: "linear-gradient(90deg, rgba(38,43,49,0.98), rgba(38,43,49,0.96))",
  color: "white",
};

const btnSecondary: CSSProperties = {
  height: 44,
  width: 44,
  borderRadius: 12,
  border: "1px solid rgba(35,41,44,0.16)",
  background: "white",
  color: "rgba(35,41,44,0.9)",
  fontWeight: 900,
  cursor: "pointer",
};

const warnBox: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255, 0, 0, 0.12)",
  border: "1px solid rgba(255, 0, 0, 0.25)",
  color: "rgba(255, 0, 0, 0.95)",
  fontSize: 13,
};

const codeStyle: CSSProperties = {
  background: "rgba(35,41,44,0.06)",
  border: "1px solid rgba(35,41,44,0.10)",
  borderRadius: 8,
  padding: "2px 8px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
