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
  neutral: "kb-badge-neutral",
  success: "kb-badge-success",
  warning: "kb-badge-warning",
  danger: "kb-badge-danger",
};

const statusToClass: Record<NonNullable<BadgeProps["status"]>, string> = {
  PENDING: "kb-badge-warning",
  ACTIVE: "kb-badge-success",
  REVOKED: "kb-badge-danger",
  DEACTIVATED: "kb-badge-danger",
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
    <span title={title} className={cx("kb-badge", resolvedClass, className)}>
      <span className="kb-badge-dot" aria-hidden="true" />
      <span>{resolvedLabel}</span>
    </span>
  );
}
