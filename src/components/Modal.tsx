import React, { useEffect } from "react";

export type ModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  disableConfirm?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
};

function cx(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Modal({
  open,
  title,
  description,
  confirmText = "Potvrdit",
  cancelText = "Zrušit",
  destructive = false,
  loading = false,
  disableConfirm = false,
  onClose,
  onConfirm,
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const confirmEnabled = Boolean(onConfirm) && !loading && !disableConfirm;

  const defaultFooter = (
    <>
      <button type="button" className="btn" onClick={onClose} disabled={loading}>
        {cancelText}
      </button>

      {onConfirm ? (
        <button
          type="button"
          className={cx("btn", destructive ? "danger" : "solid")}
          onClick={onConfirm}
          disabled={!confirmEnabled}
        >
          {loading ? "Probíhá…" : confirmText}
        </button>
      ) : null}
    </>
  );

  return (
    <div role="dialog" aria-modal="true" className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {title || description ? (
          <div className="modal-head">
            {title ? <div className="t">{title}</div> : null}
            {description ? (
              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13, lineHeight: 1.45 }}>{description}</div>
            ) : null}
          </div>
        ) : null}

        <div className="modal-body">{children}</div>
        <div className="modal-actions">{footer ?? defaultFooter}</div>
      </div>
    </div>
  );
}
