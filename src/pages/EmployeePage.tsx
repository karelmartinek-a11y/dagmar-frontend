import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAttendance, putAttendance } from "../api/attendance";
import { ApiError } from "../api/client";
import { claimToken, getStatus, registerInstance, type EmploymentTemplate } from "../api/instances";
import { ConnectivityPill } from "../components/ConnectivityPill";
import { AndroidDownloadBanner } from "../components/AndroidDownloadBanner";
import { detectClientType, getOrCreateDeviceFingerprint, getInstanceDisplayName, getInstanceToken, instanceStore, setInstanceDisplayName, setInstanceToken } from "../state/instanceStore";
import { computeDayCalc, computeMonthStats, parseCutoffToMinutes, workingDaysInMonthCs } from "../utils/attendanceCalc";
import { PendingPage } from "./PendingPage";

type DayRow = {
  date: string; // YYYY-MM-DD
  arrival_time: string | null;
  departure_time: string | null;
};

type QueueItem = {
  date: string;
  arrival_time: string | null;
  departure_time: string | null;
  enqueuedAt: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function yyyyMm(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(yyyyMmStr: string) {
  const [y, m] = yyyyMmStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function daysInMonth(yyyy: number, mm1: number) {
  return new Date(yyyy, mm1, 0).getDate();
}

function toDowLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("cs-CZ", { weekday: "short" });
}

function normalizeTime(value: string): string {
  const v = value.trim();
  if (!v) return "";

  // Support "HHMM" numeric input, e.g. "1000" => "10:00".
  if (/^\d{4}$/.test(v)) {
    const hh = parseInt(v.slice(0, 2), 10);
    const mm = parseInt(v.slice(2), 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${pad2(hh)}:${pad2(mm)}`;
    return v;
  }

  // Support "H:MM" and "HH:MM" (normalize to 2-digit hour).
  const colon = v.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const hh = parseInt(colon[1], 10);
    const mm = parseInt(colon[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${pad2(hh)}:${pad2(mm)}`;
    return v;
  }

  // Support hour-only input 1..23, e.g. "1" => "01:00", "23" => "23:00".
  if (/^\d{1,2}$/.test(v)) {
    const hh = parseInt(v, 10);
    if (hh >= 1 && hh <= 23) return `${pad2(hh)}:00`;
  }

  return v;
}

function isValidTimeOrEmpty(value: string): boolean {
  const v = normalizeTime(value);
  if (v === "") return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatHours(mins: number): string {
  return (mins / 60).toFixed(1);
}

function addMonths(yyyyMmStr: string, delta: number) {
  const [y, m] = yyyyMmStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, 1);
  dt.setMonth(dt.getMonth() + delta);
  return yyyyMm(dt);
}

const POLL_STATUS_MS = 8_000;
const POLL_CLAIM_MS = 6_000;

export function EmployeePage() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [statusText, setStatusText] = useState<string>("Kontroluji stav…");
  const [activationState, setActivationState] = useState<"unknown" | "pending" | "revoked" | "deactivated" | "active">("unknown");
  const [employmentTemplate, setEmploymentTemplate] = useState<EmploymentTemplate>("DPP_DPC");
  const [afternoonCutoff, setAfternoonCutoff] = useState<string>("17:00");
  const cutoffMinutes = useMemo(() => parseCutoffToMinutes(afternoonCutoff), [afternoonCutoff]);
  const [month, setMonth] = useState<string>(() => yyyyMm(new Date()));
  const [rows, setRows] = useState<DayRow[]>([]);
  const [monthLocked, setMonthLocked] = useState(false);
  const monthStats = useMemo(() => computeMonthStats(rows, employmentTemplate, cutoffMinutes), [rows, employmentTemplate, cutoffMinutes]);
  const monthTotalMins = monthStats.totalMins;

  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [sending, setSending] = useState<boolean>(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // In-memory offline queue only (no persistence!)
  const queueRef = useRef<QueueItem[]>([]);
  const workingFundHours = useMemo(() => {
    const [y, m] = month.split("-").map((x) => parseInt(x, 10));
    if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
    return workingDaysInMonthCs(y, m) * 8;
  }, [month]);

  const [instanceId, setInstanceId] = useState<string | null>(() => instanceStore.get().instanceId);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>(() => getOrCreateDeviceFingerprint());

  const logoUrl = useMemo(() => "/brand/icon.svg", []);
  const clientType = useMemo(() => detectClientType(), []);
  const deviceInfo = useMemo(
    () => ({
      ua: navigator.userAgent,
      platform: navigator.platform,
    }),
    []
  );
  const displayName = useMemo(() => getInstanceDisplayName(), [statusText, instanceId]);
  const androidDownloadUrl = "https://dagmar.hcasc.cz/download/dochazka-dagmar.apk";

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = instanceStore.subscribe((st) => {
      if (cancelled) return;
      setInstanceId(st.instanceId);
      setDeviceFingerprint(st.deviceFingerprint ?? getOrCreateDeviceFingerprint());
      setActivationState("unknown");
      setEmploymentTemplate("DPP_DPC");
      setAfternoonCutoff("17:00");

      // reset offline queue when switching identity to avoid mixing data across devices
      queueRef.current = [];
      setQueuedCount(0);
      setSending(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Ensure instance registration (get server instance_id for this fingerprint).
  useEffect(() => {
    let cancelled = false;

    async function ensureRegistered() {
      if (!online) return;
      if (instanceId) return;

      try {
        const res = await registerInstance({
          client_type: clientType,
          device_fingerprint: deviceFingerprint,
          device_info: deviceInfo,
        });
        if (cancelled) return;
        instanceStore.setInstanceId(res.instance_id);
        setActivationState("pending");
        setStatusText("Zařízení není aktivováno");
      } catch {
        // ignore; status poll will keep user informed
      }
    }

    ensureRegistered();
    return () => {
      cancelled = true;
    };
  }, [clientType, deviceFingerprint, deviceInfo, instanceId, online]);

  // Poll status and claim token when ACTIVE
  useEffect(() => {
    let cancelled = false;
    let t1: number | undefined;
    let t2: number | undefined;

    async function pollStatus() {
      if (cancelled) return;
      if (!online) {
        setStatusText("Offline");
        return;
      }
      if (!instanceId) {
        setStatusText("Registruji zařízení…");
        return;
      }

      try {
        const st = await getStatus(instanceId);
        if (cancelled) return;

        if (st.status === "PENDING") {
          setStatusText("Zařízení není aktivováno");
          setActivationState("pending");
          return;
        }
        if (st.status === "REVOKED") {
          setStatusText("Zařízení bylo odregistrováno");
          setActivationState("revoked");
          return;
        }
        if (st.status === "DEACTIVATED") {
          setStatusText("PŘÍSTUP OMEZEN");
          setActivationState("deactivated");
          return;
        }

        // ACTIVE
        if (st.display_name) setInstanceDisplayName(st.display_name);
        setEmploymentTemplate(st.employment_template ?? "DPP_DPC");
        setAfternoonCutoff(st.afternoon_cutoff ?? "17:00");
        setStatusText("Aktivováno");
        setActivationState("active");
      } catch (e: any) {
        // If the stored id isn't a server instance_id, recover by treating it as fingerprint and re-registering.
        if (e instanceof ApiError && e.status === 404) {
          instanceStore.setDeviceFingerprint(instanceId);
          setStatusText("Zařízení není aktivováno");
          setActivationState("pending");
          return;
        }
        if (!cancelled) setStatusText("Nelze ověřit stav");
      }
    }

    async function pollClaim() {
      if (cancelled) return;
      if (!online) return;
      if (!instanceId) return;
      if (activationState !== "active") return;
      if (getInstanceToken()) return;

      try {
        const res = await claimToken(instanceId);
        if (cancelled) return;
        setInstanceToken(res.instance_token);
        setInstanceDisplayName(res.display_name);
      } catch {
        // not active yet or transient error
      }
    }

    // immediate
    pollStatus();
    pollClaim();

    t1 = window.setInterval(pollStatus, POLL_STATUS_MS);
    t2 = window.setInterval(pollClaim, POLL_CLAIM_MS);

    return () => {
      cancelled = true;
      if (t1) window.clearInterval(t1);
      if (t2) window.clearInterval(t2);
    };
  }, [instanceId, online, activationState]);

  // Load attendance for month (only when online)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!online) {
        setRows([]);
        setMonthLocked(false);
        return;
      }
      const token = getInstanceToken();
      if (!token) {
        setRows([]);
        setMonthLocked(false);
        return;
      }

      try {
        const [y, m] = month.split("-").map((x) => parseInt(x, 10));
        const res = await getAttendance(y, m, token);
        if (cancelled) return;

        // Normalize to full month list
        const dim = daysInMonth(y, m);
        const byDate = new Map<string, DayRow>();
        for (const d of res.days) byDate.set(d.date, d);

        const out: DayRow[] = [];
        for (let day = 1; day <= dim; day++) {
          const date = `${y}-${pad2(m)}-${pad2(day)}`;
          out.push(
            byDate.get(date) ?? {
              date,
              arrival_time: null,
              departure_time: null,
            },
          );
        }
        setRows(out);
        setMonthLocked(false);
      } catch (e: any) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 423) {
          setMonthLocked(true);
          setRows([]);
          setStatusText("Docházka pro tento měsíc je uzavřena administrátorem");
        } else {
          setRows([]);
          setMonthLocked(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [month, online, refreshTick]);

  // Try to flush any offline queue whenever connectivity returns.
  useEffect(() => {
    flushQueueIfPossible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  if (!instanceId || activationState === "pending" || activationState === "revoked") {
    return <PendingPage instanceId={instanceId} />;
  }
  if (activationState === "deactivated") {
    return <RestrictedPage instanceId={instanceId} />;
  }

  function enqueue(item: QueueItem) {
    // Replace any existing item for same date (latest wins)
    const q = queueRef.current;
    const idx = q.findIndex((x) => x.date === item.date);
    if (idx >= 0) q.splice(idx, 1);
    q.push(item);
    setQueuedCount(q.length);
  }

  async function flushQueueIfPossible() {
    if (!online) return;
    if (sending) return;
    const token = getInstanceToken();
    if (!token) return;

    const q = queueRef.current;
    if (q.length === 0) return;

    setSending(true);
    try {
      // Send in enqueue order
      while (q.length > 0) {
        const item = q[0];
        await putAttendance(
          {
            date: item.date,
            arrival_time: item.arrival_time,
            departure_time: item.departure_time,
          },
          token,
        );
        q.shift();
        setQueuedCount(q.length);
      }
    } catch {
      // keep remaining in queue
    } finally {
      setSending(false);
    }
  }

  async function onChangeTime(date: string, field: "arrival_time" | "departure_time", value: string) {
    if (monthLocked) return;
    const trimmed = normalizeTime(value);
    if (!isValidTimeOrEmpty(trimmed)) {
      // Do not push invalid; just update UI field to raw value? We'll keep last valid shown by not updating.
      return;
    }

    // Update UI immediately (optimistic)
    setRows((prev) =>
      prev.map((r) => {
        if (r.date !== date) return r;
        const next: DayRow = { ...r };
        next[field] = trimmed === "" ? null : trimmed;
        return next;
      }),
    );

    const token = getInstanceToken();
    const row = rows.find((r) => r.date === date);

    // Compute payload from current state after update
    const payload = {
      date,
      arrival_time: field === "arrival_time" ? (trimmed === "" ? null : trimmed) : row?.arrival_time ?? null,
      departure_time: field === "departure_time" ? (trimmed === "" ? null : trimmed) : row?.departure_time ?? null,
    };

    if (!online || !token) {
      enqueue({ ...payload, enqueuedAt: Date.now() });
      return;
    }

    try {
      await putAttendance(payload, token);
    } catch {
      enqueue({ ...payload, enqueuedAt: Date.now() });
    } finally {
      flushQueueIfPossible();
    }
  }

  const today = isoToday();

  function handlePunchNow() {
    if (monthLocked) {
      window.alert("Měsíc je uzavřen. Nelze zapisovat nové časy.");
      return;
    }
    const todayRow = rows.find((r) => r.date === today);
    if (!todayRow) {
      window.alert("Dnešní den není v aktuálním přehledu.");
      return;
    }
    const now = new Date();
    const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    if (!todayRow.arrival_time) {
      onChangeTime(today, "arrival_time", hhmm);
      return;
    }
    if (!todayRow.departure_time) {
      onChangeTime(today, "departure_time", hhmm);
      return;
    }
    window.alert("Dnešní den už má vyplněný příchod i odchod, není kam zapsat čas.");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fb" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "12px 16px" }}>
        <AndroidDownloadBanner downloadUrl={androidDownloadUrl} appName="DAGMAR Docházka" />
      </div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backgroundImage: "linear-gradient(90deg, #0b5bd3 0%, #2aa8ff 55%, #6fd3ff 100%)",
          backgroundColor: "#0a1a34",
          color: "white",
          borderBottom: "1px solid rgba(255,255,255,0.18)",
          minHeight: 140,
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            padding: "14px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 18,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              padding: 10,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 16px 34px rgba(0,0,0,0.12)",
              flexShrink: 0,
            }}
          >
            <img
              src={logoUrl}
              alt="DAGMAR"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              decoding="async"
              loading="eager"
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, letterSpacing: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {displayName || "DAGMAR Docházka"}
            </div>
              <div style={{ fontSize: 12, opacity: 0.9, display: "flex", flexWrap: "wrap", gap: 10, rowGap: 6, alignItems: "center" }}>
                <span style={{ whiteSpace: "nowrap" }}>{statusText}</span>
                <ConnectivityPill online={online} queuedCount={queuedCount} sending={sending} />
              </div>
            </div>
          </div>

	            <div style={{ fontSize: 12, opacity: 0.9, textAlign: "right" }}>
	              <div style={{ fontWeight: 600 }}>Instance</div>
	              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
	                {instanceId ? `${instanceId.slice(0, 8)}…` : "—"}
	              </div>
	            </div>
	          </div>

        <div
          style={{
            background: "rgba(255,255,255,0.12)",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            style={{
              maxWidth: 980,
              margin: "0 auto",
              padding: "10px 16px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              style={btnStyle()}
              aria-label="Předchozí měsíc"
            >
              ←
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{monthLabel(month)}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid rgba(255,255,255,0.3)",
                  }}
                >
                  Součet: {formatHours(monthTotalMins)} h
                </div>
                {employmentTemplate === "HPP" ? (
                  <>
                    <div
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      Víkend+svátek: {formatHours(monthStats.weekendHolidayMins)} h
                    </div>
                    <div
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      Odpolední ({afternoonCutoff}): {formatHours(monthStats.afternoonMins)} h
                    </div>
                  </>
                ) : null}
                <div
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 10,
                    background: "rgba(248, 180, 0, 0.2)",
                    border: "1px solid rgba(248, 180, 0, 0.35)",
                    color: "white",
                  }}
                >
                  Pracovní fond: {workingFundHours} h
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, +1))}
              style={btnStyle()}
              aria-label="Další měsíc"
            >
              →
            </button>
            <button
              type="button"
              onClick={handlePunchNow}
              style={{
                background: "#dc2626",
                color: "white",
                border: "1px solid #b91c1c",
                padding: "0 16px",
                height: 44,
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 16,
                boxShadow: "0 10px 30px rgba(220,38,38,0.32)",
                cursor: "pointer",
              }}
              aria-label="Zapsat aktuální čas"
            >
              TEĎ
            </button>
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              style={{ ...btnStyle(), width: "auto", padding: "0 12px" }}
              aria-label="Obnovit"
            >
              ↻ Obnovit
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "16px" }}>
        {monthLocked ? (
          <div style={cardStyle()}>
            <div style={{ fontWeight: 800, marginBottom: 6, color: "#b91c1c" }}>Měsíc uzavřen</div>
            <div style={{ color: "#334155" }}>
              Docházka za {monthLabel(month)} je uzavřena administrátorem. Úpravy ani zobrazení v této sekci nejsou pro toto zařízení dostupné.
            </div>
          </div>
        ) : null}

        {!online ? (
          <div style={cardStyle()}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Offline</div>
            <div style={{ color: "#334155" }}>
              Bez internetu nelze načíst historii ze serveru. Můžete zadávat změny; budou drženy jen dočasně v paměti a odešlou se, pokud aplikace
              zůstane běžet a připojení se obnoví.
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {rows.length > 0 ? (
            <div
              className="attendance-grid-row attendance-grid-header"
              style={{
                ...cardStyle(),
                padding: 12,
                background: "rgba(2,132,199,0.06)",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                boxShadow: "none",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Den</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Příchod</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Odchod</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textAlign: "right" }}>Hodiny</div>
            </div>
          ) : null}
          {rows.map((r) => {
            const isToday = r.date === today;
            const calc = computeDayCalc(r, employmentTemplate, cutoffMinutes);
            const mins = calc.workedMins;
            const isSpecial = employmentTemplate === "HPP" && calc.isWeekendOrHoliday;
            const hoursTitle =
              employmentTemplate === "HPP" && mins !== null
                ? `Odpolední: ${formatHours(calc.afternoonMins)} h • Víkend/svátek: ${formatHours(calc.weekendHolidayMins)} h${calc.breakTooltip ? ` • ${calc.breakTooltip}` : ""}`
                : undefined;
            return (
              <div
                key={r.date}
                className="attendance-grid-row"
                style={{
                  ...cardStyle(),
                  border: isToday ? "1px solid rgba(37, 99, 235, 0.45)" : "1px solid rgba(15, 23, 42, 0.08)",
                  boxShadow: isToday ? "0 8px 24px rgba(37,99,235,0.12)" : "0 6px 18px rgba(15, 23, 42, 0.06)",
                  background: isSpecial ? "rgba(248, 180, 0, 0.08)" : "white",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a" }}>{r.date.slice(8, 10)}.</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {toDowLabel(r.date)}
                    {employmentTemplate === "HPP" && calc.holidayName ? ` • ${calc.holidayName}` : ""}
                  </div>
                  {employmentTemplate === "HPP" && calc.breakLabel ? (
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
                  {isToday ? (
                    <div
                      style={{
                        display: "inline-block",
                        marginTop: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#1d4ed8",
                        background: "rgba(29, 78, 216, 0.10)",
                        padding: "4px 8px",
                        borderRadius: 999,
                      }}
                    >
                      Dnes
                    </div>
                  ) : null}
                </div>

                <TimeInput
                  label="Příchod"
                  placeholder="HH:MM"
                  value={r.arrival_time ?? ""}
                  onChange={(v) => onChangeTime(r.date, "arrival_time", v)}
                />

                <TimeInput
                  label="Odchod"
                  placeholder="HH:MM"
                  value={r.departure_time ?? ""}
                  onChange={(v) => onChangeTime(r.date, "departure_time", v)}
                />
                <div title={hoursTitle} style={{ textAlign: "right", fontWeight: 800, color: mins ? "#0f172a" : "#94a3b8" }}>
                  {mins !== null ? `${formatHours(mins)} h` : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div style={{ marginTop: 14, color: "#64748b", fontSize: 13 }}>
            {online ? "Načítám… (pokud jste právě aktivovali zařízení, vyčkejte na vydání tokenu)" : ""}
          </div>
        ) : null}
      </main>

      <footer style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px", color: "#64748b", fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span>Docházka se ukládá pouze na serveru. Offline změny jsou dočasné a ztratí se při zavření stránky/aplikace.</span>
          <span>
            Součet hodin ({monthLabel(month)}):{" "}
            <strong>
              {formatHours(monthTotalMins)}
              h
            </strong>
          </span>
          {employmentTemplate === "HPP" ? (
            <>
              <span>
                Víkend+svátek:{" "}
                <strong>{formatHours(monthStats.weekendHolidayMins)} h</strong>
              </span>
              <span>
                Odpolední ({afternoonCutoff}):{" "}
                <strong>{formatHours(monthStats.afternoonMins)} h</strong>
              </span>
            </>
          ) : null}
          <span>
            Pracovní fond:{" "}
            <strong>
              {workingFundHours} h
            </strong>
          </span>
        </div>
      </footer>
    </div>
  );
}

function RestrictedPage(props: { instanceId: string }) {
  const { instanceId } = props;
  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fb", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        style={{
          maxWidth: 640,
          width: "100%",
          background: "white",
          borderRadius: 16,
          padding: 18,
          border: "1px solid rgba(15, 23, 42, 0.10)",
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.10)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20, color: "#991b1b", marginBottom: 8 }}>PŘÍSTUP OMEZEN</div>
        <div style={{ color: "#334155", lineHeight: 1.5 }}>
          Toto zařízení bylo administrátorem deaktivováno. Docházka zůstává uložená, ale přístup do portálu není pro tuto instanci povolen. Kontaktujte prosím
          správce, pokud jde o omyl.
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
          Instance:{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            {instanceId}
          </span>
        </div>
      </div>
    </div>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    appearance: "none",
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    width: 40,
    height: 34,
    borderRadius: 10,
    fontSize: 18,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function cardStyle(): React.CSSProperties {
  return {
    background: "white",
    borderRadius: 16,
    padding: 14,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
  };
}

function TimeInput(props: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  const { label, placeholder, value, onChange } = props;
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const ok = isValidTimeOrEmpty(local);

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>{label}</div>
      <input
        inputMode="numeric"
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (isValidTimeOrEmpty(local)) onChange(local);
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
    </div>
  );
}

export default EmployeePage;
