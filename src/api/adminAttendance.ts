import { apiFetch, ApiError } from "./client";

export type AdminInstanceStatus = "PENDING" | "ACTIVE" | "REVOKED";
export type AdminClientType = "ANDROID" | "WEB";

export type AdminInstance = {
  id: string;
  client_type: AdminClientType;
  device_fingerprint?: string;
  status: AdminInstanceStatus;
  display_name: string | null;
  created_at?: string;
  last_seen_at?: string | null;
};

export type AdminAttendanceDay = {
  date: string; // YYYY-MM-DD
  arrival_time: string | null; // HH:MM
  departure_time: string | null; // HH:MM
};

export type AdminAttendanceMonthResponse = {
  days: AdminAttendanceDay[];
  locked: boolean;
  afternoon_cutoff?: string | null;
};

export type AdminAttendanceUpsertBody = {
  instance_id: string;
  date: string; // YYYY-MM-DD
  arrival_time: string | null;
  departure_time: string | null;
};

type CsrfTokenResponse = {
  csrf_token: string;
};

function getCsrfToken(): string | null {
  return sessionStorage.getItem("dagmar_csrf") || null;
}

function setCsrfToken(token: string) {
  sessionStorage.setItem("dagmar_csrf", token);
}

async function refreshCsrfToken(): Promise<string> {
  const res = await apiFetch<CsrfTokenResponse>("/api/v1/admin/csrf", { method: "GET" });
  if (!res?.csrf_token) throw new ApiError(500, "CSRF token missing");
  setCsrfToken(res.csrf_token);
  return res.csrf_token;
}

async function ensureCsrfToken(): Promise<string> {
  return getCsrfToken() || (await refreshCsrfToken());
}

export async function adminListInstances(): Promise<AdminInstance[]> {
  return apiFetch<AdminInstance[]>("/api/v1/admin/instances", { method: "GET" });
}

export async function adminGetAttendanceMonth(params: {
  instanceId: string;
  year: number;
  month: number; // 1-12
  signal?: AbortSignal;
}): Promise<AdminAttendanceMonthResponse> {
  const { instanceId, year, month, signal } = params;
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new ApiError(400, "Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(400, "Invalid month");
  }

  return apiFetch<AdminAttendanceMonthResponse>({
    path: "/api/v1/admin/attendance",
    method: "GET",
    query: { instance_id: instanceId, year, month },
    signal,
  });
}

export async function adminUpsertAttendance(body: AdminAttendanceUpsertBody): Promise<{ ok: true }> {
  const csrf = await ensureCsrfToken();
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/attendance",
    method: "PUT",
    body,
    csrfToken: csrf,
  });
}

export async function adminLockAttendance(body: { instance_id: string; year: number; month: number }): Promise<{ ok: true }> {
  const csrf = await ensureCsrfToken();
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/attendance/lock",
    method: "POST",
    body,
    csrfToken: csrf,
  });
}

export async function adminUnlockAttendance(body: { instance_id: string; year: number; month: number }): Promise<{ ok: true }> {
  const csrf = await ensureCsrfToken();
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/attendance/unlock",
    method: "POST",
    body,
    csrfToken: csrf,
  });
}
