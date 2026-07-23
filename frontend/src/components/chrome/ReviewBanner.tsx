"use client";

/**
 * Persistent "pending expert review" banner, required by the root CLAUDE.md
 * for as long as any record on screen is unreviewed.
 *
 * It is deliberately not dismissible. A reviewer must never be able to arrive
 * at a screenshot of this tool with no indication that the content has not been
 * signed off by a neurologist.
 */
export function ReviewBanner({ pendingCount }: { pendingCount: number }) {
  if (pendingCount === 0) return null;

  return (
    <div
      role="status"
      className="anim-fade flex shrink-0 items-center gap-2.5 border-b border-pending/25 bg-pending/10 px-3 py-1"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-pending" />
      <p className="t-ctl min-w-0 truncate leading-tight text-pending">
        <span className="font-medium">Research preview.</span>{" "}
        <span className="text-pending/80">
          For demonstration only, not for clinical use &mdash; descriptions
          marked pending are awaiting expert sign-off and are not clinical fact.
        </span>
      </p>
      <span className="ident ml-auto shrink-0 text-pending/60">
        {pendingCount} pending sign-off
      </span>
    </div>
  );
}
