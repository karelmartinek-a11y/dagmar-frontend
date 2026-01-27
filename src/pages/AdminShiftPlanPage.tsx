/**
 * Provizorní stránka Plán služeb, aby odkaz v menu nevedl na /pending.
 * Zatím jen zobrazí informaci, než bude implementováno plné UI.
 */
import { useEffect, useMemo, useState } from "react";
import { adminGetShiftPlanMonth, adminSetShiftPlanSelection, adminUpsertShiftPlan, type ShiftPlanDay, type ShiftPlanMonthResponse } from "../api/adminShiftPlan";
import { AndroidDownloadBanner } from "../components/AndroidDownloadBanner";
import { BrandLoader } from "../components/BrandLoader";
import dagmarLogo from "../assets/dagmar-logo.png";

type TimeField = "arrival_time" | "departure_time";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function yyyyMm(d: Date) {
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

function monthLabel(yyyyMmStr: string) {
  const parsed = parseYYYYMM(yyyyMmStr);
  if (!parsed) return yyyyMmStr;
  const dt = new Date(parsed.year, parsed.month - 1, 1);
  return dt.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function normalizeTime(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^\d{4}$/.test(v)) {
    const hh = parseInt(v.slice(0, 2), 10);
    const mm = parseInt(v.slice(2), 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${pad2(hh)}:${pad2(mm)}`;
    return v;
  }
  const colon = v.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const hh = parseInt(colon[1], 10);
    const mm = parseInt(colon[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${pad2(hh)}:${pad2(mm)}`;
    return v;
  }
  if (/^\d{1,2}$/.test(v)) {
    const hh = parseInt(v, 10);
    if (hh >= 0 && hh <= 23) return `${pad2(hh)}:00`;
  }
  return v;
}

function isValidTimeOrEmpty(value: string): boolean {
  const v = normalizeTime(value);
  if (v === "") return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

function DaysHeader({ days }: { days: ShiftPlanDay[] }) {
  return (
    <div className="plan-grid plan-grid-head">
      <div className="plan-cell head">Zařízení</div>
      {days.map((d) => {
        const dt = new Date(d.date);
        const dow = dt.toLocaleDateString("cs-CZ", { weekday: "short" });
        return (
          <div key={d.date} className="plan-cell head">
            <div style={{ fontWeight: 800 }}>{dt.getDate()}. {dt.getMonth() + 1}.</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{dow}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminShiftPlanPage() {
  const [month, setMonth] = useState(() => yyyyMm(new Date()));
  const [data, setData] = useState<ShiftPlanMonthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const [savingCell, setSavingCell] = useState<Record<string, boolean>>({});

  const days = useMemo<ShiftPlanDay[]>(() => {
    const parsed = parseYYYYMM(month);
    if (!parsed) return [];
    const { year, month: m } = parsed;
    const count = new Date(year, m, 0).getDate();
    const out: ShiftPlanDay[] = [];
    for (let d = 1; d <= count; d++) {
      const date = `${year}-${pad2(m)}-${pad2(d)}`;
      out.push({ date, arrival_time: null, departure_time: null });
    }
    return out;
  }, [month]);

  async function load() {
    const parsed = parseYYYYMM(month);
    if (!parsed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminGetShiftPlanMonth({ year: parsed.year, month: parsed.month });
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Nepodařilo se načíst plán směn.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function toggleInstance(id: string, checked: boolean) {
    if (!data) return;
    const parsed = parseYYYYMM(month);
    if (!parsed) return;
    setSavingSelection(true);
    setError(null);
    try {
      const next = checked ? [...data.selected_instance_ids, id] : data.selected_instance_ids.filter((x) => x !== id);
      await adminSetShiftPlanSelection({ year: parsed.year, month: parsed.month, instance_ids: next });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Uložení výběru se nezdařilo.");
    } finally {
      setSavingSelection(false);
    }
  }

  async function saveCell(instanceId: string, date: string, field: TimeField, value: string) {
    const parsed = normalizeTime(value);
    if (!isValidTimeOrEmpty(parsed)) return;
    const key = `${instanceId}-${date}-${field}`;
    setSavingCell((prev) => ({ ...prev, [key]: true }));
    try {
      await adminUpsertShiftPlan({
        instance_id: instanceId,
        date,
        arrival_time: field === "arrival_time" ? (parsed === "" ? null : parsed) : null,
        departure_time: field === "departure_time" ? (parsed === "" ? null : parsed) : null,
      });
      await load();
    } catch (e) {
      // noop; error is acceptable for now
    } finally {
      setSavingCell((prev) => ({ ...prev, [key]: false }));
    }
  }

  const selectedRows = data?.rows ?? [];
  const active = data?.active_instances ?? [];

  return (
    <div className="dg-page">
      <div className="container" style={{ padding: "10px 0 0" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 12px 10px" }}>
          <AndroidDownloadBanner downloadUrl="/download/adminhcasc.apk" appName="DAGMAR Admin" storageKey="dagmar_admin_banner" />
        </div>
      </div>

      {loading ? <BrandLoader fullscreen logoSrc={dagmarLogo} title="Načítám plán směn…" /> : null}

      <main className="dg-main" style={{ width: "min(1180px, 100%)" }}>
        <div className="dg-card pad" style={{ marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="label">Měsíc</div>
            <input
              className="input"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>
            Vyberte zařízení a doplňte plánované časy (volitelně). Změny se ukládají po opuštění pole.
          </div>
        </div>

        <div className="dg-card pad" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Aktivní zařízení</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {active.map((a) => {
              const checked = data?.selected_instance_ids?.includes(a.id);
              return (
                <label key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(7,20,36,0.12)", background: checked ? "rgba(4,156,227,0.10)" : "#fff" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={savingSelection}
                    onChange={(e) => toggleInstance(a.id, e.target.checked)}
                  />
                  <span style={{ fontWeight: 750 }}>{a.display_name || "Bez názvu"}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{a.employment_template}</span>
                </label>
              );
            })}
            {active.length === 0 ? <div style={{ color: "var(--muted)" }}>Žádná aktivní zařízení.</div> : null}
          </div>
        </div>

        {error ? (
          <div className="dg-card pad" style={{ border: "1px solid rgba(239,68,68,0.28)", color: "#b91c1c" }}>
            {error}
          </div>
        ) : null}

        {selectedRows.length === 0 ? (
          <div className="dg-card pad">Vyberte alespoň jedno aktivní zařízení pro zobrazení plánu směn.</div>
        ) : (
          <div className="dg-card pad" style={{ overflowX: "auto" }}>
            <div style={{ marginBottom: 8, fontWeight: 800 }}>{monthLabel(month)}</div>
            <DaysHeader days={days} />
            {selectedRows.map((row) => {
              const dayMap = new Map(row.days.map((d) => [d.date, d]));
              return (
                <div key={row.instance_id} className="plan-grid">
                  <div className="plan-cell head" style={{ fontWeight: 850 }}>
                    <div>{row.display_name || "Bez názvu"}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.instance_id.slice(0, 8)}</div>
                  </div>
                  {days.map((d) => {
                    const val = dayMap.get(d.date);
                    const arrival = val?.arrival_time ?? "";
                    const departure = val?.departure_time ?? "";
                    return (
                      <div key={d.date} className="plan-cell">
                        <div style={{ display: "grid", gap: 6 }}>
                          <input
                            className="input"
                            style={{ padding: "8px 10px" }}
                            placeholder="Příchod"
                            value={arrival}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (isValidTimeOrEmpty(v)) {
                                saveCell(row.instance_id, d.date, "arrival_time", v);
                              }
                            }}
                          />
                          <input
                            className="input"
                            style={{ padding: "8px 10px" }}
                            placeholder="Odchod"
                            value={departure}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (isValidTimeOrEmpty(v)) {
                                saveCell(row.instance_id, d.date, "departure_time", v);
                              }
                            }}
                          />
                          {savingCell[`${row.instance_id}-${d.date}-arrival_time`] || savingCell[`${row.instance_id}-${d.date}-departure_time`]
                            ? <div style={{ fontSize: 11, color: "var(--muted)" }}>Ukládám…</div>
                            : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
