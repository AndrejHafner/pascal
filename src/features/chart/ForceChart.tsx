import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Canvas, Path, Rect, Line, Group, DashPathEffect, Skia } from '@shopify/react-native-skia'
import type { SkPath } from '@shopify/react-native-skia'
import type { RingBuffer } from '../../core/ringBuffer'
import type { Band } from '../../core/metrics/band'
import { classifyZone, type Zone } from '../../core/metrics/zone'
import { styleForZone } from './zoneStyle'
import {
  computeLatchedYScale,
  forceToY,
  buildTraceSegments,
  windowedSamples,
} from './chartGeometry'
import type { ChartSample, ChartDimensions, YScale } from './chartGeometry'
import { colors } from '../../theme/tokens'

const TRAILING_WINDOW_MS = 10_000
/**
 * Throttled to ~30fps rather than every animation frame (~60fps) — see
 * docs/07-architecture.md "Charts": the requirement is that the chart
 * itself HOLDS 60fps (nothing blocks the UI thread), not that React
 * re-renders 60 times a second. Skia's own lightweight reconciler (not
 * React DOM) does the actual native drawing from these props, so a state
 * update here is far cheaper than a typical React re-render — but there's
 * still no reason to commit more often than the eye can distinguish.
 * See docs/08-roadmap.md Phase 4 for the "installed Skia version has no
 * useFrameCallback" note this throttled-state approach resolves.
 */
const FRAME_INTERVAL_MS = 1000 / 30

interface DrawSegment {
  path: SkPath
  color: string
  strokeWidth: number
}

interface DrawState {
  segments: DrawSegment[]
  bandLowerY: number | null
  bandTargetY: number | null
  currentZone: Zone | null
  latchedMaxKg: number
}

const EMPTY_DRAW_STATE: DrawState = {
  segments: [],
  bandLowerY: null,
  bandTargetY: null,
  currentZone: null,
  latchedMaxKg: 0,
}

export interface ForceChartProps {
  /** Live mode: reads samples off this buffer every frame. Omit for historical mode. */
  liveBuffer?: RingBuffer
  /** Historical mode: a fixed, already-complete sample array, full duration, no scrolling. */
  historicalSamples?: ChartSample[]
  band: Band | null
  /** Called at the throttled frame rate in live mode with the current instantaneous force/zone. */
  onLiveSample?: (forceKg: number, zone: Zone) => void
  /** Live mode only: true freezes the trace in place rather than advancing — see docs/04 "Disconnect handling". */
  frozen?: boolean
}

/**
 * The one chart component shared between the live session and historical
 * review — see docs/07-architecture.md "Charts": "used live and
 * historically... so a saved set looks exactly as it did live."
 *
 * Live mode reads the ring buffer directly on a requestAnimationFrame loop
 * and commits to React state at a throttled ~30fps (see FRAME_INTERVAL_MS
 * above for why this satisfies docs/07's "never re-renders via React
 * state" performance intent despite going through setState — the installed
 * Skia version's animation model differs from what doc 07 originally
 * assumed).
 */
