"use client";

import { useEffect, useState } from "react";

import { WaveformPlot } from "@/components/evidence/WaveformPlot";
import { loadWaveform } from "@/lib/contract/load";
import type { EegEvidence, Waveform } from "@/lib/contract/types";

/**
 * Functional/crisis evidence (epilepsy): the precomputed spectrogram image and
 * the raw scalp-EEG traces. Serves every `eeg` disorder.
 *
 * Everything shown is scalp-level and approximate by construction. Scalp EEG
 * cannot localise a precise brain focus, so this view never draws a region on
 * the brain — it shows the signal and names the involved channels, and the
 * medical honesty of that framing is stated on screen (frontend/CLAUDE.md).
 */
export function EegView({ evidence }: { evidence: EegEvidence }) {
  // Tag loaded state with its source url so a stale waveform never shows for a
  // different case, without resetting state synchronously inside the effect.
  const [loaded, setLoaded] = useState<{ url: string; data: Waveform } | null>(
    null,
  );
  const [failed, setFailed] = useState<{ url: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    // The waveform JSON is fetched only now, when the EEG view opens.
    loadWaveform(evidence.waveform)
      .then((w) => {
        if (!cancelled) setLoaded({ url: evidence.waveform, data: w });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[evidence] failed to load waveform", err);
        setFailed({
          url: evidence.waveform,
          message:
            err instanceof Error ? err.message : "Could not load the waveform.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [evidence.waveform]);

  const waveform =
    loaded && loaded.url === evidence.waveform ? loaded.data : null;
  const error =
    failed && failed.url === evidence.waveform ? failed.message : null;

  return (
    <div className="scroll-thin h-full min-h-0 overflow-y-auto bg-surface-0">
      <div className="mx-auto max-w-4xl space-y-5 p-5">
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">Spectrogram</h3>
            <p className="ident text-ink-faint">
              onset {evidence.onset_seconds}s &middot; duration{" "}
              {evidence.duration_seconds}s
            </p>
          </div>
          {/* Static precomputed image — no client-side signal processing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={evidence.spectrogram}
            alt="Precomputed EEG spectrogram for the seizure window"
            className="w-full rounded-md border border-line bg-[#08090c]"
          />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              Channel traces
            </h3>
            {evidence.involved_channels.length > 0 && (
              <p className="ident text-primary-role">
                involved: {evidence.involved_channels.join(", ")}
              </p>
            )}
          </div>

          <div className="rounded-md border border-line bg-surface-1">
            {error ? (
              <p className="px-4 py-6 text-center text-[12px] text-pending">
                {error}
              </p>
            ) : waveform ? (
              <WaveformPlot
                waveform={waveform}
                involved={evidence.involved_channels}
              />
            ) : (
              <p className="ident px-4 py-6 text-center text-ink-faint">
                Loading traces…
              </p>
            )}
          </div>
        </section>

        <p className="rounded-md border border-dashed border-line-strong bg-surface-1 px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
          Scalp EEG is a surface measurement. The involved channels overlie a
          brain region approximately; they do not localise a precise seizure
          focus, and nothing here is drawn onto the brain as a confident source.
        </p>
      </div>
    </div>
  );
}
