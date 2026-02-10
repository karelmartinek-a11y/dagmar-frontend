import React, { useEffect } from "react";
import Button from "../ui/Button";

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
      <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
        {cancelText}
      </Button>

      {onConfirm ? (
        <Button
          type="button"
          variant={destructive ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={!confirmEnabled}
        >
          {loading ? "Probíhá…" : confirmText}
        </Button>
      ) : null}
    </>
  );

  return (
    <div role="dialog" aria-modal="true" className="kb-modal-backdrop" onMouseDown={onClose}>
      <div className="kb-modal" onMouseDown={(e) => e.stopPropagation()}>
        {title || description ? (
          <div className="kb-modal-head">
            {title ? <div className="t">{title}</div> : null}
            {description ? (
              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13, lineHeight: 1.45 }}>{description}</div>
            ) : null}
          </div>
        ) : null}

        <div className="kb-modal-body">{children}</div>
        <div className="kb-modal-actions">{footer ?? defaultFooter}</div>
      </div>
    </div>
  );
}