export function ForceChart({
  liveBuffer,
  historicalSamples,
  band,
  onLiveSample,
  frozen = false,
}: ForceChartProps) {
  const [dimensions, setDimensions] = useState<ChartDimensions>({ width: 0, height: 0 })
  const [drawState, setDrawState] = useState<DrawState>(EMPTY_DRAW_STATE)

  const latchedMaxKgRef = useRef(0)
  const historyRef = useRef<ChartSample[]>([])
  const forceOutRef = useRef(new Float32Array(4096))
  const offsetOutRef = useRef(new Uint32Array(4096))
  const rafRef = useRef<number | null>(null)
  const lastCommitRef = useRef(0)

  useEffect(() => {
    if (!liveBuffer || dimensions.width === 0 || dimensions.height === 0) return

    // Reset latched scale / accumulated history for the new effort. No
    // setDrawState call needed here: historyRef is now empty, so the very
    // first tick() below computes an empty DrawState naturally via
    // computeDrawState's own empty-samples guard — an explicit reset would
    // just be a redundant setState call one frame ahead of the real one.
    latchedMaxKgRef.current = 0
    historyRef.current = []

    function tick(now: number) {
      if (!frozen) {
        const result = liveBuffer!.peekLatest(4096, forceOutRef.current, offsetOutRef.current)
        if (result.length > 0) {
          const newHistory: ChartSample[] = []
          for (let i = 0; i < result.length; i++) {
            newHistory.push({ offsetMs: result.offsetMs[i], forceKg: result.forceKg[i] })
          }
          historyRef.current = newHistory
        }
      }

      if (now - lastCommitRef.current >= FRAME_INTERVAL_MS) {
        lastCommitRef.current = now
        const next = computeDrawState(
          historyRef.current,
          band,
          dimensions,
          latchedMaxKgRef.current,
          true,
        )
        latchedMaxKgRef.current = next.latchedMaxKg
        setDrawState(next)

        if (!frozen && historyRef.current.length > 0) {
          const latest = historyRef.current[historyRef.current.length - 1]
          const zone = band ? classifyZone(latest.forceKg, band) : 'below'
          onLiveSample?.(latest.forceKg, zone)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBuffer, dimensions.width, dimensions.height, frozen, band])

  // Historical mode: one static computation, no animation loop, no latched
  // ref needed (there's no "growing during a live set" to preserve — the
  // full duration is known upfront, so the scale starts fresh at 0 each time).
  const historicalDrawState = useMemo(() => {
    if (liveBuffer || !historicalSamples) return null
    return computeDrawState(historicalSamples, band, dimensions, 0, false)
  }, [liveBuffer, historicalSamples, band, dimensions])

  const active = liveBuffer ? drawState : (historicalDrawState ?? EMPTY_DRAW_STATE)
  const bandStyle = styleForZone(frozen ? 'below' : (active.currentZone ?? 'below'))

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setDimensions({ width, height })
      }}
    >
      <Canvas style={styles.canvas}>
        {active.bandLowerY !== null && active.bandTargetY !== null && (
          <Group>
            <Rect
              x={0}
              y={active.bandLowerY}
              width={dimensions.width}
              height={Math.max(0, dimensions.height - active.bandLowerY)}
              color={bandStyle.bandFillColor}
              opacity={bandStyle.bandFillOpacity}
            />
            <Line
              p1={{ x: 0, y: active.bandLowerY }}
              p2={{ x: dimensions.width, y: active.bandLowerY }}
              color={bandStyle.thresholdLineColor}
              strokeWidth={bandStyle.thresholdLineWidth}
            />
            <Line
              p1={{ x: 0, y: active.bandTargetY }}
              p2={{ x: dimensions.width, y: active.bandTargetY }}
              color={bandStyle.thresholdLineColor}
              strokeWidth={1}
              opacity={0.4}
            >
              <DashPathEffect intervals={[6, 4]} />
            </Line>
          </Group>
        )}

        {active.segments.map((segment, i) => (
          <Path
            key={i}
            path={segment.path}
            color={segment.color}
            style="stroke"
            strokeWidth={segment.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}

        {frozen && dimensions.width > 0 && (
          <Rect
            x={0}
            y={0}
            width={dimensions.width}
            height={dimensions.height}
            color={colors.textTertiary}
            opacity={0.15}
          />
        )}
      </Canvas>
    </View>
  )
}

function computeDrawState(
  samples: ChartSample[],
  band: Band | null,
  dimensions: ChartDimensions,
  previousLatchedMaxKg: number,
  isLive: boolean,
): DrawState {
  if (samples.length === 0 || dimensions.width === 0) {
    return { ...EMPTY_DRAW_STATE, latchedMaxKg: previousLatchedMaxKg }
  }

  const nowOffsetMs = samples[samples.length - 1].offsetMs
  const windowMs = isLive ? TRAILING_WINDOW_MS : Math.max(1, nowOffsetMs)
  const windowed = isLive ? windowedSamples(samples, nowOffsetMs, windowMs) : samples
  const windowStartMs = isLive ? nowOffsetMs - windowMs : 0

  const peakSoFarKg = windowed.reduce((max, s) => Math.max(max, s.forceKg), 0)
  const scale: YScale = computeLatchedYScale(peakSoFarKg, band, previousLatchedMaxKg)

  const currentZone = band ? classifyZone(windowed[windowed.length - 1].forceKg, band) : null

  if (!band) {
    const points = windowed.map((s) => ({
      x: ((s.offsetMs - windowStartMs) / windowMs) * dimensions.width,
      y: forceToY(s.forceKg, scale, dimensions),
    }))
    return {
      segments: [{ path: pointsToSkPath(points), color: colors.textPrimary, strokeWidth: 3 }],
      bandLowerY: null,
      bandTargetY: null,
      currentZone: null,
      latchedMaxKg: scale.maxKg,
    }
  }

  const rawSegments = buildTraceSegments(windowed, band, windowStartMs, windowMs, scale, dimensions)
  const segments: DrawSegment[] = rawSegments.map((seg) => {
    const style = styleForZone(seg.zone)
    return {
      path: pointsToSkPath(seg.points),
      color: style.traceColor,
      strokeWidth: style.traceWidth,
    }
  })

  return {
    segments,
    bandLowerY: forceToY(band.targetKg - band.toleranceKg, scale, dimensions),
    bandTargetY: forceToY(band.targetKg, scale, dimensions),
    currentZone,
    latchedMaxKg: scale.maxKg,
  }
}

function pointsToSkPath(points: { x: number; y: number }[]): SkPath {
  const path = Skia.Path.Make()
  if (points.length === 0) return path
  path.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i].x, points[i].y)
  }
  return path
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 160 },
  canvas: { flex: 1 },
})
