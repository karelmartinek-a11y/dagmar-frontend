import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCreateIntegrationClient } from "../src/api/admin";

describe("admin integrations API", () => {
  const sessionStorageMock = {
    data: new Map<string, string>(),
    getItem(key: string) {
      return this.data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.data.set(key, value);
    },
    clear() {
      this.data.clear();
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorageMock.clear();
  });

  Object.defineProperty(globalThis, "window", {
    value: {
      location: {
        origin: "https://dagmar.hcasc.cz",
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: sessionStorageMock,
    configurable: true,
  });

  it("odesle create payload na admin integrations endpoint", async () => {
    sessionStorageMock.setItem("dagmar_csrf", "csrf-token");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          client: {
            id: 1,
            name: "mzdovy-import",
            status: "ACTIVE",
            scopes: ["integration:health"],
            allowed_employment_ids: [],
            allowed_employee_ids: [],
            ip_allowlist: [],
            expires_at: null,
            last_used_at: null,
            created_at: "2026-06-22T20:00:00Z",
            updated_at: "2026-06-22T20:00:00Z",
            created_by: "admin-web",
            active_secret_fingerprint: "abc123",
            active_secret_last4: "WXYZ",
          },
          plaintext_token: "dgi_token",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await adminCreateIntegrationClient({
      name: "mzdovy-import",
      scopes: ["integration:health"],
      allowed_employment_ids: [],
      allowed_employee_ids: [],
      ip_allowlist: [],
      expires_at: null,
      created_by: "admin-web",
    });

    expect(result.plaintext_token).toBe("dgi_token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://dagmar.hcasc.cz/api/v1/admin/integrations/clients");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-token");
  });
});
