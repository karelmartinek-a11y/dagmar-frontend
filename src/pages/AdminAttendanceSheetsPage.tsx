import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { adminGetAttendanceMonth, adminLockAttendance, adminUpsertAttendance, adminUnlockAttendance, type AdminAttendanceDay } from "../api/adminAttendance";
import { adminGetSettings, adminListInstances, type AdminInstance } from "../api/admin";
import { computeDayCalc, computeMonthStats, parseCutoffToMinutes, workingDaysInMonthCs } from "../utils/attendanceCalc";
import { normalizeTime, isValidTimeOrEmpty } from "../utils/timeInput";

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

function prevMonth(yyyyMmStr: string): string {
  const parsed = parseYYYYMM(yyyyMmStr);
  if (!parsed) return yyyyMmStr;
  let { year, month } = parsed;
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${pad2(month)}`;
}

function nextMonth(yyyyMmStr: string): string {
  const parsed = parseYYYYMM(yyyyMmStr);
  if (!parsed) return yyyyMmStr;
  let { year, month } = parsed;
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${pad2(month)}`;
}

function monthLabel(yyyyMmStr: string) {
  const parsed = parseYYYYMM(yyyyMmStr);
  if (!parsed) return yyyyMmStr;
  const dt = new Date(parsed.year, parsed.month - 1, 1);
  return dt.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function toDowLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("cs-CZ", { weekday: "short" });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function formatHours(mins: number): string {
  return (mins / 60).toFixed(1);
}

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "ACTIVE") return { bg: "rgba(16,185,129,0.10)", fg: "#065f46", border: "rgba(16,185,129,0.25)" };
  if (status === "PENDING") return { bg: "rgba(245,158,11,0.12)", fg: "#92400e", border: "rgba(245,158,11,0.25)" };
  if (status === "REVOKED") return { bg: "rgba(239,68,68,0.10)", fg: "#991b1b", border: "rgba(239,68,68,0.22)" };
  return { bg: "rgba(15,23,42,0.06)", fg: "rgba(15,23,42,0.75)", border: "rgba(15,23,42,0.14)" };
}

