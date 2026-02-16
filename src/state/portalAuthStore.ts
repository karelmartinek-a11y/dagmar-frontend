export type PortalAuthState = {
  accessToken: string | null;
  profileId: string | null;
  displayName: string | null;
};

const STORAGE_KEY = "dagmar_portal_auth_v1";

function read(): PortalAuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, profileId: null, displayName: null };
    const parsed = JSON.parse(raw) as Partial<PortalAuthState>;
    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      profileId: typeof parsed.profileId === "string" ? parsed.profileId : null,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
    };
  } catch {
    return { accessToken: null, profileId: null, displayName: null };
  }
}

function write(state: PortalAuthState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function getPortalAuthState(): PortalAuthState {
  return read();
}

export function setPortalAuthState(next: PortalAuthState) {
  write(next);
}

export function clearPortalAuthState() {
  write({ accessToken: null, profileId: null, displayName: null });
}
