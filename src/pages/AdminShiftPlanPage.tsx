import { ChangeEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  adminGetShiftPlanMonth,
  adminSetShiftPlanSelection,
  adminUpsertShiftPlan,
  type ShiftPlanMonth,
  type ShiftPlanRow,
} from "../api/adminShiftPlan";
import { isValidTimeOrEmpty, normalizeTime } from "../utils/timeInput";
import { getCzechHolidayName, isWeekendDate, workingDaysInMonthCs } from "../utils/attendanceCalc";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function monthLabel(year: number, month: number) {
  const dt = new Date(year, month - 1, 1);
  return dt.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function monthDays(year: number, month: number) {
  const days: { date: string; number: string; weekday: string }[] = [];
  const current = new Date(year, month - 1, 1);
  while (current.getMonth() === month - 1) {
    const iso = current.toISOString().slice(0, 10);
    days.push({
      date: iso,
      number: pad2(current.getDate()),
      weekday: current.toLocaleDateString("cs-CZ", { weekday: "short" }),
    });
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function minutesFromHHMM(value: string | null) {
  if (!value) return null;
  const [hh, mm] = value.split(":").map((v) => Number(v));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function plannedMinutes(row: ShiftPlanRow) {
  return row.days.reduce((acc, day) => {
    const arrival = minutesFromHHMM(day.arrival_time);
    const departure = minutesFromHHMM(day.departure_time);
    if (arrival !== null && departure !== null && departure > arrival) {
      return acc + (departure - arrival);
    }
    return acc;
  }, 0);
}

function formatHours(mins: number) {
  return (mins / 60).toFixed(1);
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
  const [successCells, setSuccessCells] = useState<Record<string, boolean>>({});
  const successTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const applyFieldValue = (
    instanceId: string,
    date: string,
    field: "arrival_time" | "departure_time",
    value: string | null
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
              return { ...day, [field]: value };
            }),
          };
        }),
      };
    });
  };
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const year = Number(month.slice(0, 4)) || new Date().getFullYear();
  const monthNum = Number(month.slice(5, 7)) || new Date().getMonth() + 1;
  const monthLabelText = monthLabel(year, monthNum);
  const days = useMemo(
    () =>
      monthDays(year, monthNum).map((day) => {
        const isWeekend = isWeekendDate(day.date);
        const holidayName = getCzechHolidayName(day.date);
        return {
          ...day,
          isWeekend,
          isHoliday: Boolean(holidayName),
          isWeekendOrHoliday: isWeekend || Boolean(holidayName),
        };
      }),
    [year, monthNum],
  );
  const workingFundHours = useMemo(() => workingDaysInMonthCs(year, monthNum) * 8, [year, monthNum]);

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
        const message = err instanceof Error ? err.message : "Načtení plánu selhalo.";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, monthNum, refreshTick]);

  useEffect(() => {
    return () => {
      Object.values(successTimeouts.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const selectedIds = plan?.selected_instance_ids ?? [];
  const activeInstances = plan?.active_instances ?? [];

  const handleMonthChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value) return;
    setMonth(event.target.value);
  };

  const handleToggleInstance = async (instanceId: string) => {
    if (!plan) return;
    setSaveError(null);
    const exists = selectedIds.includes(instanceId);
    const nextSelection = exists
      ? selectedIds.filter((id) => id !== instanceId)
      : [...selectedIds, instanceId];
    try {
      await adminSetShiftPlanSelection({ year, month: monthNum, instance_ids: nextSelection });
      setRefreshTick((tick) => tick + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nelze změnit výběr.";
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

  const handleInputBlur = async (
    instanceId: string,
    date: string,
    field: "arrival_time" | "departure_time"
  ) => {
    if (!plan) return;
    setSaveError(null);
    const row = plan.rows.find((r) => r.instance_id === instanceId);
    if (!row) return;
    const day = row.days.find((d) => d.date === date);
    if (!day) return;
    const rawValue = day[field] ?? "";
    const normalized = normalizeTime(rawValue);
    if (!isValidTimeOrEmpty(normalized)) {
      setSaveError("Čas musí být ve formátu HH:MM nebo zadaný jako číslo (např. 1, 100, 0100).");
      return;
    }
    const finalValue = normalized === "" ? null : normalized;
    applyFieldValue(instanceId, date, field, finalValue);
    const arrivalValue = field === "arrival_time" ? finalValue : day.arrival_time;
    const departureValue = field === "departure_time" ? finalValue : day.departure_time;
    const cellKey = `${instanceId}:${date}:${field}`;
    setSavingCells((prev) => ({ ...prev, [cellKey]: true }));
    try {
      await adminUpsertShiftPlan({
        instance_id: instanceId,
        date,
        arrival_time: arrivalValue,
        departure_time: departureValue,
      });
      setSaveError(null);
      setSuccessCells((prev) => ({ ...prev, [cellKey]: true }));
      if (successTimeouts.current[cellKey]) {
        clearTimeout(successTimeouts.current[cellKey]);
      }
      successTimeouts.current[cellKey] = setTimeout(() => {
        setSuccessCells((prev) => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
        delete successTimeouts.current[cellKey];
      }, 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nelze uložit změnu.";
      setSaveError(message);
    } finally {
      setSavingCells((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
    }
  };
  const rows = plan?.rows ?? [];

  return (
    <div className="plan-page">
      <div className="plan-top-row">
        <div>
        <div className="page-title">Plán služeb</div>
          <div className="plan-instruction">
            Tabulka vychází z <strong>PlanSmen.pdf</strong>: každý řádek představuje jedno jméno a skládá se ze dvou řádků – nahoře odchody, dole příchody.
          </div>
        </div>
        <div className="plan-month-picker">
          <label className="label" htmlFor="plan-month-input">
            Vyberte měsíc
          </label>
          <input id="plan-month-input" className="input" type="month" value={month} onChange={handleMonthChange} />
          <div className="help">{monthLabelText}</div>
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
              <div>
                <div className="plan-chip-name">{instance.display_name ?? instance.id.slice(0, 8)}</div>
                <div className="plan-chip-meta">{instance.employment_template}</div>
              </div>
              <span className="plan-chip-badge">{selected ? "zařazeno" : "přidat"}</span>
            </button>
          );
        })}
        {activeInstances.length === 0 && <div className="plan-chip-empty">Žádná aktivní zařízení.</div>}
      </div>

      {loading ? (
        <div className="plan-loading">Načítám plán…</div>
      ) : error ? (
        <div className="plan-error">{error}</div>
      ) : null}
      {saveError ? <div className="plan-error">{saveError}</div> : null}

      {rows.length === 0 ? (
        <div className="plan-empty-state">
          Vyberte zařízení nahoře a vytvořte plán – každý záznam má dvě řady (odchody a příchody) pro jeden měsíc.
        </div>
      ) : (
        <div className="plan-table-wrapper">
          <table className="plan-table">
            <thead>
              <tr>
                <th className="plan-table-th" rowSpan={2}>
                  Entita / řádek
                </th>
                <th className="plan-table-th" rowSpan={2}>
                  Typ
                </th>
                {days.map((day) => (
                  <th
                    className={`plan-table-th${day.isWeekendOrHoliday ? " plan-table-th--weekend" : ""}`}
                    key={`header-${day.date}`}
                  >
                    <div className="plan-table-day">{day.number}</div>
                    <div className="plan-table-weekday">{day.weekday.toUpperCase()}</div>
                    {day.isWeekendOrHoliday ? (
                      <div className="plan-table-hint">
                        {day.isHoliday ? "Svatek" : "Víkend"}
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowId = row.instance_id;
                const dayMap = row.days.reduce((acc, d) => {
                  acc[d.date] = d;
                  return acc;
                }, {} as Record<string, typeof row.days[0]>);
                return (
                  <Fragment key={rowId}>
                    <tr className="plan-table-row plan-table-row-header">
                      <td className="plan-name-cell" rowSpan={2}>
                        <div className="plan-name">{row.display_name ?? rowId}</div>
                        <div className="plan-template">{row.employment_template}</div>
                        <div className="plan-row-meta">
                          <span>Plán: {formatHours(plannedMinutes(row))} h</span>
                          <span>Fond: {workingFundHours} h</span>
                        </div>
                      </td>
                      <td className="plan-type-cell">Příchody</td>
                      {days.map((day) => {
                        const planDay = dayMap[day.date];
                        const value = planDay?.arrival_time ?? "";
                        const cellKey = `${rowId}:${day.date}:arrival_time`;
                        return (
                          <td
                            className={`plan-table-cell${day.isWeekendOrHoliday ? " plan-table-cell--weekend" : ""}${
                              successCells[cellKey] ? " plan-table-cell--success" : ""
                            }`}
                            key={cellKey}
                          >
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9:]*"
                              className="plan-table-input"
                              value={value}
                              onChange={(event) =>
                                handleInputChange(rowId, day.date, "arrival_time", event.target.value)
                              }
                              onBlur={() => handleInputBlur(rowId, day.date, "arrival_time")}
                              onKeyDown={handleInputKeyDown}
                              placeholder="HH:MM"
                              maxLength={5}
                            />
                            <div className="plan-saving">{savingCells[cellKey] ? "Ukládám…" : " "}</div>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="plan-table-row plan-table-row-footer">
                      <td className="plan-type-cell">Odchody</td>
                      {days.map((day) => {
                        const planDay = dayMap[day.date];
                        const value = planDay?.departure_time ?? "";
                        const cellKey = `${rowId}:${day.date}:departure_time`;
                        return (
                          <td
                            className={`plan-table-cell${day.isWeekendOrHoliday ? " plan-table-cell--weekend" : ""}${
                              successCells[cellKey] ? " plan-table-cell--success" : ""
                            }`}
                            key={cellKey}
                          >
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9:]*"
                              className="plan-table-input"
                              value={value}
                              onChange={(event) =>
                                handleInputChange(rowId, day.date, "departure_time", event.target.value)
                              }
                              onBlur={() => handleInputBlur(rowId, day.date, "departure_time")}
                              onKeyDown={handleInputKeyDown}
                              placeholder="HH:MM"
                              maxLength={5}
                            />
                            <div className="plan-saving">{savingCells[cellKey] ? "Ukládám…" : " "}</div>
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
