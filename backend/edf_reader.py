"""Minimal EDF reader (pure numpy).

Only what the POC needs: read the signal labels and extract a time window of
physical-unit samples for chosen channels. Written by hand because pyedflib has
no wheel for Python 3.14. EDF spec: https://www.edfplus.info/specs/edf.html

This is not a general EDF+ parser. It assumes a plain EDF file (version 0) with
a fixed number of samples per data record, which is what CHB-MIT provides.
"""
from __future__ import annotations

import numpy as np


def _ascii(b: bytes) -> str:
    return b.decode("ascii", "replace").strip()


class Edf:
    def __init__(self, path: str):
        with open(path, "rb") as f:
            header = f.read(256)
            self.n_records = int(_ascii(header[236:244]))
            self.record_duration = float(_ascii(header[244:252]))
            self.n_signals = int(_ascii(header[252:256]))

            ns = self.n_signals
            sig = f.read(ns * 256)
            off = 0

            def field(width: int):
                nonlocal off
                out = [_ascii(sig[off + i * width: off + (i + 1) * width]) for i in range(ns)]
                off += ns * width
                return out

            self.labels = field(16)
            field(80)  # transducer
            self.phys_dim = field(8)
            phys_min = [float(x) for x in field(8)]
            phys_max = [float(x) for x in field(8)]
            dig_min = [float(x) for x in field(8)]
            dig_max = [float(x) for x in field(8)]
            field(80)  # prefiltering
            self.samples_per_record = [int(x) for x in field(8)]

            self.phys_min = np.array(phys_min)
            self.phys_max = np.array(phys_max)
            self.dig_min = np.array(dig_min)
            self.dig_max = np.array(dig_max)
            self.record_size = sum(self.samples_per_record)  # int16 values per record
            self.data_offset = 256 + ns * 256
            self.path = path

        # Per-signal sampling rate (Hz)
        self.fs = [n / self.record_duration for n in self.samples_per_record]

    def read_window(self, start_s: float, end_s: float, channels: list[str] | None = None):
        """Return (fs, {channel_label: np.array of physical values}) for [start_s, end_s)."""
        start_rec = int(start_s // self.record_duration)
        end_rec = min(int(np.ceil(end_s / self.record_duration)), self.n_records)
        start_rec = max(start_rec, 0)

        wanted = channels if channels is not None else self.labels
        # normalize channel matching (labels can have trailing spaces already stripped)
        idx_by_label = {lab: i for i, lab in enumerate(self.labels)}
        sel = [(lab, idx_by_label[lab]) for lab in wanted if lab in idx_by_label]

        # offsets within a record for each signal
        starts = np.cumsum([0] + self.samples_per_record)

        with open(self.path, "rb") as f:
            f.seek(self.data_offset + start_rec * self.record_size * 2)
            n_rec = end_rec - start_rec
            raw = np.frombuffer(f.read(n_rec * self.record_size * 2), dtype="<i2")
        raw = raw.reshape(n_rec, self.record_size)

        out = {}
        for lab, si in sel:
            spr = self.samples_per_record[si]
            seg = raw[:, starts[si]: starts[si] + spr].reshape(-1).astype(np.float64)
            scale = (self.phys_max[si] - self.phys_min[si]) / (self.dig_max[si] - self.dig_min[si])
            phys = (seg - self.dig_min[si]) * scale + self.phys_min[si]
            out[lab] = phys

        # trim to the exact window relative to start_rec
        fs = self.fs[sel[0][1]] if sel else 256.0
        rec0_time = start_rec * self.record_duration
        lo = int(round((start_s - rec0_time) * fs))
        hi = int(round((end_s - rec0_time) * fs))
        out = {k: v[lo:hi] for k, v in out.items()}
        return fs, out
