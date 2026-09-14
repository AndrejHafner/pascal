// Smoothed peak force — see docs/03-training-and-data-model.md "Defining
// 'max'": raw instantaneous peak is noisy and overstates true max. Max is
// defined as the peak of a rolling-average force curve, default 1s window
// (Labott et al. used 3s tied to a 3s pull; Pascal's 3-5s pulls default to
// 1s so the window doesn't drag in the ramp-up — see docs/03 for the full
// rationale). The window size is always stored alongside the result.

export interface Sample {
  /** ms, relative to effort start. */
  offsetMs: number
  forceKg: number
}

export interface PeakResult {
  /** Peak of the windowed rolling mean. */
  smoothedPeakKg: number
  /** The single highest raw sample — secondary/display only, per docs/03. */
  instantPeakKg: number
  windowMs: number
}

const DEFAULT_WINDOW_MS = 1000

/**
 * Peak of a trailing rolling mean over `windowMs`, computed via a monotonic
 * deque of windowed-sum endpoints — O(n) for the whole effort, per
 * docs/07-architecture.md "Metrics: incremental, then final". Samples need
 * not be evenly spaced; the mean at each point is the time-weighted average
 * force over the trailing window (a plain arithmetic mean of unevenly
 * spaced samples would bias toward whichever region happens to be more
 * densely sampled).
 */
export function computeRollingPeak(
  samples: Sample[],
  windowMs: number = DEFAULT_WINDOW_MS,
): PeakResult {
  if (samples.length === 0) {
    return { smoothedPeakKg: 0, instantPeakKg: 0, windowMs }
  }

  let instantPeakKg = -Infinity
  for (const s of samples) {
    if (s.forceKg > instantPeakKg) instantPeakKg = s.forceKg
  }

  const smoothedPeakKg = maxTrailingWindowMean(samples, windowMs)

  return { smoothedPeakKg, instantPeakKg, windowMs }
}

/**
 * For each sample i, computes the time-weighted mean force over
 * (offsetMs[i] - windowMs, offsetMs[i]], using trapezoidal integration
 * between consecutive samples, and returns the maximum such mean.
 *
 * A monotonic deque isn't a natural fit for *time-weighted* means over
 * irregularly spaced samples (it suits fixed-count windows); instead this
 * uses a sliding-window pointer with a running integral, which is still
 * O(n) overall — each sample enters and leaves the window at most once.
 */
function maxTrailingWindowMean(samples: Sample[], windowMs: number): number {
  if (samples.length === 1) return samples[0].forceKg

  let windowStart = 0
  let runningArea = 0 // integral of force over time within the current window, kg*ms
  let maxMean = -Infinity

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]
    const curr = samples[i]
    const dt = curr.offsetMs - prev.offsetMs
    if (dt > 0) {
      runningArea += ((prev.forceKg + curr.forceKg) / 2) * dt
    }

    const windowLowerBound = curr.offsetMs - windowMs
    while (windowStart < i - 1 && samples[windowStart + 1].offsetMs <= windowLowerBound) {
      const segStart = samples[windowStart]
      const segEnd = samples[windowStart + 1]
      const segDt = segEnd.offsetMs - segStart.offsetMs
      if (segDt > 0) {
        runningArea -= ((segStart.forceKg + segEnd.forceKg) / 2) * segDt
      }
      windowStart++
    }

    const spanMs = curr.offsetMs - samples[windowStart].offsetMs
    if (spanMs > 0) {
      const mean = runningArea / spanMs
      if (mean > maxMean) maxMean = mean
    } else {
      // Degenerate window (single point / zero span so far) — the mean is
      // just the current force.
      if (curr.forceKg > maxMean) maxMean = curr.forceKg
    }
  }

  return maxMean === -Infinity ? samples[0].forceKg : maxMean
}
