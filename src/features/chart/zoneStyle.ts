// Zone -> visual style mapping, transcribed exactly from docs/05-design.md
// "Live force curve" table. Kept as data, not scattered through the chart
// component, so the design table and the code stay obviously in sync.

import type { Zone } from '../../core/metrics/zone'
import { colors } from '../../theme/tokens'

export interface ZoneStyle {
  bandFillColor: string
  bandFillOpacity: number
  thresholdLineColor: string
  thresholdLineWidth: number
  traceColor: string
  traceWidth: number
}

const ZONE_STYLES: Record<Zone, ZoneStyle> = {
  below: {
    bandFillColor: colors.zoneBelow,
    bandFillOpacity: 0.1,
    thresholdLineColor: colors.zoneBelow,
    thresholdLineWidth: 2,
    traceColor: colors.textTertiary,
    traceWidth: 3,
  },
  in: {
    bandFillColor: colors.zoneIn,
    bandFillOpacity: 0.18,
    thresholdLineColor: colors.zoneIn,
    thresholdLineWidth: 2,
    traceColor: colors.zoneIn,
    traceWidth: 3.5,
  },
  above: {
    bandFillColor: colors.zoneAbove,
    bandFillOpacity: 0.18,
    thresholdLineColor: colors.zoneAbove,
    thresholdLineWidth: 2,
    traceColor: colors.zoneAbove,
    traceWidth: 3.5,
  },
}

export function styleForZone(zone: Zone): ZoneStyle {
  return ZONE_STYLES[zone]
}
