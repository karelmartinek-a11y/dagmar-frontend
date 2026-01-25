import { useEffect, useState } from "react";
import { getVersionInfo } from "../api/version";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTag(dt: Date) {
  return `${String(dt.getFullYear()).slice(-2)}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}${pad2(dt.getHours())}${pad2(dt.getMinutes())}`;
}

function computeFrontTag() {
  const dt = new Date(document.lastModified);
  if (Number.isNaN(dt.getTime())) return "??????";
  return formatTag(dt);
}

export function DeployStamp() {
  const frontTag = computeFrontTag();
  const [backTag, setBackTag] = useState<string>("…");

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    getVersionInfo(abort.signal)
      .then((info) => {
        if (cancelled) return;
        const tag = info.backend_deploy_tag;
        setBackTag(tag && tag.length > 0 ? tag : "???");
      })
      .catch(() => {
        if (cancelled) return;
        setBackTag("???");
      });

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        fontSize: 11,
        fontWeight: 700,
        color: "#0f172a",
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(15,23,42,0.12)",
        borderRadius: 10,
        padding: "6px 10px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
        display: "grid",
        gap: 4,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontWeight: 900 }}>Front:</span>
        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{frontTag}</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontWeight: 900 }}>Back:</span>
        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{backTag}</span>
      </div>
    </div>
  );
}
