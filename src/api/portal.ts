import { apiFetch } from "./client";

export type PortalLoginResponse = {
  instance_id: string;
  instance_token: string;
  display_name?: string | null;
  employment_template?: string | null;
  afternoon_cutoff?: string | null;
};

export async function portalLogin(params: { email: string; password: string }): Promise<PortalLoginResponse> {
  return apiFetch<PortalLoginResponse>("/api/v1/portal/login", {
    method: "POST",
    body: params,
  });
}

export async function portalResetPassword(params: { token: string; password: string }): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/v1/portal/reset", {
    method: "POST",
    body: params,
  });
}
