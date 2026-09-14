// Dark mode only — see docs/05-design.md. No light palette, no system-appearance
// following. Do not branch on color scheme anywhere in the app.

export const colors = {
  bg: '#0B0D0E',
  surface: '#15191B',
  surfaceRaised: '#1E2325',
  border: '#2A3033',

  textPrimary: '#F2F4F5',
  textSecondary: '#9BA5A9',
  textTertiary: '#616C70',

  // Zone state — see docs/05-design.md "Color palette". zoneAbove is a small
  // teal shift of zoneIn, not a new hue: above-band still counts as work and
  // must never read as an error.
  zoneBelow: '#2A3033',
  zoneIn: '#2FBF71',
  zoneAbove: '#39C7A0',

  accent: '#4C9EEB',
  warning: '#E0A73D',
  danger: '#E4574C',

  // Always paired with an L/R label and differing line style — never color
  // alone. Blue/orange survives deuteranopia and protanopia.
  handLeft: '#7C8CF8',
  handRight: '#F0913E',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const radii = {
  control: 8,
  card: 12,
  pill: 999,
} as const

// Tabular figures are mandatory anywhere a number updates live — see
// docs/05-design.md "Typography". A jittering-width readout at 60 Hz is the
// single most distracting thing this UI could do.
export const typography = {
  displayForce: { fontSize: 96, fontWeight: '600', fontVariant: ['tabular-nums'] },
  displayTimer: { fontSize: 48, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metricLarge: { fontSize: 32, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metricMedium: { fontSize: 22, fontWeight: '500', fontVariant: ['tabular-nums'] },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const

export const theme = { colors, spacing, radii, typography } as const

export type Theme = typeof theme
