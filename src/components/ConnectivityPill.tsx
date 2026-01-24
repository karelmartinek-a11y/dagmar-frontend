export type ConnectivityPillProps = {
  online: boolean;
  pendingCount?: number;
  lastSentAt?: string | null;
  queuedCount?: number;
  sending?: boolean;
};

function formatLastSent(lastSentAt?: string | null): string {
  if (!lastSentAt) return "";
  try {
    const d = new Date(lastSentAt);
    if (Number.isNaN(d.getTime())) return "";

    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

export function ConnectivityPill({
  online,
  pendingCount,
  queuedCount,
  sending = false,
  lastSentAt = null,
}: ConnectivityPillProps) {
  const queuedTotal = queuedCount ?? pendingCount ?? 0;
  const queued = queuedTotal > 0;
  const sentTime = formatLastSent(lastSentAt);

  const dotColor = online ? "#16a34a" : "#ef4444"; // green/red
  const borderColor = online ? "rgba(22,163,74,0.35)" : "rgba(239,68,68,0.35)";
  const bgColor = online ? "rgba(22,163,74,0.10)" : "rgba(239,68,68,0.10)";

  const queueText = queued
    ? `Čeká ${queuedTotal}`
    : online
      ? sentTime
        ? sending
          ? `Odesílám…`
          : `Odesláno ${sentTime}`
        : sending
          ? "Odesílám…"
          : "Odesláno"
      : "Offline";

  return (
    <div
      aria-live="polite"
      title={
        online
          ? queued
            ? "Online – čekající změny budou odeslány"
            : "Online – změny jsou odesílány"
          : "Offline – změny se mohou dočasně držet v paměti"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${borderColor}`,
        background: bgColor,
        color: "#0f172a",
        fontSize: 12,
        lineHeight: "16px",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dotColor,
          boxShadow: `0 0 0 3px ${bgColor}`,
          flex: "0 0 auto",
        }}
      />
      <span style={{ fontWeight: 600 }}>{online ? "Online" : "Offline"}</span>
      <span style={{ opacity: 0.85 }}>•</span>
      <span style={{ opacity: 0.95 }}>{queueText}</span>
    </div>
  );
}

export default ConnectivityPill;
