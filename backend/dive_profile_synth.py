"""
Synthetic dive-profile generator.

Used by:
- seed.py (one-time backfill for legacy dives without a profile)
- routes/dev.py (admin endpoint to stamp a profile on any dive)
- routes/content.py (auto-stamp on manual `POST /dive-log` when no profile is supplied)

The generated shape matches the real dive-computer import shape (`profile` is a
list of `{time_seconds: int, depth: float}` points). The decompression analyser
at `routes/dive_advanced.py` consumes the same shape.
"""
from __future__ import annotations

import random
from typing import List, Dict, Any, Optional


def generate_synthetic_profile(
    max_depth: float,
    duration_minutes: float,
    *,
    seed: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Build a descent / bottom / safety-stop / ascent profile.

    Args:
        max_depth: deepest point of the dive, in metres (positive number).
        duration_minutes: total dive time, in minutes.
        seed: optional integer for deterministic bottom-segment noise.

    Returns:
        A list of `{time_seconds: int, depth: float}` points. Empty list if
        the dive is too short to model (`duration_minutes < 4` or
        `max_depth < 3`).
    """
    if max_depth is None or duration_minutes is None:
        return []
    if max_depth < 3 or duration_minutes < 4:
        return []

    rng = random.Random(seed if seed is not None else hash((round(max_depth, 1), round(duration_minutes, 1))))
    total_s = int(duration_minutes * 60)
    max_d = float(max_depth)

    # Segment boundaries (in seconds)
    descent_end = int(total_s * 0.15)
    bottom_end = int(total_s * 0.75)
    ascent_to_safety_end = int(total_s * 0.92)
    safety_stop_seconds = 180  # 3-minute safety stop
    safety_depth = 5.0

    points: List[Dict[str, Any]] = []

    # Descent: 0 → max_depth, 7 evenly spaced points
    for i in range(7):
        t = int(descent_end * i / 6)
        d = round(max_d * (i / 6), 2)
        points.append({"time_seconds": t, "depth": d})

    # Bottom: oscillate between (max_d - 2) and max_d, 24 points with ±0.3 m noise
    bottom_points = 24
    for i in range(1, bottom_points + 1):
        t = int(descent_end + (bottom_end - descent_end) * i / bottom_points)
        base = max_d - (1.0 + (0.5 * (1 + (-1) ** i)))  # gentle oscillation
        noise = rng.uniform(-0.3, 0.3)
        d = round(max(0.0, base + noise), 2)
        points.append({"time_seconds": t, "depth": d})

    # Ascent to 5 m safety-stop depth, 6 points
    for i in range(1, 7):
        t = int(bottom_end + (ascent_to_safety_end - bottom_end) * i / 6)
        # linear from (max_d - 2) down to safety_depth
        d = round((max_d - 2.0) + (safety_depth - (max_d - 2.0)) * (i / 6), 2)
        points.append({"time_seconds": t, "depth": d})

    # Safety stop (only if the remaining time allows for it + a surfacing leg)
    surface_leg_seconds = total_s - ascent_to_safety_end
    if surface_leg_seconds > safety_stop_seconds + 20:
        # 6 points at safety stop with tiny depth jitter
        for i in range(1, 7):
            t = int(ascent_to_safety_end + safety_stop_seconds * i / 6)
            d = round(safety_depth + rng.uniform(-0.15, 0.15), 2)
            points.append({"time_seconds": t, "depth": d})
        # Final ascent from 5 m → 0 m, 4 points
        final_start = ascent_to_safety_end + safety_stop_seconds
        for i in range(1, 5):
            t = int(final_start + (total_s - final_start) * i / 4)
            d = round(safety_depth * (1 - i / 4), 2)
            points.append({"time_seconds": t, "depth": d})
    else:
        # Short-dive fallback: direct ascent to surface, 4 points
        for i in range(1, 5):
            t = int(ascent_to_safety_end + (total_s - ascent_to_safety_end) * i / 4)
            d = round(safety_depth * (1 - i / 4), 2)
            points.append({"time_seconds": t, "depth": d})

    # Guarantee strictly increasing time and a final surface point
    points.sort(key=lambda p: p["time_seconds"])
    if points and points[-1]["depth"] > 0.1:
        points.append({"time_seconds": total_s, "depth": 0.0})
    return points
