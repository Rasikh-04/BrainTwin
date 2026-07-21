"use client";

import { ThemeToggle } from "./ThemeToggle";

interface TopBarProps {
  /** Count of records not yet neurologist-reviewed, for the status pip. */
  pendingCount: number;
  /** Open the region index drawer (small screens, where it is undocked). */
  onOpenIndex: () => void;
  /** Open the region detail drawer (small screens, where it is undocked). */
  onOpenDetail: () => void;
}

/** A small anatomical mark — a stylised sagittal hemisphere with the medial
 *  sulci — so the instrument reads as a brain tool at a glance, not a generic
 *  app. Drawn in currentColor so it inherits the accent. */
function BrainMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15.5 4.5c2.6 0 4.5 1.9 4.5 4.2 0 1 .5 1.4.9 2 .5.7.6 1.8-.2 2.5.3.9 0 2-1 2.5.1 1.2-.9 2.3-2.4 2.3H8.6C5.5 20.5 3 18 3 14.8c0-1.3.4-2.3 1.1-3.2C3.8 10.9 4 9.4 5 8.6c.2-2.4 2.1-4.1 4.6-4.1 1.2 0 2.2.4 3 1 .8-.6 1.8-1 2.9-1Z" />
      <path d="M12 5.5v14M9.2 8.6c1 .2 1.6 1 1.6 2M14.8 9c-1 .2-1.7 1-1.7 2.1M9 13.5c1.1 0 1.8.7 1.8 1.8M15 13c-1.1.1-1.9.9-1.9 2" />
    </svg>
  );
}

/**
 * The instrument app-bar. A single thin band that frames the workspace and
 * carries global identity, review state, the theme switch, and — on small
 * screens — the triggers that reveal the region rails the layout can no longer
 * dock. The stage stays full-bleed below it; on-stage tools (layers, views)
 * still float over the canvas.
 */
export function TopBar({ pendingCount, onOpenIndex, onOpenDetail }: TopBarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3">
      <div className="flex items-center gap-2 text-select">
        <BrainMark />
        <span className="text-[13.5px] font-semibold tracking-tight text-ink">
          BrainTwin
        </span>
      </div>

      <span aria-hidden className="hidden h-3.5 w-px bg-line-strong sm:block" />
      <p className="ident hidden sm:block">Atlas explorer &middot; normal brain</p>

      <div className="ml-auto flex items-center gap-1">
        {pendingCount > 0 && (
          <span
            className="mr-1 hidden items-center gap-1.5 rounded-full border border-pending/30 bg-pending/10 px-2 py-0.5 md:inline-flex"
            title="Content is awaiting neurologist review"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-pending" />
            <span className="ident text-pending/90">pending review</span>
          </span>
        )}

        <button
          type="button"
          onClick={onOpenIndex}
          className="rounded-md px-2.5 py-1 text-[11.5px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          Regions
        </button>
        <button
          type="button"
          onClick={onOpenDetail}
          className="rounded-md px-2.5 py-1 text-[11.5px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
        >
          Detail
        </button>

        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <ThemeToggle />
      </div>
    </header>
  );
}
