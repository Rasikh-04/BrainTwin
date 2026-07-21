"use client";

import { useEffect, useRef } from "react";

import type { Waveform } from "@/lib/contract/types";

interface WaveformPlotProps {
  waveform: Waveform;
  /** Channels to draw emphasised (the case's involved scalp channels). */
  involved: string[];
}

const ROW_HEIGHT = 46;
const PADDING_X = 8;

/**
 * A stacked multi-channel EEG trace, drawn from precomputed samples.
 *
 * This is display only: no filtering, montage maths, or feature detection runs
 * here (frontend/CLAUDE.md — "no client-side signal processing"). Each channel
 * is min/max-normalised purely so the trace fits its lane; the shown amplitudes
 * are not calibrated microvolts and must not be read as measurements.
 */
export function WaveformPlot({ waveform, involved }: WaveformPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const involvedKey = involved.join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const channels = waveform.channels;
    const involvedSet = new Set(involved);

    // Size the backing store to the device pixel ratio for a crisp trace, then
    // work in CSS pixels via the transform.
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = channels.length * ROW_HEIGHT;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const styles = getComputedStyle(document.documentElement);
    const involvedColor =
      styles.getPropertyValue("--color-primary-role").trim() || "#e5679a";
    const baseColor = styles.getPropertyValue("--color-ink-faint").trim() || "#8a94a6";
    const lineColor = styles.getPropertyValue("--color-line").trim() || "#2a2f3a";

    const plotWidth = cssWidth - PADDING_X * 2;

    channels.forEach((channel, row) => {
      const top = row * ROW_HEIGHT;
      const mid = top + ROW_HEIGHT / 2;
      const isInvolved = involvedSet.has(channel.name);

      // Lane separator.
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, top + 0.5);
      ctx.lineTo(cssWidth, top + 0.5);
      ctx.stroke();

      // Channel name in the lane's top-left, involved ones emphasised.
      ctx.font =
        "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = isInvolved ? involvedColor : baseColor;
      ctx.globalAlpha = isInvolved ? 1 : 0.8;
      ctx.textBaseline = "top";
      ctx.fillText(channel.name, PADDING_X, top + 4);
      ctx.globalAlpha = 1;

      const values = channel.values;
      if (values.length === 0) return;

      let min = values[0];
      let max = values[0];
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const span = max - min || 1;
      const amp = (ROW_HEIGHT - 12) / 2;

      ctx.strokeStyle = isInvolved ? involvedColor : baseColor;
      ctx.lineWidth = isInvolved ? 1.4 : 0.9;
      ctx.globalAlpha = isInvolved ? 1 : 0.65;
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = PADDING_X + (i / (values.length - 1)) * plotWidth;
        const norm = (v - min) / span; // 0..1
        const y = mid - (norm - 0.5) * 2 * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }, [waveform, involved, involvedKey]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        className="block w-full"
        aria-label="Stacked EEG channel traces"
      />
    </div>
  );
}
