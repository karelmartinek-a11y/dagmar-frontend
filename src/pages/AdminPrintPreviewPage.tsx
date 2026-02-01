import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminListInstances, type AdminInstance } from "../api/admin";
import { adminGetAttendanceMonth, type AdminAttendanceDay } from "../api/adminAttendance";
import { adminGetShiftPlanMonth, type ShiftPlanRow } from "../api/adminShiftPlan";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  computeDayCalc,
  computeMonthStats,
  getCzechHolidayName,
  isWeekendDate,
  parseCutoffToMinutes,
  workingDaysInMonthCs,
} from "../utils/attendanceCalc";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthLabel(year: number, month: number) {
  const dt = new Date(year, month - 1, 1);
  return dt.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function parseMonth(value: string): { year: number; month: number } | null {
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function minutesFromHHMM(value: string | null): number | null {
  if (!value) return null;
  const m = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function plannedMinutes(row: ShiftPlanRow): number {
  return row.days.reduce((acc, day) => {
    const a = minutesFromHHMM(day.arrival_time);
    const d = minutesFromHHMM(day.departure_time);
    if (a !== null && d !== null && d > a) return acc + (d - a);
    return acc;
  }, 0);
}

function dayList(year: number, month: number) {
  const days: { date: string; dow: string }[] = [];
  const dt = new Date(year, month - 1, 1);
  while (dt.getMonth() === month - 1) {
    const iso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    days.push({ date: iso, dow: dt.toLocaleDateString("cs-CZ", { weekday: "short" }) });
    dt.setDate(dt.getDate() + 1);
  }
  return days;
}

function formatHours(mins: number) {
  return (mins / 60).toFixed(1);
}

function parseBreakWindows(breakTooltip: string | null): Array<{ start: string; end: string }> {
  if (!breakTooltip) return [];
  const regex = /([0-2]?\d:[0-5]\d)\u2013([0-2]?\d:[0-5]\d)/g; // times separated by en dash
  const out: Array<{ start: string; end: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(breakTooltip)) !== null) {
    out.push({ start: m[1], end: m[2] });
  }
  return out.slice(0, 2); // max 2 pauzy => 3 intervaly
}

type IntervalPairs = { in1: string; out1: string; in2: string; out2: string; in3: string; out3: string };

function buildIntervals(
  arrival: string | null,
  departure: string | null,
  breakTooltip: string | null,
): IntervalPairs {
  const windows = parseBreakWindows(breakTooltip);
  const empty: IntervalPairs = { in1: "", out1: "", in2: "", out2: "", in3: "", out3: "" };
  if (!arrival && !departure) return empty;

  const a = arrival ?? "";
  const d = departure ?? "";

  if (windows.length === 0) {
    return { in1: a, out1: d, in2: "", out2: "", in3: "", out3: "" };
  }

  if (windows.length === 1) {
    const w = windows[0];
    return { in1: a, out1: w.start, in2: w.end, out2: d, in3: "", out3: "" };
  }

  const [w1, w2] = windows;
  return { in1: a, out1: w1.start, in2: w1.end, out2: w2.start, in3: w2.end, out3: d };
}

type AttendanceDoc = {
  type: "attendance";
  instance: AdminInstance;
  days: AdminAttendanceDay[];
  cutoffMinutes: number;
};

type PlanDoc = {
  type: "plan";
  instance: AdminInstance;
  row: ShiftPlanRow;
};

type DocRecord = AttendanceDoc | PlanDoc;

export default function AdminPrintPreviewPage() {
  const [params] = useSearchParams();
  const docType = params.get("type") === "plan" ? "plan" : "attendance";
  const month = params.get("month") ?? "";
  const idsParam = params.get("ids") ?? "";
  const idList = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = useMemo(() => parseMonth(month), [month]);
  const parsedMonth = useMemo(() => parsed ?? { year: 1970, month: 1 }, [parsed]);
  const hasValidMonth = parsed !== null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const label = monthLabel(parsedMonth.year, parsedMonth.month);

  useEffect(() => {
    if (!hasValidMonth || idList.length === 0) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const instRes = await adminListInstances();
        if (cancelled) return;
        const map = new Map(instRes.instances.map((i) => [i.id, i]));
        const selected = idList
          .map((id) => map.get(id))
          .filter(Boolean) as AdminInstance[];
        if (selected.length === 0) throw new Error("Zadna vybrana entita nebyla nalezena.");

        if (docType === "attendance") {
          const records: DocRecord[] = [];
          for (const inst of selected) {
            const res = await adminGetAttendanceMonth({
              instanceId: inst.id,
              year: parsedMonth.year,
              month: parsedMonth.month,
            });
            const cutoff = parseCutoffToMinutes(res.afternoon_cutoff ?? inst.afternoon_cutoff ?? "17:00");
            records.push({ type: "attendance", instance: inst, days: res.days, cutoffMinutes: cutoff });
          }
          if (!cancelled) setDocs(records);
        } else {
          const plan = await adminGetShiftPlanMonth({ year: parsedMonth.year, month: parsedMonth.month });
          if (cancelled) return;
          const rows = plan.rows.filter((r) => idList.includes(r.instance_id));
          const records: DocRecord[] = rows
            .map((row) => {
              const inst = map.get(row.instance_id);
              if (!inst) return null;
              return { type: "plan", instance: inst, row } as DocRecord;
            })
            .filter(Boolean) as DocRecord[];
          if (!cancelled) setDocs(records);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Nepodarilo se nacist data pro tisk.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [docType, idList, parsedMonth, hasValidMonth]);

  useEffect(() => {
    if (loading || error || docs.length === 0) return;
    const maybeContainer = containerRef.current;
    if (!maybeContainer) return;
    const container = maybeContainer as HTMLDivElement;

    async function generatePdf() {
      const sheets = Array.from(container.querySelectorAll(".sheet")) as HTMLElement[];
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < sheets.length; i++) {
        const el = sheets[i];
        const canvas = await html2canvas(el, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const imgWidth = canvas.width * ratio;
        const imgHeight = canvas.height * ratio;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      }

      pdf.save(`tisky-${docType}-${month || "mesic"}.pdf`);
      window.setTimeout(() => window.close(), 400);
    }

    generatePdf().catch((err) => console.error(err));
  }, [loading, error, docs, docType, month]);

  const dayCache = useMemo(() => dayList(parsedMonth.year, parsedMonth.month), [parsedMonth]);

  if (!hasValidMonth) {
    return <div className="card">Neplatny parametr mesice.</div>;
  }

  return (
    <div style={{ padding: 0, margin: 0 }} ref={containerRef}>
      <style>{`
        body { background: #f2f4f8; }
        .sheet { width: 210mm; min-height: 297mm; padding: 15mm 12mm; margin: 6mm auto; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .sheet + .sheet { page-break-before: always; }
        h1 { margin: 0 0 4px 0; font-size: 18px; }
        h2 { margin: 0 0 12px 0; font-size: 14px; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #d7deeb; padding: 4px 6px; text-align: left; }
        th { background: #0f172a; color: #eef2ff; font-weight: 600; }
        .row-weekend { background: #f5f7ff; }
        .row-holiday { background: #fff4f2; }
        .footer { margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 6px; font-size: 12px; }
        .pill { background: #0f172a; color: #fff; padding: 6px 10px; border-radius: 8px; display: inline-block; font-weight: 600; }
        .small { color: #6b7280; font-size: 11px; }
        @media print { body { background: white; } .sheet { box-shadow: none; margin: 0 auto; } }
      `}</style>

      {loading ? <div className="card">Nacitam data...</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      {docs.map((doc) => {
        if (doc.type === "attendance") {
          const stats = computeMonthStats(doc.days, doc.instance.employment_template, doc.cutoffMinutes);
          const workingFund = workingDaysInMonthCs(parsedMonth.year, parsedMonth.month) * 60 * 8;
          return (
            <div key={doc.instance.id + "-att"} className="sheet">
              <h1>{label} · DOCHAZKOVY LIST</h1>
              <h2>{doc.instance.display_name ?? doc.instance.id}</h2>
              <table aria-label="Dochazka">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Datum</th>
                    <th style={{ width: 50 }}>Den</th>
                    <th style={{ width: 70 }}>Prichod 1</th>
                    <th style={{ width: 70 }}>Odchod 1</th>
                    <th style={{ width: 70 }}>Prichod 2</th>
                    <th style={{ width: 70 }}>Odchod 2</th>
                    <th style={{ width: 70 }}>Prichod 3</th>
                    <th style={{ width: 70 }}>Odchod 3</th>
                    <th style={{ width: 80 }}>Odprac.</th>
                    <th style={{ width: 90 }}>Odpoledne</th>
                    <th style={{ width: 110 }}>Vikend+Svátek</th>
                    <th>Poznamka</th>
                  </tr>
                </thead>
                <tbody>
                  {dayCache.map((d) => {
                    const day = doc.days.find((x) => x.date === d.date);
                    const calc = computeDayCalc(
                      {
                        date: d.date,
                        arrival_time: day?.arrival_time ?? null,
                        departure_time: day?.departure_time ?? null,
                      },
                      doc.instance.employment_template,
                      doc.cutoffMinutes,
                    );
                    const rowClass = calc.isWeekendOrHoliday ? (calc.holidayName ? "row-holiday" : "row-weekend") : "";
                    const noteParts = [] as string[];
                    if (calc.holidayName) noteParts.push(calc.holidayName);
                    if (calc.breakTooltip) noteParts.push(calc.breakTooltip);
                    const intervals = buildIntervals(day?.arrival_time ?? null, day?.departure_time ?? null, calc.breakTooltip);
                    const worked = calc.workedMins === null ? "" : formatHours(calc.workedMins);
                    const afternoonStr = calc.afternoonMins ? formatHours(calc.afternoonMins) : "";
                    const weekendStr = calc.isWeekendOrHoliday ? (calc.workedMins ? formatHours(calc.workedMins) : "") : "";
                    return (
                      <tr key={d.date} className={rowClass}>
                        <td>{d.date}</td>
                        <td>{d.dow.toUpperCase()}</td>
                        <td>{intervals.in1}</td>
                        <td>{intervals.out1}</td>
                        <td>{intervals.in2}</td>
                        <td>{intervals.out2}</td>
                        <td>{intervals.in3}</td>
                        <td>{intervals.out3}</td>
                        <td>{worked}</td>
                        <td>{afternoonStr}</td>
                        <td>{weekendStr}</td>
                        <td>{noteParts.join(" | ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="footer">
                <div className="pill">Celkem: {formatHours(stats.totalMins)} h</div>
                <div className="pill" style={{ background: "#0b4f2f" }}>
                  Pracovni fond: {formatHours(workingFund)} h
                </div>
                <div className="pill" style={{ background: "#6b21a8" }}>
                  Víkendy+svatky: {formatHours(stats.weekendHolidayMins)} h
                </div>
                <div className="pill" style={{ background: "#9a3412" }}>
                  Odpoledne: {formatHours(stats.afternoonMins)} h
                </div>
              </div>
              <div className="small" style={{ marginTop: 6 }}>Pauzy: automaticky odcitano po 30 minutach podle firemniho rezimu.</div>
            </div>
          );
        }

        const totalPlanMins = plannedMinutes(doc.row);
        return (
          <div key={doc.instance.id + "-plan"} className="sheet">
            <h1>{label} · PLAN SMEN</h1>
            <h2>{doc.instance.display_name ?? doc.instance.id}</h2>
            <table aria-label="Plan smen">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Datum</th>
                  <th style={{ width: 50 }}>Den</th>
                  <th style={{ width: 100 }}>Plan prichod</th>
                  <th style={{ width: 100 }}>Plan odchod</th>
                  <th>Poznamka</th>
                </tr>
              </thead>
              <tbody>
                {doc.row.days.map((day) => {
                  const holidayName = getCzechHolidayName(day.date);
                  const weekend = isWeekendDate(day.date);
                  const dow = new Date(day.date).toLocaleDateString("cs-CZ", { weekday: "short" });
                  const rowClass = holidayName ? "row-holiday" : weekend ? "row-weekend" : "";
                  const note = holidayName ? holidayName : "";
                  return (
                    <tr key={day.date} className={rowClass}>
                      <td>{day.date}</td>
                      <td>{dow.toUpperCase()}</td>
                      <td>{day.arrival_time ?? ""}</td>
                      <td>{day.departure_time ?? ""}</td>
                      <td>{note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="footer">
              <div className="pill">Planovano: {formatHours(totalPlanMins)} h</div>
              <div className="pill" style={{ background: "#0b4f2f" }}>Pracovni fond: {formatHours(workingDaysInMonthCs(parsedMonth.year, parsedMonth.month) * 60 * 8)} h</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
