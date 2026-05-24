"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Wraps a form (or any clickable trigger) with a confirmation modal.
 * Usage:
 *   <ConfirmDelete
 *     title="Excluir disparo?"
 *     description="Não pode ser desfeito."
 *     formAction={deleteAction}
 *     hiddenFields={{ id: row.id }}
 *     trigger={<Trash2 />}
 *   />
 */
interface Props {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  formAction: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
  trigger: ReactNode;
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
}

export function ConfirmDelete({
  title,
  description,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  formAction,
  hiddenFields = {},
  trigger,
  triggerClassName = "btn btn-danger text-xs",
  triggerStyle = { padding: "4px 8px" },
}: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
        style={triggerStyle}
        aria-label={title}
      >
        {trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            className="card w-full max-w-md p-6"
            style={{ background: "var(--surface)", boxShadow: "0 12px 36px rgba(0,0,0,0.45)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg">{title}</h3>
                {description && (
                  <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm opacity-60 hover:opacity-100"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={formAction} className="flex justify-end gap-2 mt-6">
              {Object.entries(hiddenFields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost"
              >
                {cancelLabel}
              </button>
              <button type="submit" className="btn btn-danger">
                {confirmLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
