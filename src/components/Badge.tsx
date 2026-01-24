export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export type BadgeProps = {
  label?: string;
  tone?: BadgeTone;
  status?: "PENDING" | "ACTIVE" | "REVOKED" | "DEACTIVATED";
  title?: string;
  className?: string;
};

function cx(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

const toneToClass: Record<BadgeTone, string> = {
  neutral: "",
  success: "active",
  warning: "pending",
  danger: "revoked",
};

const statusToClass: Record<NonNullable<BadgeProps["status"]>, string> = {
  PENDING: "pending",
  ACTIVE: "active",
  REVOKED: "revoked",
  DEACTIVATED: "revoked",
};

export function Badge({ label, tone = "neutral", status, title, className }: BadgeProps) {
  const resolvedLabel =
    status === "PENDING"
      ? "Čeká"
      : status === "ACTIVE"
        ? "Aktivní"
        : status === "REVOKED"
          ? "Zrušeno"
          : status === "DEACTIVATED"
            ? "Deaktivováno"
            : label || "";
  const resolvedClass = status ? statusToClass[status] : toneToClass[tone];

  return (
    <span title={title} className={cx("badge", resolvedClass, className)}>
      <span className="b-dot" aria-hidden="true" />
      <span>{resolvedLabel}</span>
    </span>
  );
}
