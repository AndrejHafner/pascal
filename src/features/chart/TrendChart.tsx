import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Canvas, Path, Circle, Line, DashPathEffect, Skia } from '@shopify/react-native-skia'
import { computeTrendScale, trendPointToXY, valueToY } from './trendGeometry'
import type { TrendPoint, TrendDimensions } from './trendGeometry'
import { colors, typography } from '../../theme/tokens'

export interface TrendChartProps {
  points: TrendPoint[]
  /** Line/point color — docs/05: "accent for the metric." */
  color?: string
  /** A dashed horizontal reference line (e.g. the asymmetry threshold). */
  referenceValue?: number
  referenceLabel?: string
  /** Formats a value for the point-marker label on a sparse (<=2 point) chart. */
  formatValue?: (value: number) => string
  emptyLabel?: string
}

/**
 * Progression / asymmetry-trend / training-load line chart — see
 * docs/04-screens-and-ux.md "Progress" and docs/05-design.md "Progression
 * charts: line + small point markers... Sparse data is the normal early
 * state. One point renders as a labeled dot, not an empty or broken
 * chart." Distinct from ForceChart (time-within-one-effort, not
 * calendar-time-across-sessions), so it's its own small component rather
 * than overloading ForceChart's live/historical modes with a third shape.
 */
export function TrendChart({
  points,
  color = colors.accent,
  referenceValue,
  referenceLabel,
  formatValue = (v) => v.toFixed(1),
  emptyLabel = 'No data yet',
}: TrendChartProps) {
  const [dimensions, setDimensions] = useState<TrendDimensions>({ width: 0, height: 0 })

  if (points.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    )
  }

  const scale = computeTrendScale(points, referenceValue)
  const referenceY =
    referenceValue !== undefined && dimensions.height > 0
      ? valueToY(referenceValue, scale, dimensions)
      : null

  const coords = points.map((p) => trendPointToXY(p, scale, dimensions))
  const path = Skia.Path.Make()
  if (coords.length > 1) {
    path.moveTo(coords[0].x, coords[0].y)
    for (let i = 1; i < coords.length; i++) path.lineTo(coords[i].x, coords[i].y)
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setDimensions({ width, height })
      }}
    >
      <Canvas style={styles.canvas}>
        {referenceY !== null && (
          <Line
            p1={{ x: 0, y: referenceY }}
            p2={{ x: dimensions.width, y: referenceY }}
            color={colors.warning}
            strokeWidth={1.5}
            opacity={0.6}
          >
            <DashPathEffect intervals={[6, 4]} />
          </Line>
        )}
        {coords.length > 1 && (
          <Path path={path} color={color} style="stroke" strokeWidth={2.5} strokeCap="round" />
        )}
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={4} color={color} />
        ))}
      </Canvas>

      {/* Sparse-data labels — one or two points get their value written
          next to the dot, since a bare dot with no line reads as broken
          rather than "this is genuinely all the data there is yet." */}
      {points.length <= 2 &&
        coords.map((c, i) => (
          <Text
            key={i}
            style={[
              styles.pointLabel,
              {
                left: Math.min(Math.max(c.x - 20, 0), dimensions.width - 40),
                top: Math.max(c.y - 24, 0),
              },
            ]}
          >
            {formatValue(points[i].value)}
          </Text>
        ))}

      {referenceLabel && referenceY !== null && (
        <Text style={[styles.referenceLabel, { top: Math.max(referenceY - 16, 0) }]}>
          {referenceLabel}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { height: 140, position: 'relative' },
  canvas: { flex: 1 },
  emptyContainer: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  emptyText: { ...typography.body, color: colors.textTertiary } as any,
  pointLabel: {
    position: 'absolute',
    ...typography.caption,
    color: colors.textPrimary,
    width: 40,
    textAlign: 'center',
  } as any,
  referenceLabel: {
    position: 'absolute',
    right: 0,
    ...typography.caption,
    color: colors.warning,
  } as any,
})
