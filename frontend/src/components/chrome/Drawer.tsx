"use client";

import { useEffect } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which edge the panel slides in from. */
  side: "left" | "right";
  /** Accessible name for the dialog and its close control. */
  label: string;
  children: React.ReactNode;
}

/**
 * A slide-over panel used to reach the region rails on screens too narrow to
 * show them docked (index < lg, detail < md). It is a temporary overlay, not a
 * second copy of the layout: it only mounts when open, so the docked asides
 * remain the single source of those landmarks at desktop width.
 *
 * Uses role="dialog" (not complementary) so it never collides with the docked
 * "Region index" / "Region detail" landmarks that the same content also feeds.
 */
export function Drawer({ open, onClose, side, label, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        aria-label={`Close ${label}`}
        onClick={onClose}
        className="anim-fade absolute inset-0 bg-void/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute inset-y-0 flex w-80 max-w-[85vw] flex-col bg-surface-1 shadow-2xl ${
          side === "left"
            ? "anim-drawer-left left-0 border-r border-line"
            : "anim-drawer-right right-0 border-l border-line"
        }`}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="t-body font-medium text-ink">{label}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label}`}
            className="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
