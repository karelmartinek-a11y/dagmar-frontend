import { apiFetch } from "./client";
import { ensureCsrfToken } from "./csrf";

export type ActiveInstance = {
  id: string;
  display_name: string | null;
  employment_template: string;
};

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

export type ShiftPlanMonth = {
  year: number;
  month: number;
  selected_instance_ids: string[];
  active_instances: ActiveInstance[];
  rows: ShiftPlanRow[];
};

export type ShiftPlanSelectionRequest = {
  year: number;
  month: number;
  instance_ids: string[];
};

export type ShiftPlanUpsertRequest = {
  instance_id: string;
  date: string;
  arrival_time: string | null;
  departure_time: string | null;
};

export async function adminGetShiftPlanMonth(params: { year: number; month: number }): Promise<ShiftPlanMonth> {
  const { year, month } = params;
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error("Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }
  const mm = String(month).padStart(2, "0");
  return apiFetch<ShiftPlanMonth>({
    path: "/api/v1/admin/shift-plan",
    method: "GET",
    query: { year, month: mm },
  });
}

export async function adminUpsertShiftPlan(body: ShiftPlanUpsertRequest): Promise<{ ok: true }> {
  const csrf = await ensureCsrfToken();
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/shift-plan",
    method: "PUT",
    body,
    csrfToken: csrf,
  });
}

export async function adminSetShiftPlanSelection(body: ShiftPlanSelectionRequest): Promise<{ ok: true }> {
  const csrf = await ensureCsrfToken();
  return apiFetch<{ ok: true }>({
    path: "/api/v1/admin/shift-plan/selection",
    method: "PUT",
    body,
    csrfToken: csrf,
  });
}
