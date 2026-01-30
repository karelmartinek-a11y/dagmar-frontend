import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  adminGetShiftPlanMonth,
  adminSetShiftPlanSelection,
  adminUpsertShiftPlan,
  type ShiftPlanMonth,
} from "../api/adminShiftPlan";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseIsoMonth(value: string) {
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const now = new Date();
  if (!year || !month) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
}

function monthLabel(year: number, month: number) {
  const dt = new Date(year, month - 1, 1);
  return dt.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function weekdayAbbrev(dateText: string) {
  const dt = new Date(`${dateText}T00:00:00`);
  return dt.toLocaleDateString("cs-CZ", { weekday: "short" });
}

export default function AdminShiftPlanPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  });
  const [plan, setPlan] = useState<ShiftPlanMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const { year, month: monthNum } = useMemo(() => parseIsoMonth(month), [month]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await adminGetShiftPlanMonth({ year, month: monthNum });
        if (cancelled) return;
        setPlan(data);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Načtení plánu se nezdařilo.";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, monthNum, refreshTick]);

  const monthDisplay = monthLabel(year, monthNum);

  const activeInstances = plan?.active_instances ?? [];

  const rows = plan?.rows ?? [];

  const selectedIds = plan?.selected_instance_ids ?? [];

  const overlayMessage = useMemo(() => {
    if (!plan || plan.rows.length === 0) {
      return "Vyberte entitu, která má být v plánu služby, z horního výběru aktivních zařízení.";
    }
    return null;
  }, [plan]);

  const handleMonthChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value) return;
    setMonth(event.target.value);
  };

  const handleToggleInstance = async (instanceId: string) => {
    if (!plan) return;
    setSaveError(null);
    const currentlySelected = plan.selected_instance_ids;
    const exists = currentlySelected.includes(instanceId);
    const nextSelection = exists
      ? currentlySelected.filter((id) => id !== instanceId)
      : [...currentlySelected, instanceId];
    try {
      await adminSetShiftPlanSelection({ year, month: monthNum, instance_ids: nextSelection });
      setRefreshTick((tick) => tick + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nelze aktualizovat výběr.";
      setSaveError(message);
    }
  };

  const handleInputChange = (
    instanceId: string,
    date: string,
    field: "arrival_time" | "departure_time",
    value: string
  ) => {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.instance_id !== instanceId) return row;
          return {
            ...row,
            days: row.days.map((day) => {
              if (day.date !== date) return day;
              return { ...day, [field]: value === "" ? null : value };
            }),
          };
        }),
      };
    });
  };

  const handleInputBlur = async (instanceId: string, date: string) => {
    if (!plan) return;
    setSaveError(null);
    const row = plan.rows.find((r) => r.instance_id === instanceId);
    if (!row) return;
    const day = row.days.find((d) => d.date === date);
    if (!day) return;

    const key = `${instanceId}:${date}`;
    setSavingCells((prev) => ({ ...prev, [key]: true }));
    try {
      await adminUpsertShiftPlan({
        instance_id: instanceId,
        date,
        arrival_time: day.arrival_time,
        departure_time: day.departure_time,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nelze uložit změnu plánu.";
      setSaveError(message);
    } finally {
      setSavingCells((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div className="plan-page">
      <div className="plan-top-row">
        <div>
          <div className="page-title">Plán služeb</div>
          <div className="plan-instruction">
            Rozložení jednotlivých buněk vychází z <strong>PlanSmen.pdf</strong>; podle něj jsou zadávány časy.
          </div>
        </div>
        <div className="plan-month-picker">
          <label className="label" htmlFor="plan-month-input">
            Vyberte měsíc
          </label>
          <input
            id="plan-month-input"
            className="input"
            type="month"
            value={month}
            onChange={handleMonthChange}
          />
          <div className="help">{monthDisplay}</div>
        </div>
      </div>

      <div className="plan-chip-row">
        {activeInstances.map((instance) => {
          const selected = selectedIds.includes(instance.id);
          return (
            <button
              key={instance.id}
              type="button"
              className={`plan-chip${selected ? " selected" : ""}`}
              onClick={() => handleToggleInstance(instance.id)}
            >
              <span className="plan-chip-name">{instance.display_name ?? instance.id.slice(0, 8)}</span>
              <span className="plan-chip-meta">{instance.employment_template}</span>
            </button>
          );
        })}
        {activeInstances.length === 0 ? (
          <div className="plan-chip-empty">Žádná aktivní zařízení k zobrazení.</div>
        ) : null}
      </div>

      {loading ? (
        <div className="plan-loading">Načítám plán...</div>
      ) : error ? (
        <div className="plan-error">{error}</div>
      ) : null}
      {saveError ? <div className="plan-error">{saveError}</div> : null}

      {rows.length === 0 ? (
        <div className="plan-grid-empty">{overlayMessage}</div>
      ) : (
        rows.map((row) => (
          <section className="plan-card" key={row.instance_id}>
            <header className="plan-card-header">
              <div>
                <div className="plan-card-title">{row.display_name ?? row.instance_id}</div>
                <div className="plan-card-meta">Šablona: {row.employment_template}</div>
              </div>
              <div className="plan-card-id">{row.instance_id}</div>
            </header>
            <div className="plan-grid">
              {row.days.map((day) => {
                const key = `${row.instance_id}:${day.date}`;
                return (
                  <label className="plan-cell" key={day.date}>
                    <div className="plan-cell-header">
                      <span className="plan-day-number">{day.date.slice(-2)}</span>
                      <span className="plan-day-weekday">{weekdayAbbrev(day.date)}</span>
                    </div>
                    <div className="plan-time-row">
                      <input
                        type="time"
                        className="plan-time-input"
                        value={day.arrival_time ?? ""}
                        onChange={(event) =>
                          handleInputChange(row.instance_id, day.date, "arrival_time", event.target.value)
                        }
                        onBlur={() => handleInputBlur(row.instance_id, day.date)}
                        aria-label={`Plánovaný příchod pro ${day.date}`}
                      />
                      <input
                        type="time"
                        className="plan-time-input"
                        value={day.departure_time ?? ""}
                        onChange={(event) =>
                          handleInputChange(row.instance_id, day.date, "departure_time", event.target.value)
                        }
                        onBlur={() => handleInputBlur(row.instance_id, day.date)}
                        aria-label={`Plánovaný odchod pro ${day.date}`}
                      />
                    </div>
                    <div className="plan-saving">{savingCells[key] ? "Ukládám…" : "\u00A0"}</div>
                  </label>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
