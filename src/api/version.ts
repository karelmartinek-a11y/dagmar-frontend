import { fetchJson } from "./client";

export type VersionInfo = {
  backend_deploy_tag?: string;
  environment?: string;
};

export async function getVersionInfo(signal?: AbortSignal): Promise<VersionInfo> {
  return fetchJson<VersionInfo>({
    path: "/api/version",
    credentials: "include",
    signal,
  });
}
