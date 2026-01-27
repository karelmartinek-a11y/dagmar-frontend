import { apiFetch, ApiError } from "./client";

export type AttendanceDay = {
  date: string; // YYYY-MM-DD
  arrival_time: string | null; // HH:MM
  departure_time: string | null; // HH:MM
};

export type AttendanceMonthResponse = {
  days: AttendanceDay[];
};

export type AttendanceUpsertBody = {
  date: string; // YYYY-MM-DD
  arrival_time: string | null;
  departure_time: string | null;
};

export async function getAttendanceMonth(params: {
  year: number;
  month: number; // 1-12
  instanceToken: string;
  signal?: AbortSignal;
}): Promise<AttendanceMonthResponse> {
  const { year, month, instanceToken, signal } = params;
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new ApiError(400, "Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(400, "Invalid month");
  }

  const mm = String(month).padStart(2, "0");
  return apiFetch<AttendanceMonthResponse>({
    path: "/api/v1/attendance",
    method: "GET",
    query: { year, month: mm },
    instanceToken,
    signal,
  });
}

export async function upsertAttendance(params: {
  body: AttendanceUpsertBody;
  instanceToken: string;
  signal?: AbortSignal;
}): Promise<{ ok: true }> {
  const { body, instanceToken, signal } = params;

  // Minimal client-side checks (server is the source of truth)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw new ApiError(400, "Invalid date format");
  }
  for (const [k, v] of Object.entries({
    arrival_time: body.arrival_time,
    departure_time: body.departure_time,
  })) {
    if (v === null) continue;
    if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) {
      throw new ApiError(400, `Invalid ${k} format`);
    }
  }

  return apiFetch<{ ok: true }>({
    path: "/api/v1/attendance",
    method: "PUT",
    body,
    instanceToken,
    signal,
  });
}

// Backwards-compatible helpers used by pages
export function getAttendance(year: number, month: number, instanceToken: string, signal?: AbortSignal) {
  return getAttendanceMonth({ year, month, instanceToken, signal });
}

export function putAttendance(body: AttendanceUpsertBody, instanceToken: string, signal?: AbortSignal) {
  return upsertAttendance({ body, instanceToken, signal });
}
