import { apiFetch, ApiError } from "./client";
import { ensureCsrfToken, setCsrfToken, withCsrf } from "./csrf";
import type { EmploymentTemplate } from "./instances";

export type AdminMe = {
  authenticated: boolean;
  username?: string;
};

export type InstanceStatus = "PENDING" | "ACTIVE" | "REVOKED" | "DEACTIVATED";
export type ClientType = "ANDROID" | "WEB";

export type AdminInstance = {
  id: string;
  client_type: ClientType;
  status: InstanceStatus;
  display_name: string | null;
  profile_instance_id?: string | null;
  created_at: string;
  last_seen_at: string | null;
  afternoon_cutoff?: string | null;
  activated_at?: string | null;
  revoked_at?: string | null;
  deactivated_at?: string | null;
  employment_template: EmploymentTemplate;
};

export type AdminLoginRequest = {
  username?: string;
  password: string;
};

export type AdminLoginResponse = {
  ok: true;
  csrf_token?: string;
};

export type CsrfTokenResponse = {
  csrf_token: string;
};

export async function adminLogin(body: AdminLoginRequest): Promise<AdminLoginResponse> {
  const res = await apiFetch<AdminLoginResponse>("/api/v1/admin/login", {
    method: "POST",
    headers: withCsrf(),
    body,
  });
  if (res?.csrf_token) setCsrfToken(res.csrf_token);
  return res;
}

export async function adminLogout(): Promise<{ ok: true }> {
  const res = await apiFetch<{ ok: true }>("/api/v1/admin/logout", {
    method: "POST",
    headers: withCsrf(),
  });
  // Best-effort clear.
  sessionStorage.removeItem("dagmar_csrf");
  return res;
}

export async function adminMe(): Promise<AdminMe> {
  try {
    return await apiFetch<AdminMe>("/api/v1/admin/me", { method: "GET" });
  } catch (e) {
    // If session expired, treat as not authenticated.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return { authenticated: false };
    }
    throw e;
  }
}

export async function adminListInstances(): Promise<{ instances: AdminInstance[] }> {
  const items = await apiFetch<AdminInstance[]>("/api/v1/admin/instances", {
    method: "GET",
  });
  return { instances: items };
}

export async function adminActivateInstance(
  id: string,
  display_name: string,
  employment_template: EmploymentTemplate = "DPP_DPC"
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/admin/instances/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    headers: withCsrf(),
    body: { display_name, employment_template },
  });
}

export async function adminRenameInstance(id: string, display_name: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/admin/instances/${encodeURIComponent(id)}/rename`, {
    method: "POST",
    headers: withCsrf(),
    body: { display_name },
  });
}

export async function adminRevokeInstance(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/admin/instances/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    headers: withCsrf(),
  });
}

export async function adminSetTemplate(id: string, employment_template: EmploymentTemplate): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/admin/instances/${encodeURIComponent(id)}/set-template`, {
    method: "POST",
    headers: withCsrf(),
    body: { employment_template },
  });
}

export async function adminDeactivateInstance(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/admin/instances/${encodeURIComponent(id)}/deactivate`, {
    method: "POST",
    headers: withCsrf(),
  });
}

export async function adminMergeInstances(
  target_id: string,
  source_ids: string[]
): Promise<{ ok: true; merged_count: number }> {
  return apiFetch<{ ok: true; merged_count: number }>("/api/v1/admin/instances/merge", {
    method: "POST",
    headers: withCsrf(),
    body: { target_id, source_ids },
  });
}

export type AdminSettings = { afternoon_cutoff: string };

export async function adminGetSettings(): Promise<AdminSettings> {
  return apiFetch<AdminSettings>("/api/v1/admin/settings", { method: "GET" });
}

export async function adminSetSettings(cutoff: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/v1/admin/settings", {
    method: "PUT",
    headers: withCsrf(),
    body: { afternoon_cutoff: cutoff },
  });
}

export async function adminDeleteInstance(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/admin/instances/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: withCsrf(),
  });
}

export async function adminDeletePendingInstances(): Promise<{ ok: true; deleted: number }> {
  return apiFetch<{ ok: true; deleted: number }>("/api/v1/admin/instances/pending", {
    method: "DELETE",
    headers: withCsrf(),
  });
}

export function adminExportUrl(params: { month: string; instance_id?: string; bulk?: boolean }): string {
  const q = new URLSearchParams();
  q.set("month", params.month);
  if (params.instance_id) q.set("instance_id", params.instance_id);
  if (params.bulk) q.set("bulk", "true");
  return `/api/v1/admin/export?${q.toString()}`;
}

export async function ensureAdminCsrfReady(): Promise<void> {
  void ensureCsrfToken();
}

// ---- Compatibility aliases for existing pages ----
export const getAdminMe = adminMe;
export const postAdminLogout = adminLogout;
export const listInstances = async (): Promise<
  Array<{
    id: string;
    client_type: ClientType;
    status: InstanceStatus;
    display_name: string | null;
    created_at: string;
    last_seen: string | null;
  }>
> => {
  const res = await adminListInstances();
  return res.instances.map((i) => {
    const legacyLastSeen = "last_seen" in i ? (i as { last_seen?: string | null }).last_seen : null;
    return {
    id: i.id,
    client_type: i.client_type,
    status: i.status,
    display_name: i.display_name,
    created_at: i.created_at,
      last_seen: i.last_seen_at ?? legacyLastSeen ?? null,
    };
  });
};
export const activateInstance = adminActivateInstance;
export const renameInstance = adminRenameInstance;
export const revokeInstance = adminRevokeInstance;
export const deleteInstance = adminDeleteInstance;
export const deletePendingInstances = adminDeletePendingInstances;

export function adminExportBulkUrl(month: string): string {
  return adminExportUrl({ month, bulk: true });
}

export function adminExportInstanceUrl(month: string, instanceId: string): string {
  return adminExportUrl({ month, instance_id: instanceId });
}
