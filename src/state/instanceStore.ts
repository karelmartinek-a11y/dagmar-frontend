// DAGMAR instance store
// - Persists instance_id, device_fingerprint and instance_token (allowed)
// - Must NOT persist attendance data (per spec)
// - Provides minimal subscribe mechanism (no heavy state libs)

export type ClientType = "WEB" | "ANDROID";

export type InstanceStatus = "PENDING" | "ACTIVE" | "REVOKED";

export type InstanceIdentity = {
  // Server-issued instance id (returned by POST /api/v1/instances/register)
  instanceId: string | null;
  // Stable client fingerprint (sent to register for deduplication)
  deviceFingerprint: string | null;
  // Bearer token for ACTIVE instances; may be persisted.
  instanceToken: string | null;
  // Display name is not secret; can be cached.
  displayName: string | null;
  clientType: ClientType;
};

type Listener = (state: InstanceIdentity) => void;

const STORAGE_KEY = "dagmar_instance_v1";

// Safe localStorage helpers (avoid crashes in restricted browsers/private mode)
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore write errors (quota / disabled storage); state will stay in-memory
  }
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function genDeviceFingerprint(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  // Fallback simple UUID-ish
  return "id-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

export function detectClientType(): ClientType {
  if (typeof navigator === "undefined") return "WEB";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "ANDROID";
  return "WEB";
}

function loadInitial(): InstanceIdentity {
  const raw = safeJsonParse<Partial<InstanceIdentity>>(safeGetItem(STORAGE_KEY));
  const clientType: ClientType = "WEB";

  const instanceId = typeof raw?.instanceId === "string" ? raw.instanceId : null;
  const instanceToken = typeof raw?.instanceToken === "string" ? raw.instanceToken : null;
  const displayName = typeof raw?.displayName === "string" ? raw.displayName : null;

  // Migration: older clients stored only instanceId/token/displayName.
  // If token doesn't exist yet, `instanceId` was often used as a local fingerprint.
  const deviceFingerprint =
    typeof raw?.deviceFingerprint === "string"
      ? raw.deviceFingerprint
      : !instanceToken && instanceId
        ? instanceId
        : genDeviceFingerprint();

  return {
    instanceId,
    deviceFingerprint,
    instanceToken,
    displayName,
    clientType,
  };
}

function persist(s: InstanceIdentity) {
  // Only persist allowed keys.
  const payload: Partial<InstanceIdentity> = {
    instanceId: s.instanceId,
    deviceFingerprint: s.deviceFingerprint,
    instanceToken: s.instanceToken,
    displayName: s.displayName,
  };
  safeSetItem(STORAGE_KEY, JSON.stringify(payload));
}

let state: InstanceIdentity = loadInitial();
const listeners = new Set<Listener>();

// Ensure migrations are persisted (deviceFingerprint added).
persist(state);

function emit() {
  for (const l of listeners) l(state);
}

export const instanceStore = {
  get(): InstanceIdentity {
    return state;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  },

  setDeviceFingerprint(deviceFingerprint: string) {
    // New fingerprint = new registration.
    state = {
      ...state,
      deviceFingerprint,
      instanceId: null,
      instanceToken: null,
      displayName: null,
    };
    persist(state);
    emit();
  },

  setInstanceId(instanceId: string | null) {
    const changed = state.instanceId !== instanceId;
    state = {
      ...state,
      instanceId,
      ...(changed ? { instanceToken: null, displayName: null } : {}),
    };
    persist(state);
    emit();
  },

  setActiveToken(instanceToken: string, displayName: string) {
    state = { ...state, instanceToken, displayName };
    persist(state);
    emit();
  },

  clearToken() {
    state = { ...state, instanceToken: null, displayName: null };
    persist(state);
    emit();
  },

  resetAll() {
    // Used only for debugging/manual reset.
    state = {
      instanceId: null,
      deviceFingerprint: genDeviceFingerprint(),
      instanceToken: null,
      displayName: null,
      clientType: "WEB",
    };
    persist(state);
    emit();
  },
};

export function getOrCreateDeviceFingerprint(): string {
  const cur = instanceStore.get().deviceFingerprint;
  if (cur) return cur;
  const next = genDeviceFingerprint();
  state = { ...state, deviceFingerprint: next };
  persist(state);
  emit();
  return next;
}

export function startNewRegistration(): string {
  const next = genDeviceFingerprint();
  instanceStore.setDeviceFingerprint(next);
  return next;
}

export function getInstanceToken(): string | null {
  return instanceStore.get().instanceToken;
}

export function setInstanceToken(token: string) {
  const st = instanceStore.get();
  instanceStore.setActiveToken(token, st.displayName ?? "");
}

export function getInstanceDisplayName(): string | null {
  return instanceStore.get().displayName;
}

export function setInstanceDisplayName(name: string) {
  const st = instanceStore.get();
  instanceStore.setActiveToken(st.instanceToken ?? "", name);
}
