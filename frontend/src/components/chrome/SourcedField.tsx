"use client";

import { resolveSourced } from "@/lib/contract/review";
import type { SourcedText } from "@/lib/contract/types";

/**
 * Renders a contract text field that may not have a cited source yet.
 *
 * Unsourced content is shown as an explicit, visually distinct placeholder —
 * never blank, and never replaced with text this app made up. This component is
 * the only sanctioned way to put a `SourcedText` value on screen.
 */
export function SourcedField({
  value,
  citation = null,
  label,
}: {
  value: SourcedText | null | undefined;
  citation?: string | null;
  label: string;
}) {
  const resolved = resolveSourced(value, citation);

  return (
    <section className="space-y-1.5">
      <h3 className="t-tag font-medium uppercase tracking-[0.13em] text-ink-faint">
        {label}
      </h3>

      {resolved.status === "pending" ? (
        <p className="t-body flex gap-2 rounded-md border border-dashed border-pending/35 bg-pending/[0.06] px-2.5 py-2 leading-relaxed text-pending/90">
          <span aria-hidden className="select-none">
            &#9888;
          </span>
          {resolved.text}
        </p>
      ) : (
        <>
          <p className="t-read leading-relaxed text-ink/90">
            {resolved.text}
          </p>
          {resolved.citation && (
            <p className="ident text-cited">Source: {resolved.citation}</p>
          )}
        </>
      )}
    </section>
  );
}
