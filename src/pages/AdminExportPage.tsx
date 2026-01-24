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
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Export</h1>
          <div style={{ marginTop: 6, color: "rgba(15,23,42,0.7)", fontSize: 13 }}>
            CSV export docházky dle měsíce. Individuálně pro instanci nebo hromadně pro všechny.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
            placeholder="YYYY-MM"
            aria-label="Měsíc (YYYY-MM)"
            style={{ ...input, width: 130, textAlign: "center", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
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

      {!monthValid && (
        <div style={warnBox}>
          Zadejte měsíc ve formátu <strong>YYYY-MM</strong> (např. 2026-01).
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginTop: 18 }}>
        <section style={card}>
          <h2 style={h2}>Individuální export</h2>
          <div style={{ color: "rgba(15,23,42,0.7)", fontSize: 13, marginTop: 6 }}>
            Zadejte <strong>ID instance</strong> a stáhněte CSV pro vybraný měsíc.
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <input
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder="instance_id"
              aria-label="ID instance"
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
              Stáhnout CSV
            </a>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(15,23,42,0.6)" }}>
            Tip: ID instance najdete v sekci <strong>Instances</strong>.
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>Hromadný export</h2>
          <div style={{ color: "rgba(15,23,42,0.7)", fontSize: 13, marginTop: 6 }}>
            Stáhne ZIP obsahující CSV soubory pro všechny aktivní instance za vybraný měsíc.
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
              Stáhnout ZIP
            </a>
            <div style={{ fontSize: 12, color: "rgba(15,23,42,0.6)" }}>
              Souborové názvy mají tvar <code style={codeStyle}>nazev_instance_YYYY-MM.csv</code>.
            </div>
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>Poznámky</h2>
          <ul style={{ margin: "8px 0 0 18px", color: "rgba(15,23,42,0.75)", fontSize: 13, lineHeight: 1.6 }}>
            <li>Export pracuje s uloženými hodnotami <strong>příchod</strong> a <strong>odchod</strong> (HH:MM nebo prázdné).</li>
            <li>Datum je ve formátu <strong>YYYY-MM-DD</strong>.</li>
            <li>Pokud je instance REVOKED, export může být prázdný (podle dat v DB).</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  background: "white",
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
};

const h2: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
};

const input: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
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
  border: "1px solid rgba(2,132,199,0.25)",
  background: "linear-gradient(90deg, rgba(2,132,199,0.98), rgba(59,130,246,0.96))",
  color: "white",
};

const btnSecondary: CSSProperties = {
  height: 44,
  width: 44,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "white",
  color: "rgba(15,23,42,0.9)",
  fontWeight: 900,
  cursor: "pointer",
};

const warnBox: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(245, 158, 11, 0.12)",
  border: "1px solid rgba(245, 158, 11, 0.25)",
  color: "rgba(120, 53, 15, 0.95)",
  fontSize: 13,
};

const codeStyle: CSSProperties = {
  background: "rgba(15,23,42,0.06)",
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 8,
  padding: "2px 8px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