export default function AdminAttendanceSheetsPage() {
  const [instances, setInstances] = useState<AdminInstance[] | null>(null);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminInstance | null>(null);

  const [month, setMonth] = useState(() => yyyyMm(new Date()));
  const [days, setDays] = useState<AdminAttendanceDay[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [afternoonCutoff, setAfternoonCutoff] = useState<string>("17:00");
  const cutoffMinutes = useMemo(() => parseCutoffToMinutes(afternoonCutoff), [afternoonCutoff]);
  const template = selected?.employment_template ?? "DPP_DPC";
  const monthStats = useMemo(() => computeMonthStats(days ?? [], template, cutoffMinutes), [days, template, cutoffMinutes]);
  const monthTotalMins = monthStats.totalMins;
  const workingFundHours = useMemo(() => {
    const parsed = parseYYYYMM(month);
    if (!parsed) return 0;
    return workingDaysInMonthCs(parsed.year, parsed.month) * 8;
  }, [month]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const nowMonth = yyyyMm(new Date());
  const isCurrentMonth = month === nowMonth;

  const [savingByKey, setSavingByKey] = useState<Record<string, boolean>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setInstancesLoading(true);
    setInstancesError(null);
    (async () => {
      try {
        const res = await adminListInstances();
        if (cancelled) return;
        setInstances(res.instances);
      } catch (err: unknown) {
        if (cancelled) return;
        setInstancesError(errorMessage(err, "Nepodařilo se načíst seznam instancí."));
      } finally {
        if (!cancelled) setInstancesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await adminGetSettings();
        if (cancelled) return;
        if (s?.afternoon_cutoff) setAfternoonCutoff(s.afternoon_cutoff);
      } catch {
        // best effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = instances ?? [];
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter((it) => {
      const hay = `${it.display_name ?? ""} ${it.id}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [instances, query]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      if (!selected) {
        setDays(null);
        setLocked(false);
        setDaysError(null);
        return;
      }
      const parsed = parseYYYYMM(month);
      if (!parsed) return;

      setDaysLoading(true);
      setDaysError(null);
      try {
        const res = await adminGetAttendanceMonth({
          instanceId: selected.id,
          year: parsed.year,
          month: parsed.month,
          signal: ac.signal,
        });
        if (cancelled) return;
        setDays(res.days);
        setLocked(res.locked || false);
        setAfternoonCutoff(res.afternoon_cutoff ?? selected.afternoon_cutoff ?? "17:00");
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = errorMessage(err, "Docházku se nepodařilo načíst.");
        setDaysError(msg);
        setDays(null);
        setLocked(false);
      } finally {
        if (!cancelled) setDaysLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [month, selected, refreshTick]);

  async function commitTime(date: string, field: "arrival_time" | "departure_time", rawValue: string) {
    if (!selected) return;

    const normalized = normalizeTime(rawValue);
    if (!isValidTimeOrEmpty(normalized)) return;

    const nextValue = normalized === "" ? null : normalized;
    const row = days?.find((d) => d.date === date);
    if (!row) return;

    const payload = {
      instance_id: selected.id,
      date,
      arrival_time: field === "arrival_time" ? nextValue : row.arrival_time,
      departure_time: field === "departure_time" ? nextValue : row.departure_time,
    };

    // Optimistic update
    setDays((prev) =>
      prev
        ? prev.map((d) => {
            if (d.date !== date) return d;
            return { ...d, [field]: nextValue };
          })
        : prev,
    );

    const key = `${date}:${field}`;
    setSavingByKey((prev) => ({ ...prev, [key]: true }));
    setErrorByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      await adminUpsertAttendance(payload);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : errorMessage(err, "Uložení se nezdařilo.");
      setErrorByKey((prev) => ({ ...prev, [key]: msg }));
    } finally {
      setSavingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function toggleLock(nextLocked: boolean) {
    if (!selected) return;
    const parsed = parseYYYYMM(month);
    if (!parsed) return;
    setDaysError(null);
    setDaysLoading(true);
    try {
      if (nextLocked) {
        await adminLockAttendance({ instance_id: selected.id, year: parsed.year, month: parsed.month });
      } else {
        await adminUnlockAttendance({ instance_id: selected.id, year: parsed.year, month: parsed.month });
      }
      // Reload to reflect lock flag and avoid stale cache.
      const res = await adminGetAttendanceMonth({
        instanceId: selected.id,
        year: parsed.year,
        month: parsed.month,
      });
      setDays(res.days);
      setLocked(res.locked || false);
      setAfternoonCutoff(res.afternoon_cutoff ?? selected.afternoon_cutoff ?? "17:00");
    } catch (err: unknown) {
      const msg = errorMessage(err, "Operace se nezdařila.");
      setDaysError(msg);
    } finally {
      setDaysLoading(false);
    }
  }

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid var(--line)",
    borderRadius: 16,
    boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
    padding: 16,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ ...card, flex: "1 1 340px", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Výběr instance</div>

          <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Hledat (fulltext)</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="např. Novák, pokoj 12…"
            style={{
              width: "100%",
              height: 42,
              borderRadius: 12,
              border: "1px solid var(--line)",
              padding: "0 12px",
              outline: "none",
              background: "white",
            }}
          />

          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            {instancesLoading ? "Načítám instance…" : instances ? `${filtered.length} výsledků` : ""}
          </div>

          {instancesError ? (
            <div
              style={{
                marginTop: 10,
                border: "1px solid rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.08)",
                borderRadius: 12,
                padding: 12,
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {instancesError}
            </div>
          ) : null}

          <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {(instances ? filtered : []).map((it) => {
                const tone = statusTone(it.status);
                const isActive = selected?.id === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setSelected(it);
                      setAfternoonCutoff(it.afternoon_cutoff ?? "17:00");
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      padding: "10px 12px",
                      border: "0",
                      borderBottom: "1px solid var(--line)",
                      background: isActive ? "rgba(2,132,199,0.06)" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 750, color: "rgba(15,23,42,0.92)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.display_name || "— bez názvu —"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {it.id.slice(0, 8)}…
                      </div>
                    </div>
                    <div
                      style={{
                        alignSelf: "start",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: tone.bg,
                        color: tone.fg,
                        border: `1px solid ${tone.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.status}
                    </div>
                  </button>
                );
              })}
              {instances && filtered.length === 0 ? (
                <div style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}>Nenalezeno.</div>
              ) : null}
            </div>
          </div>
        </section>

        <section style={{ ...card, flex: "2 1 520px", minWidth: 0 }}>
          {!selected ? (
            <div style={{ color: "var(--muted)" }}>Vyberte instanci vlevo.</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      overflow: "hidden",
                      textTransform: "uppercase",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {`${monthLabel(month).toUpperCase()} · ${selected.display_name || "—"}`}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setMonth((m) => prevMonth(m))}
                      style={attendanceNavButtonStyle()}
                      aria-label="Předchozí měsíc"
                    >
                      ←
                    </button>
                    <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => setMonth(yyyyMm(new Date()))}
                        style={attendanceActionButtonStyle(isCurrentMonth)}
                        disabled={isCurrentMonth}
                      >
                        Teď
                      </button>
                      <button
                        type="button"
                        onClick={() => setRefreshTick((t) => t + 1)}
                        style={attendanceActionButtonStyle(false)}
                        disabled={daysLoading}
                      >
                        Obnovit
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMonth((m) => nextMonth(m))}
                      style={attendanceNavButtonStyle()}
                      aria-label="Další měsíc"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>

              {daysError ? (
                <div
                  style={{
                    marginTop: 12,
                    border: "1px solid rgba(239,68,68,0.35)",
                    background: "rgba(239,68,68,0.08)",
                    borderRadius: 12,
                    padding: 12,
                    color: "#b91c1c",
                    fontSize: 13,
                  }}
                >
                  {daysError}
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {daysLoading ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Načítám…</div> : null}
                {days && days.length > 0 ? (
                  <div
                    className="attendance-grid-row attendance-grid-header"
                    style={{
                      borderRadius: 16,
                      padding: 12,
                      background: "rgba(2,132,199,0.06)",
                      border: "1px solid rgba(15, 23, 42, 0.08)",
                      boxShadow: "none",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Den</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Příchod</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Odchod</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textAlign: "right" }}>Hodiny</div>
                  </div>
                ) : null}
                {days?.map((d) => {
                  const calc = computeDayCalc({ date: d.date, arrival_time: d.arrival_time, departure_time: d.departure_time }, template, cutoffMinutes);
                  const mins = calc.workedMins;
                  const isSpecial = template === "HPP" && calc.isWeekendOrHoliday;
                  const hoursTitle =
                    template === "HPP" && mins !== null
                      ? `Odpolední: ${formatHours(calc.afternoonMins)} h • Víkend/svátek: ${formatHours(calc.weekendHolidayMins)} h${calc.breakTooltip ? ` • ${calc.breakTooltip}` : ""}`
                      : undefined;
                  return (
                    <div
                      key={d.date}
                      className="attendance-grid-row"
                      style={{
                        background: isSpecial ? "rgba(248, 180, 0, 0.08)" : "rgba(255,255,255,0.86)",
                        borderRadius: 16,
                        padding: 14,
                        border: "1px solid rgba(15, 23, 42, 0.08)",
                        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1fr",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a" }}>{d.date.slice(8, 10)}.</div>
                        <div style={{ fontSize: 12, color: "#475569" }}>
                          {toDowLabel(d.date)}
                          {template === "HPP" && calc.holidayName ? ` • ${calc.holidayName}` : ""}
                        </div>
                        {template === "HPP" && calc.breakLabel ? (
                          <div
                            title={calc.breakTooltip ?? undefined}
                            style={{
                              display: "inline-block",
                              marginTop: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#0f172a",
                              background: "rgba(15,23,42,0.08)",
                              border: "1px solid rgba(15,23,42,0.12)",
                              padding: "4px 8px",
                              borderRadius: 999,
                            }}
                          >
                            {calc.breakLabel}
                          </div>
                        ) : null}
                      </div>

                      <TimeInput
                        label="Příchod"
                        placeholder="HH:MM"
                        value={d.arrival_time ?? ""}
                        saving={!!savingByKey[`${d.date}:arrival_time`]}
                        error={errorByKey[`${d.date}:arrival_time`] ?? null}
                        onCommit={(v) => commitTime(d.date, "arrival_time", v)}
                      />

                      <TimeInput
                        label="Odchod"
                        placeholder="HH:MM"
                        value={d.departure_time ?? ""}
                        saving={!!savingByKey[`${d.date}:departure_time`]}
                        error={errorByKey[`${d.date}:departure_time`] ?? null}
                        onCommit={(v) => commitTime(d.date, "departure_time", v)}
                      />
                      <div title={hoursTitle} style={{ textAlign: "right", fontWeight: 800, color: mins !== null ? "#0f172a" : "var(--muted)" }}>
                        {mins !== null ? `${formatHours(mins)} h` : "—"}
                      </div>
                      {(d.planned_arrival_time || d.planned_departure_time) ? (
                        <div style={{ gridColumn: "1 / -1", marginTop: 6, fontSize: 12, color: "rgba(15,23,42,0.55)" }}>
                          Plán: {d.planned_arrival_time ?? "—"} – {d.planned_departure_time ?? "—"}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <footer
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: "1px solid var(--line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 12,
                  }}
                >
                  <FooterStat
                    label="ID entity"
                    value={selected.id}
                    valueStyle={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", wordBreak: "break-all", fontSize: 13 }}
                  />
                  <FooterStat label="Název entity" value={selected.display_name || "— bez názvu —"} />
                  <FooterStat label="Součet hodin" value={`${formatHours(monthTotalMins)} h`} />
                  <FooterStat label="Víkend + svátky" value={`${formatHours(monthStats.weekendHolidayMins)} h`} />
                  <FooterStat label="Odpolední" value={`${formatHours(monthStats.afternoonMins)} h`} />
                  <FooterStat label="Pracovní fond" value={`${workingFundHours} h`} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => toggleLock(!locked)}
                    style={{
                      ...miniBtn(),
                      width: "auto",
                      padding: "0 12px",
                      background: locked ? "#111827" : "#0ea5e9",
                      color: locked ? "white" : "#0b172a",
                      border: locked ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(14,165,233,0.35)",
                    }}
                    disabled={daysLoading}
                  >
                    {locked ? "Odemknout" : "UZAVŘÍT MĚSÍC"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function attendanceNavButtonStyle(): React.CSSProperties {
  return {
    appearance: "none",
    border: "1px solid var(--line)",
    background: "white",
    color: "#0f172a",
    width: 46,
    height: 46,
    minWidth: 46,
    borderRadius: 12,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  };
}

function attendanceActionButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    ...attendanceNavButtonStyle(),
    minWidth: 110,
    width: 110,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function miniBtn(): React.CSSProperties {
  return {
    height: 34,
    width: 40,
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function FooterStat(props: { label: string; value: string; valueStyle?: React.CSSProperties }) {
  const { label, value, valueStyle } = props;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", ...valueStyle }}>{value}</div>
    </div>
  );
}

function TimeInput(props: {
  label: string;
  placeholder: string;
  value: string;
  saving: boolean;
  error: string | null;
  onCommit: (v: string) => void;
}) {
  const { label, placeholder, value, saving, error, onCommit } = props;
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const ok = isValidTimeOrEmpty(local);
  const normalized = normalizeTime(local);

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: saving ? "#0369a1" : "rgba(15,23,42,0.55)", fontWeight: 700, whiteSpace: "nowrap" }}>
          {saving ? "Ukládám…" : ""}
        </div>
      </div>
      <input
        inputMode="numeric"
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (!isValidTimeOrEmpty(local)) return;
          setLocal(normalized);
          onCommit(normalized);
        }}
        style={{
          width: "100%",
          minWidth: 0,
          height: 44,
          borderRadius: 12,
          border: ok ? "1px solid rgba(15, 23, 42, 0.18)" : "1px solid rgba(220, 38, 38, 0.6)",
          outline: "none",
          padding: "0 12px",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 0.2,
          background: ok ? "white" : "rgba(220, 38, 38, 0.05)",
        }}
      />
      {!ok ? <div style={{ fontSize: 11, color: "#dc2626" }}>Zadejte čas ve formátu HH:MM (00:00–23:59) nebo nechte prázdné.</div> : null}
      {ok && error ? <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div> : null}
    </div>
  );
}
