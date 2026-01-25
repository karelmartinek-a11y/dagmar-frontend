import { useMemo, useState } from "react";

type Props = {
  downloadUrl: string;
  appName: string;
  storageKey?: string;
};

export function AndroidDownloadBanner({ downloadUrl, appName, storageKey }: Props) {
  const isAndroid = useMemo(() => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent), []);
  const key = storageKey || "dagmar_android_banner_dismissed";
  const [visible, setVisible] = useState<boolean>(() => {
    if (!isAndroid) return false;
    try {
      return sessionStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });

  if (!visible || !isAndroid) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
        color: "white",
        padding: "12px 14px",
        borderRadius: "12px",
        marginBottom: "12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 10px 25px rgba(14,165,233,0.25)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "14px", lineHeight: 1.4 }}>
        Novinka pro Android: aplikaci <span style={{ textDecoration: "underline" }}>{appName}</span> si můžete stáhnout jako APK.
      </div>
      <a
        href={downloadUrl}
        style={{
          background: "white",
          color: "#0ea5e9",
          fontWeight: 800,
          padding: "8px 12px",
          borderRadius: "10px",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Stáhnout APK
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Zavřít upozornění"
        style={{
          marginLeft: "auto",
          background: "transparent",
          border: "none",
          color: "white",
          fontSize: "16px",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        ×
      </button>
    </div>
  );
}
