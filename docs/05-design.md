# 05 — Design

## Visual direction

**Instrument, not app.** Pascal is a measuring tool that happens to have a
training log attached. The visual language should read like lab or audio
equipment — precise, high-contrast, unfussy — rather than like a consumer
fitness app.

Principles, in priority order:

1. **Legibility at distance beats density.** The live screen is read from
   ~2 m at a steep angle while pulling. Numbers get to be enormous; nothing
   competes with them.
2. **Dark only.** Gyms are dim, phones sit on the floor, and a white screen
   at arm's length is unpleasant. There is no light mode.
3. **Calm by default, loud only when it matters.** Almost the entire UI is
   neutral greys. Color is reserved for _state that changes behavior_ —
   overwhelmingly, whether the TUT clock is running.
4. **No gamification.** No streaks, badges, confetti, or motivational copy.
   A PB gets a quiet acknowledgment. This is a personal instrument;
   condescension ages badly when you're the only user.
5. **Data is never decorated.** No gradient fills for their own sake, no
   3D, no drop shadows on charts. Every visual element on a chart must
   encode something.

Reference points: Teenage Engineering / Eurorack panel legibility, Tindeq's
own utilitarian readout, Apple's Workout app for glanceable metric
hierarchy. Explicitly _not_: Strava's social-first styling.

## Color palette

**Dark mode only.** No light mode in v1 — the app is used in dim gyms with
the phone on the floor, a bright screen at arm's length is actively
unpleasant, and supporting one theme halves the visual QA surface. The app
does **not** follow the system appearance setting; it is dark regardless.

Tokens are still defined through a single theme object so a light palette
could be added later without touching components, but no light values are
specified and no component may branch on color scheme.

### Neutrals (the vast majority of the UI)

| Token           | Value     | Use                 |
| --------------- | --------- | ------------------- |
| `bg`            | `#0B0D0E` | App background      |
| `surface`       | `#15191B` | Cards, sheets       |
| `surfaceRaised` | `#1E2325` | Elevated / pressed  |
| `border`        | `#2A3033` | Hairlines, dividers |
| `textPrimary`   | `#F2F4F5` | Numbers, headings   |
| `textSecondary` | `#9BA5A9` | Labels, units       |
| `textTertiary`  | `#616C70` | Hints, disabled     |

### Semantic / state colors

The critical constraint from [04](04-screens-and-ux.md): **above-band must
not read as error.** Above-band is _counted work_. So the palette has no
"too high is bad" color in the live zone model at all.

| Token       | Value     | Meaning                                                                       |
| ----------- | --------- | ----------------------------------------------------------------------------- |
| `zoneBelow` | `#2A3033` | Clock stopped — deliberately colorless/grey                                   |
| `zoneIn`    | `#2FBF71` | In band, clock running                                                        |
| `zoneAbove` | `#39C7A0` | Above band, clock running — a **teal shift of the same green**, not a new hue |
| `accent`    | `#4C9EEB` | Interactive elements, links, selection                                        |
| `warning`   | `#E0A73D` | Stale max, low battery, asymmetry note                                        |
| `danger`    | `#E4574C` | Disconnect, destructive actions, permission errors                            |

`zoneIn` → `zoneAbove` is intentionally a _small_ hue shift along the
green–teal axis. It communicates "still good, but you've drifted up" without
ever crossing into a color that means stop or failure. `danger` is reserved
strictly for things that are actually wrong — disconnects, errors, deletes —
and **never** appears in the zone model.

### Hand colors

Left and right hands need distinct identity everywhere they appear side by
side (live indicator, set summary, overlaid curves, progress charts):

| Token       | Value     |
| ----------- | --------- |
| `handLeft`  | `#7C8CF8` |
| `handRight` | `#F0913E` |

Chosen to be distinguishable under the most common color-vision
deficiencies (blue vs. orange survives deuteranopia and protanopia, unlike
red/green). They are **always** paired with an explicit "L"/"R" label and
differing line style on charts — never color alone.

### Color-blind safety

