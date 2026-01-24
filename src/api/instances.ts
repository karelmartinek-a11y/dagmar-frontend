import { httpJson } from "./client";

export type ClientType = "ANDROID" | "WEB";

export type InstanceStatus = "PENDING" | "ACTIVE" | "REVOKED" | "DEACTIVATED";
export type EmploymentTemplate = "DPP_DPC" | "HPP";

export interface RegisterInstanceRequest {
  client_type: ClientType;
  device_fingerprint: string;
  device_info?: Record<string, unknown>;
  display_name?: string;
}

export interface RegisterInstanceResponse {
  instance_id: string;
  status: "PENDING";
}

export type GetInstanceStatusResponse =
  | { status: "PENDING" }
  | { status: "REVOKED" }
  | { status: "DEACTIVATED" }
  | { status: "ACTIVE"; display_name: string; employment_template?: EmploymentTemplate; afternoon_cutoff?: string };

export interface ClaimTokenResponse {
  instance_token: string;
  display_name: string;
}

export async function registerInstance(
  body: RegisterInstanceRequest,
  _clientId?: string // ignored, kept for backward compatibility
): Promise<RegisterInstanceResponse> {
  return await httpJson<RegisterInstanceResponse>(
    "/api/v1/instances/register",
    {
      method: "POST",
      body,
      // no auth
    }
  );
}

export async function getInstanceStatus(
  instanceId: string
): Promise<GetInstanceStatusResponse> {
  return await httpJson<GetInstanceStatusResponse>(
    `/api/v1/instances/${encodeURIComponent(instanceId)}/status`,
    {
      method: "GET",
      // no auth
    }
  );
}

export async function claimInstanceToken(
  instanceId: string
): Promise<ClaimTokenResponse> {
  return await httpJson<ClaimTokenResponse>(
    `/api/v1/instances/${encodeURIComponent(instanceId)}/claim-token`,
    {
      method: "POST",
      // no auth; the instance_id acts as the selector; token is issued only when ACTIVE.
    }
  );
}

// Compatibility aliases for existing pages
export const getStatus = getInstanceStatus;
export const claimToken = claimInstanceToken;
