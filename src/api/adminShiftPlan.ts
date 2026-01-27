import { apiFetch, ApiError } from "./client";

export type ShiftPlanDay = {
  date: string;
  arrival_time: string | null;
  departure_time: string | null;
};

export type ShiftPlanRow = {
  instance_id: string;
  display_name: string | null;
  employment_template: string;
  days: ShiftPlanDay[];
};

export type ShiftPlanMonthResponse = {
  year: number;
  month: number;
  selected_instance_ids: string[];
  active_instances: Array<{ id: string; display_name: string | null; employment_template: string }>;
  rows: ShiftPlanRow[];
};

export async function adminGetShiftPlanMonth(params: { year: number; month: number; signal?: AbortSignal }) {
  const { year, month, signal } = params;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ApiError(400, "Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(400, "Invalid month");
  }
  return apiFetch<ShiftPlanMonthResponse>({
    path: "/api/v1/admin/shift-plan",
    method: "GET",
    query: { year, month },
    signal,
  });
}

export async function adminSetShiftPlanSelection(body: { year: number; month: number; instance_ids: string[] }) {
  const { year, month, instance_ids } = body;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, "Invalid year");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError(400, "Invalid month");
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/shift-plan/selection",
    method: "PUT",
    body: { year, month, instance_ids },
  });
}

export async function adminUpsertShiftPlan(body: { instance_id: string; date: string; arrival_time: string | null; departure_time: string | null }) {
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/shift-plan",
    method: "PUT",
    body,
  });
}