Per [04](04-screens-and-ux.md)'s no-color-alone rule, every color-encoded
state has at least one redundant channel:

- Zone state → plot color (band + trace) **+** trace thickness **+** TUT bar
  motion **+** distinct tone/haptic **+** a text label ("IN ZONE" / "PULL
  HARDER"). The grey↔green shift is a saturation change, not just a hue
  change, so it survives monochrome vision.
- Hand → color **+** L/R glyph **+** solid vs. dashed line on charts.
- PB / stale / error → color **+** icon **+** text.

Green/teal specifically is a risk pair for some deuteranopes; the
accompanying TUT bar behavior and label are what actually carry the
distinction. That's acceptable because in-band and above-band both mean
"keep going" — confusing them has no training consequence, which is why they
were assigned adjacent hues in the first place.

## Typography

**System fonts.** SF Pro on iOS, Roboto on Android — via React Native's
default stack. No custom font files: they cost bundle size and load time for
a tool whose entire visual job is legibility, which the system faces already
do better than most webfonts at small sizes and steep angles.

**Tabular figures are mandatory** anywhere a number updates live
(`fontVariant: ['tabular-nums']`). A force readout jittering in width at
60 Hz is the single most distracting thing this UI could do.

### Scale

| Role           | Size / weight                        | Notes                                                          |
| -------------- | ------------------------------------ | -------------------------------------------------------------- |
| `displayForce` | 88–104 pt, 600                       | The live force number. Sized to fill available width; tabular. |
| `displayTimer` | 48 pt, 600                           | Rest countdown. Tabular.                                       |
| `metricLarge`  | 32 pt, 600                           | Set summary headline numbers. Tabular.                         |
| `metricMedium` | 22 pt, 500                           | Secondary metrics. Tabular.                                    |
| `title`        | 20 pt, 600                           | Screen titles.                                                 |
| `body`         | 16 pt, 400                           | Default text.                                                  |
| `label`        | 13 pt, 500, +0.5 tracking, uppercase | Metric labels, units, axis ticks.                              |
| `caption`      | 12 pt, 400                           | Hints, timestamps.                                             |

**Units are always typographically subordinate** to their value — `32.4` at
`displayForce` with `kg` at `label` beside it, never the same size. The
number is what's being read at 2 m; the unit is context you already know.

Respect OS dynamic type for body/label text. **The live-screen display
sizes are exempt** — they're already at maximum practical size and scaling
them further breaks the layout; the screen is designed to be legible for
everyone at its fixed size instead.

## Component style

**Plain React Native + a small custom component set.** No Tamagui,
NativeBase, or similar.

Rationale: Pascal has perhaps a dozen distinct UI components, and its most
important screen is a custom Skia canvas that no UI kit helps with. A
component library would add dependency weight, upgrade churn, and its own
theming abstraction for near-zero benefit at this scale. This also keeps the
open-source project easy to build years from now, per
[06](06-non-functional-and-open-source.md).

- **Tokens in one file** (`theme.ts`): colors, spacing, radii, typography.
  No hard-coded hex or magic numbers in components.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48. Nothing off-scale.
- **Radii:** 8 (controls), 12 (cards), 999 (pills). Sparingly — square-ish
  reads more instrument-like.
- **Elevation:** conveyed by `surface`/`surfaceRaised` and hairline borders,
  not shadows. Shadows are near-invisible on dark backgrounds anyway.
- **Touch targets ≥ 44×44 pt**, and session-critical controls (start, skip,
  abort) get considerably more — they're pressed with chalked, tired hands.
- **Buttons:** one filled primary per screen maximum; everything else is
  bordered or plain text. Destructive actions are text + `danger`, never a
  large filled red block that invites a mispress.

## Charts

All charts render through **React Native Skia**, sharing one component
between live and historical views so a saved set looks exactly as it did
live — a deliberate continuity requirement from
[04](04-screens-and-ux.md).

### Live force curve

**The plot itself carries the zone state** — the band and the trace change
color together as you cross the threshold, rather than tinting the whole
screen. The chart is already where your eye rests during a set, and this
keeps the signal attached to the data it describes.

| Zone state                     | Band fill                      | Threshold line    | Force trace               |
| ------------------------------ | ------------------------------ | ----------------- | ------------------------- |
| **Below** (clock stopped)      | `zoneBelow` grey, ~10% opacity | `zoneBelow`, 2 pt | `textTertiary` grey, 3 pt |
| **In band** (clock running)    | `zoneIn` green, ~18% opacity   | `zoneIn`, 2 pt    | `zoneIn` green, 3.5 pt    |
| **Above band** (clock running) | `zoneAbove` teal, ~18% opacity | `zoneAbove`, 2 pt | `zoneAbove` teal, 3.5 pt  |

So the whole plot **desaturates to grey the moment you drop below the
threshold, and lights up green the moment you're working.** The trace
thickening slightly when active is a second, non-color cue.

Only the _live_ portion of the trace recolors — the trailing history keeps
the color it had when it was recorded, so a glance at the curve shows where
in the pull you were in or out of the zone. The curve becomes its own
in-zone timeline.

- **Line:** 3 pt (3.5 pt when in/above band), round caps, colored per the
  table above. No fill under the curve — a fill fights with the band
  shading, which is the more important encoding.
- **Band:** renders as a **shaded region from `target − tolerance` upward to
  the top of the plot**, with a **solid 2 pt line at the lower bound** — the
  threshold line is the actual instruction ("stay above this"), so it gets
  the strongest treatment. The nominal target sits inside it as a 1 pt
  dashed line at ~40% opacity.
- **Window:** trailing ~10 s, scrolling right-to-left, newest at the right
  edge.
- **Y axis:** auto-scales to `max(peak so far, target + tolerance) × 1.15`,
  and **never rescales downward mid-set** — a shrinking axis makes a
  consistent pull look like it's climbing, which is actively misleading.
- **Axis chrome is minimal:** no gridlines; two or three Y labels at
  `label` size in `textTertiary`; no X labels at all (the window duration is
  fixed and stated once).
- **Frozen state:** on disconnect the trace greys to `textTertiary` and a
  hatched overlay covers the gap region. It must never draw a line to zero.

### Historical / review charts

- Same component, full set duration instead of a rolling window.
- **Both hands overlaid** — `handLeft` solid, `handRight` dashed — with the
  band shown behind both.
- Progression charts: line + small point markers (points matter when there
  are only three sessions of data), `accent` for the metric, `warning`
  dashed horizontal line for a threshold reference (e.g. asymmetry).
- **Sparse data is the normal early state.** One point renders as a labeled
  dot, not an empty or broken chart.

### Animation

- The live trace is **not animated** — it's redrawn from the buffer each
  frame. Interpolation would be a lie about measured data.
- Zone color transitions (band fill, trace color) get a **120 ms ease** so
  the plot doesn't strobe on a value hovering at the threshold. This is the
  one place smoothing is correct: it smooths the _presentation_, never the
  data. The trace's _position_ is never eased — only its color.
- Screen transitions use platform defaults. No custom choreography.

## Iconography / branding

- **Icons:** a single open-source set, used consistently — Lucide
  (`lucide-react-native`) as the default. Line icons at 1.5–2 pt match the
  instrument feel better than filled glyphs.
- **Name:** Pascal — the SI unit of pressure. The wordmark is simply the
  name set in the system font, medium weight, generous tracking. No custom
  lettering.
- **App icon:** deferred for v1 — a placeholder mark (monogram "Pa" or a
  simple force-curve glyph on `bg`) is sufficient. Worth noting the pun is
  available if wanted: "Pa" is both the unit symbol and the first two
  letters of the name.
- **No mascot, no illustration.** Empty states use a short line of text and
  a relevant action, not a drawing.

## Resolved decisions

- **Dark mode only for v1.** No light palette, no system-appearance
  following.
- **Zone state is carried by the plot** (band fill + trace color +
  trace weight), not by a full-screen background tint — greying out below
  the threshold and lighting up green when working. Keeps the signal
  attached to the data, and avoids a full-brightness color wash in a dark
  gym.
