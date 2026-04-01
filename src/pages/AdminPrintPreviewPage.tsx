import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminListInstances, adminListUsers, type AdminInstance, type PortalUser } from "../api/admin";
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
import { employmentTemplateLabel } from "../utils/uiLabels";

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
    days.push({ date: iso, dow: dt.toLocaleDateString("cs-CZ", { weekday: "long" }) });
    dt.setDate(dt.getDate() + 1);
  }
  return days;
}

function formatHours(mins: number) {
  return (mins / 60).toFixed(1);
}

function formatHoursComma(mins: number) {
  return formatHours(mins).replace(".", ",");
}

function vacationMinutesForDay(day: AdminAttendanceDay | undefined): number {
  return day?.planned_status === "HOLIDAY" ? 8 * 60 : 0;
}

function formatHoursCell(mins: number | null | undefined) {
  if (!mins) return "";
  return formatHoursComma(mins);
}

function formatDateLong(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

function parseLocalDate(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
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

function templateLabel(tpl: AdminInstance["employment_template"]): string {
  return employmentTemplateLabel(tpl);
}

function buildUserNameByInstanceId(users: PortalUser[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const user of users) {
    if (!user.profile_instance_id) continue;
    map.set(user.profile_instance_id, user.name);
  }
  return map;
}

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
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const label = monthLabel(parsedMonth.year, parsedMonth.month);

  useEffect(() => {
    if (!hasValidMonth || idList.length === 0) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setPdfGenerated(false);
      try {
        const [instRes, userRes] = await Promise.all([adminListInstances(), adminListUsers()]);
        if (cancelled) return;
        const map = new Map(instRes.instances.map((i) => [i.id, i]));
        const userNameByInstanceId = buildUserNameByInstanceId(userRes.users);
        const selected = idList
          .map((id) => map.get(id))
          .filter(Boolean) as AdminInstance[];
        if (selected.length === 0) throw new Error("Nebylo nalezeno žádné vybrané zařízení.");

        if (docType === "attendance") {
          const records: DocRecord[] = [];
          for (const inst of selected) {
            const res = await adminGetAttendanceMonth({
              instanceId: inst.id,
              year: parsedMonth.year,
              month: parsedMonth.month,
            });
            const cutoff = parseCutoffToMinutes(res.afternoon_cutoff ?? inst.afternoon_cutoff ?? "17:00");
            records.push({
              type: "attendance",
              instance: {
                ...inst,
                display_name: userNameByInstanceId.get(inst.id) ?? inst.display_name,
              },
              days: res.days,
              cutoffMinutes: cutoff,
            });
          }
          if (!cancelled) setDocs(records);
        } else {
          const plan = await adminGetShiftPlanMonth({ year: parsedMonth.year, month: parsedMonth.month });
          if (cancelled) return;
          const rows = plan.rows.filter((r) => idList.includes(r.instance_id));
          if (rows.length === 0) throw new Error("Pro vybraná zařízení nebyla nalezena žádná data plánu směn.");
          const records: DocRecord[] = rows
            .map((row) => {
              const inst = map.get(row.instance_id);
              if (!inst) return null;
              return {
                type: "plan",
                instance: {
                  ...inst,
                  display_name: userNameByInstanceId.get(inst.id) ?? inst.display_name,
                },
                row,
              } as DocRecord;
            })
            .filter(Boolean) as DocRecord[];
          if (!cancelled) setDocs(records);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Nepodařilo se načíst data pro tisk.");
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
    if (loading || error || docs.length === 0 || pdfGenerated) return;
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
      setPdfGenerated(true);
      window.setTimeout(() => window.close(), 400);
    }

    generatePdf().catch((err) => {
      setError(err instanceof Error ? err.message : "Generování tiskového dokumentu selhalo.");
    });
  }, [loading, error, docs, docType, month, pdfGenerated]);

  const dayCache = useMemo(() => dayList(parsedMonth.year, parsedMonth.month), [parsedMonth]);

  if (!hasValidMonth) {
    return <div className="card">Neplatný údaj měsíce.</div>;
  }

  return (
    <div style={{ padding: 0, margin: 0 }} ref={containerRef}>
      <style>{`
        body { background: #ffffff; }
        .sheet { width: 210mm; min-height: 297mm; padding: 15mm 12mm; margin: 6mm auto; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .sheet + .sheet { page-break-before: always; }
        h1 { margin: 0 0 4px 0; font-size: 18px; }
        h2 { margin: 0 0 12px 0; font-size: 14px; color: var(--kb-brand-ink-600); }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid rgba(82, 85, 93, 0.22); padding: 4px 6px; text-align: left; }
        th { background: var(--kb-text); color: #ffffff; font-weight: 600; }
        .row-weekend { background: rgba(82, 85, 93, 0.06); }
        .row-holiday { background: rgba(255,0,0,0.05); }
        .footer { margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 6px; font-size: 12px; }
        .pill { background: var(--kb-text); color: #fff; padding: 6px 10px; border-radius: 8px; display: inline-block; font-weight: 600; }
        .small { color: var(--kb-brand-ink-600); font-size: 11px; }
        .signature { margin-top: 14px; font-size: 10px; color: var(--kb-brand-ink-600); text-align: center; }
        @media print { body { background: white; } .sheet { box-shadow: none; margin: 0 auto; } }
        .t-center { text-align: center; }
        .t-right { text-align: right; }
      `}</style>

      {loading ? <div className="card">Načítám data...</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      {docs.map((doc) => {
        if (doc.type === "attendance") {
          const stats = computeMonthStats(doc.days, doc.instance.employment_template, doc.cutoffMinutes);
          return (
            <div key={doc.instance.id + "-att"} className="sheet">
              <h1>{label} · DOCHÁZKOVÝ LIST</h1>
              <h2>
                {doc.instance.display_name ?? doc.instance.id} · {templateLabel(doc.instance.employment_template)}
              </h2>
              <table aria-label="Docházkový list">
                <thead>
                  <tr>
                    <th style={{ width: "36%" }}>Datum</th>
                    <th style={{ width: 104 }}>Příchod 1</th>
                    <th style={{ width: 104 }}>Odchod 1</th>
                    <th style={{ width: 104 }}>Příchod 2</th>
                    <th style={{ width: 104 }}>Odchod 2</th>
                    <th style={{ width: 104 }}>Příchod 3</th>
                    <th style={{ width: 104 }}>Odchod 3</th>
                    <th style={{ width: 88 }}>Celkem</th>
                    <th style={{ width: 88 }}>Dovolená</th>
                    <th style={{ width: 88 }}>Odpolední</th>
                    <th style={{ width: 88 }}>Víkendy a svátky</th>
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
                        planned_status: day?.planned_status ?? null,
                      },
                      doc.instance.employment_template,
                      doc.cutoffMinutes,
                    );
                    const rowClass = calc.isWeekendOrHoliday ? (calc.holidayName ? "row-holiday" : "row-weekend") : "";
                    const isVacation = day?.planned_status === "HOLIDAY";
                    const intervals = isVacation
                      ? { in1: "dovolená", out1: "dovolená", in2: "", out2: "", in3: "", out3: "" }
                      : buildIntervals(day?.arrival_time ?? null, day?.departure_time ?? null, calc.breakTooltip);
                    const vacationMins = vacationMinutesForDay(day);
                    const worked = formatHoursCell(calc.workedMins);
                    const vacationStr = formatHoursCell(vacationMins);
                    const afternoonStr = formatHoursCell(calc.afternoonMins);
                    const weekendStr = calc.isWeekendOrHoliday ? formatHoursCell(calc.workedMins) : "";
                    return (
                      <tr key={d.date} className={rowClass}>
                        <td>{formatDateLong(d.date)}</td>
                        <td className="t-center">{intervals.in1}</td>
                        <td className="t-center">{intervals.out1}</td>
                        <td className="t-center">{intervals.in2}</td>
                        <td className="t-center">{intervals.out2}</td>
                        <td className="t-center">{intervals.in3}</td>
                        <td className="t-center">{intervals.out3}</td>
                        <td className="t-right">{worked}</td>
                        <td className="t-right">{vacationStr}</td>
                        <td className="t-right">{afternoonStr}</td>
                        <td className="t-right">{weekendStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}></td>
                    <td style={{ fontWeight: 700 }}>
                      Plán: {formatHoursComma(workingDaysInMonthCs(parsedMonth.year, parsedMonth.month) * 60 * 8)} h
                    </td>
                    <td className="t-right">{formatHoursComma(stats.totalMins)} h</td>
                    <td className="t-right">{formatHoursComma(stats.holidayMins)} h</td>
                    <td className="t-right">{formatHoursComma(stats.afternoonMins)} h</td>
                    <td className="t-right">{formatHoursComma(stats.weekendHolidayMins)} h</td>
                  </tr>
                  <tr>
                    <td colSpan={11} style={{ fontWeight: 700 }}>
                      Odpracováno celkem: {formatHoursComma(stats.totalMins)} h, z toho {formatHoursComma(stats.holidayMins)} h dovolená
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="signature">Tento docházkový list pro Vás zpracoval systém KájovoDagmar.</div>
            </div>
          );
        }

        const totalPlanMins = plannedMinutes(doc.row);
        return (
          <div key={doc.instance.id + "-plan"} className="sheet">
            <h1>{label} · PLÁN SMĚN</h1>
            <h2>{doc.instance.display_name ?? doc.instance.id}</h2>
            <table aria-label="Plán směn">
              <thead>
                <tr>
                  <th style={{ width: "36%" }}>Datum</th>
                  <th style={{ width: 120 }}>Den v týdnu</th>
                  <th style={{ width: 140 }}>Příchod</th>
                  <th style={{ width: 140 }}>Odchod</th>
                </tr>
              </thead>
              <tbody>
                {doc.row.days.map((day) => {
                  const holidayName = getCzechHolidayName(day.date);
                  const weekend = isWeekendDate(day.date);
                  const dow = parseLocalDate(day.date).toLocaleDateString("cs-CZ", { weekday: "long" });
                  const rowClass = holidayName ? "row-holiday" : weekend ? "row-weekend" : "";
                  return (
                    <tr key={day.date} className={rowClass}>
                      <td>{formatDateLong(day.date)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{dow.charAt(0).toUpperCase() + dow.slice(1)}</td>
                      <td>{day.arrival_time ?? ""}</td>
                      <td>{day.departure_time ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td>Součet plánovaných hodin</td>
                  <td>{formatHoursComma(totalPlanMins)} h</td>
                  <td>Fond: {formatHoursComma(workingDaysInMonthCs(parsedMonth.year, parsedMonth.month) * 60 * 8)} h</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}
