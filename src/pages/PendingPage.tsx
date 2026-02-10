import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { getStatus, registerInstance } from "../api/instances";
import { detectClientType, getOrCreateDeviceFingerprint, instanceStore, setInstanceDisplayName, startNewRegistration } from "../state/instanceStore";

type Props = {
  instanceId?: string | null;
};

const logoUrl = "/brand/logo.svg";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export function PendingPage({ instanceId }: Props) {
  const nav = useNavigate();
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [currentId, setCurrentId] = useState<string | null>(() => instanceId ?? instanceStore.get().instanceId);
  const [fingerprint, setFingerprint] = useState<string>(() => getOrCreateDeviceFingerprint());
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [displayName, setDisplayName] = useState<string>(() => instanceStore.get().displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deactivated, setDeactivated] = useState(false);

  const clientType = useMemo(() => detectClientType(), []);
  const deviceInfo = useMemo(
    () => ({
      ua: navigator.userAgent,
      platform: navigator.platform,
    }),
    []
  );

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = instanceStore.subscribe((st) => {
      if (cancelled) return;
      setCurrentId(st.instanceId);
      setFingerprint(st.deviceFingerprint ?? getOrCreateDeviceFingerprint());
      setDisplayName((prev) => (st.displayName && st.displayName !== prev ? st.displayName : prev));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ensureServerInstanceId() {
      if (!online) return;
      setError(null);

      let id = instanceStore.get().instanceId;
      if (id) {
        try {
          await getStatus(id);
          return;
        } catch (err: unknown) {
          // Legacy clients stored device_fingerprint as instanceId; status will be 404.
          if (err instanceof ApiError && err.status === 404) {
            instanceStore.setDeviceFingerprint(id);
            id = null;
          } else {
            return;
          }
        }
      }

      if (!id) {
        const fp = getOrCreateDeviceFingerprint();
        const res = await registerInstance(
          { client_type: clientType, device_fingerprint: fp, device_info: deviceInfo },
          fp
        );
        if (cancelled) return;
        instanceStore.setInstanceId(res.instance_id);
      }
    }

    ensureServerInstanceId().catch((err: unknown) => {
      if (cancelled) return;
      setError(errorMessage(err, "Registrace se nezdařila. Zkuste to prosím znovu."));
    });

    return () => {
      cancelled = true;
    };
  }, [clientType, deviceInfo, online]);

  // While on the pending screen, keep polling status so the app unlocks automatically after admin activation.
  useEffect(() => {
    let cancelled = false;
    async function pollStatus() {
      if (cancelled) return;
      if (!online) return;
      const id = instanceStore.get().instanceId;
      if (!id) return;

      try {
        const st = await getStatus(id);
        if (cancelled) return;
        if (st.status === "DEACTIVATED") {
          setDeactivated(true);
          setStatusMessage("Zařízení bylo deaktivováno. Kontaktujte administrátora.");
          return;
        }
        setDeactivated(false);
        if (st.status === "ACTIVE") {
          if (st.display_name) setInstanceDisplayName(st.display_name);
          nav("/app", { replace: true });
        }
      } catch {
        // ignore; handled elsewhere / user sees "Nelze ověřit stav" in main app
      }
    }

    pollStatus();
    const t = window.setInterval(pollStatus, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [nav, online, currentId]);

  const handleReRegister = useCallback(async () => {
    if (deactivated) {
      setStatusMessage("Zařízení bylo deaktivováno. Kontaktujte administrátora.");
      return;
    }
    setCreating(true);
    setError(null);
    setStatusMessage(null);
    try {
      // Generate a fresh fingerprint (also clears previous server instance id + token).
      const fp = startNewRegistration();
      const res = await registerInstance(
        { client_type: clientType, device_fingerprint: fp, device_info: deviceInfo },
        fp
      );
      instanceStore.setInstanceId(res.instance_id);
      setDeactivated(false);
    } catch (err: unknown) {
      setError(errorMessage(err, "Registrace se nezdařila. Zkuste to prosím znovu."));
    } finally {
      setCreating(false);
    }
  }, [clientType, deviceInfo, deactivated]);

  const handleCheckStatus = useCallback(async () => {
    const id = instanceStore.get().instanceId;
    if (!id) {
      setStatusMessage("Zařízení ještě není registrované.");
      return;
    }

    setChecking(true);
    setError(null);
    setStatusMessage(null);
    try {
      const st = await getStatus(id);
      if (st.status === "ACTIVE") {
        if (st.display_name) setInstanceDisplayName(st.display_name);
        nav("/app", { replace: true });
        return;
      }
      if (st.status === "DEACTIVATED") {
        setDeactivated(true);
        setStatusMessage("Zařízení bylo deaktivováno. Kontaktujte administrátora.");
        return;
      }
      setDeactivated(false);
      if (st.status === "REVOKED") {
        setStatusMessage("Zařízení bylo odregistrováno. Vygenerujte nové ID.");
      } else {
        setStatusMessage("Zařízení čeká na schválení administrátorem.");
      }
    } catch (err: unknown) {
      setStatusMessage(errorMessage(err, "Stav se nepodařilo ověřit. Zkuste znovu."));
    } finally {
      setChecking(false);
    }
  }, [nav]);

  const handleSaveName = useCallback(async () => {
    if (!online) {
      setError("Nejste online. Jméno lze odeslat až po připojení.");
      return;
    }
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError("Zadejte prosím jméno.");
      return;
    }
    setSavingName(true);
    setError(null);
    setStatusMessage(null);
    try {
      const fp = instanceStore.get().deviceFingerprint ?? getOrCreateDeviceFingerprint();
      const res = await registerInstance(
        { client_type: clientType, device_fingerprint: fp, device_info: deviceInfo, display_name: trimmed },
        fp
      );
      if (!instanceStore.get().instanceId) {
        instanceStore.setInstanceId(res.instance_id);
      }
      setInstanceDisplayName(trimmed);
      setStatusMessage("Jméno bylo odesláno administrátorovi.");
    } catch (err: unknown) {
      setError(errorMessage(err, "Odeslání jména se nezdařilo. Zkuste to prosím znovu."));
    } finally {
      setSavingName(false);
    }
  }, [clientType, deviceInfo, displayName, online]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0b1b3a 0%, #0a1226 35%, #070b14 100%)",
        color: "#e8eefc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(10px)",
          padding: 24,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <img
            src={logoUrl}
            alt=""
            style={{
              width: 120,
              height: 120,
              objectFit: "contain",
              borderRadius: 20,
              background: "rgba(255,255,255,0.1)",
              padding: 12,
              boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            }}
          />
        </div>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, letterSpacing: 0.4, opacity: 0.8 }}>KájovoDagmar docházkový systém</div>
          <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800 }}>Zařízení není aktivováno</h1>
        </div>

        <p style={{ marginTop: 14, marginBottom: 0, lineHeight: 1.55, color: "rgba(232,238,252,0.88)" }}>
          Toto zařízení je zaregistrované, ale zatím čeká na schválení administrátorem. Jakmile bude aktivované,
          aplikace se automaticky odemkne.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 6 }}>Jméno pro administrátora</div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jméno a příjmení"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              fontSize: 14,
            }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName || !online}
              style={{
                border: "1px solid rgba(56,189,248,0.45)",
                background: "linear-gradient(90deg, rgba(14,165,233,0.35), rgba(56,189,248,0.25))",
                color: "white",
                fontWeight: 750,
                padding: "10px 14px",
                borderRadius: 12,
                cursor: savingName || !online ? "not-allowed" : "pointer",
              }}
            >
              {!online ? "Offline" : savingName ? "Odesílám…" : "Odeslat jméno"}
            </button>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Jméno se zobrazí v adminu u PENDING zařízení.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Tip</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(232,238,252,0.86)" }}>
            Pokud jste nový zaměstnanec nebo máte nové zařízení, kontaktujte administrátora a sdělte mu ID instance.
          </div>

          {currentId ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 6 }}>ID instance</div>
              <div
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                  fontSize: 13,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  wordBreak: "break-all",
                }}
              >
                {currentId}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 6 }}>Otisk zařízení (technické)</div>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 13,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "10px 12px",
                wordBreak: "break-all",
                opacity: 0.9,
              }}
            >
              {fingerprint}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              V adminu se aktivuje <strong>ID instance</strong> (ne otisk zařízení).
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleReRegister}
              disabled={creating || !online || deactivated}
              style={{
                border: "1px solid rgba(56,189,248,0.45)",
                background: "linear-gradient(90deg, rgba(14,165,233,0.35), rgba(56,189,248,0.25))",
                color: "white",
                fontWeight: 750,
                padding: "10px 14px",
                borderRadius: 12,
                cursor: creating || !online || deactivated ? "not-allowed" : "pointer",
              }}
            >
              {!online ? "Offline" : deactivated ? "Deaktivováno" : creating ? "Generuji…" : "Vygenerovat nové ID"}
            </button>
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={checking || !online || !instanceStore.get().instanceId}
              style={{
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                fontWeight: 700,
                padding: "10px 14px",
                borderRadius: 12,
                cursor: checking || !online ? "not-allowed" : "pointer",
              }}
            >
              {checking ? "Kontroluji…" : "Zkontrolovat stav"}
            </button>
            {clientType === "ANDROID" ? (
              <a
                href="/download/dochazka.apk"
                style={{
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(255,255,255,0.12)",
                  color: "white",
                  fontWeight: 700,
                  padding: "10px 14px",
                  borderRadius: 12,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📥 Stáhnout Android APK
              </a>
            ) : null}
            {statusMessage ? (
              <div
                style={{
                  color: "#0ea5e9",
                  fontSize: 13,
                  background: "rgba(14,165,233,0.10)",
                  border: "1px solid rgba(14,165,233,0.30)",
                  padding: "8px 10px",
                  borderRadius: 10,
                }}
              >
                {statusMessage}
              </div>
            ) : null}
            {error ? (
              <div
                style={{
                  color: "#f87171",
                  fontSize: 13,
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  padding: "8px 10px",
                  borderRadius: 10,
                }}
              >
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
          Pozn.: Bez aktivace není možné pokračovat v používání aplikace.
        </div>
      </div>
    </div>
  );
}
