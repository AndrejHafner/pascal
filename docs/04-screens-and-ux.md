# 04 — Screens & UX

## Design premise

Pascal is used **mid-workout, hands chalked, phone on the floor, device
anchored under your feet.** That single fact drives most decisions here:

- The live screen must be readable **at arm's length, glanced at sideways**,
  while you're pulling maximally and not in a position to read small text.
- You should be able to run a whole session **without touching the phone
  between sets** — the app advances itself and cues you with sound and
  haptics.
- Anything requiring fine input (notes, config, editing) happens **before or
  after** a set, never during.

When a UX decision is contested below, the tiebreaker is: _does this work
when you're mid-pull and can't really look at the screen?_

## Screen inventory

| Screen                     | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| **Home / Today**           | Entry point. Device status, start a session, recent activity.          |
| **Device**                 | Scan, connect, battery, tare, live raw readout, emulator toggle (dev). |
| **Exercise list / editor** | Manage exercises (name, grip, edge depth, modality).                   |
| **Session setup**          | Pick exercise + protocol, configure the set structure.                 |
| **Live session**           | The core screen. Runs the whole session: work, rest, hand switching.   |
| **Set summary**            | Immediately after each set — what just happened, per hand.             |
| **Session summary**        | End of workout — totals, asymmetry, notes, save.                       |
| **History (list)**         | All past sessions, chronological.                                      |
| **Session detail**         | Drill into a past session → sets → per-hand force curves.              |
| **Progress**               | Max progression, asymmetry trend, training load over time.             |
| **Settings**               | Bodyweight, units, cue preferences, thresholds, export, about.         |

## Navigation structure

**Bottom tab bar, four tabs**, with the live session presented modally over
the top so it can't be accidentally navigated away from mid-set:

```
Tabs:  [ Today ]  [ History ]  [ Progress ]  [ Settings ]

Today ──► Session setup ──► ┌─────────────────────────┐
                            │  Live session (modal,   │
                            │  full screen, no tabs)  │
                            │    ↓ per set            │
                            │  Set summary (inline)   │
                            └──────────┬──────────────┘
                                       ↓ on finish
                             Session summary ──► saved ──► Today

History ──► Session detail ──► Set detail (force curve)
Progress ──► per-exercise / per-hand detail
Today ──► Device (also reachable from Settings)
```

Launch behavior: open on **Today**. If a session was interrupted (app killed
mid-session), Today shows a "resume unfinished session" card rather than
silently dropping it — consistent with the never-discard-data principle in
[02](02-ble-protocol.md) and [03](03-training-and-data-model.md).

## Live session — the core screen

This screen owns the whole workout, not a single pull. It is a **state
machine** that advances automatically.

### States

```
  ready ──► countdown ──► working ──► inter-hand rest ──► working ──► set rest ──► (next set)
              (3-2-1)     (hand A)      (~5 s)            (hand B)    (~3 min)
                                                                          │
                                                                          ▼
                                                                    session done
```

- **ready** — waiting for you to start the set (big button, or auto-start on
  force threshold — see below).
- **countdown** — 3-2-1 with audio + haptic, so you can build tension and
  start pulling on time without watching.
- **working** — the pull. See layout below.
- **inter-hand rest** — short (default ~5 s per Tyler Nelson's block-pull
  protocol). Just long enough to swap hands. Big "LEFT → RIGHT" indicator.
- **set rest** — the real rest (default 3 min for max work). Countdown,
  what's next, and a skip control.
- **session done** — roll into Session summary.

### Layout during `working`

Priority order, biggest to smallest — the top item must be legible from 2 m:

```
┌────────────────────────────────────────┐
│  SET 2/5          ●  LEFT              │   hand indicator, color-coded
│                                        │
│                                        │
│           32.4 kg                      │   ← current force, huge
│                                        │
│  ┌──────────────────────────────────┐  │
│  │              ░░░░░░░░░░░░░░░░░░░ │  │   ← band overlay (target zone)
│  │      ╱‾‾‾‾‾‾‾‾╲     ╱‾‾‾‾‾‾      │  │   ← live force curve, scrolling
│  │  ___╱          ╲___╱             │  │
│  └──────────────────────────────────┘  │
│                                        │
│        ████████████░░░░░░  7.2s        │   ← TUT progress toward target
│                                        │
│  target 34 kg (80%)         ⏱ 12.0s    │   ← target + elapsed
└────────────────────────────────────────┘
```

**The band is the hero element.** Per [03](03-training-and-data-model.md),
TUT accumulates whenever `force >= target − tolerance`. So the chart shows:

- A shaded **target band** from `target − tolerance` upward. Because
  above-band counts, the band is rendered as a **floor with an open top**,
  not a closed box — visually communicating "get above this line and stay
  there," which is the actual instruction. A lighter secondary tint marks
  the nominal `target ± tolerance` zone so overshoot is still visible
  without implying overshoot is a failure.
- The live force trace over the last ~10 s, scrolling right to left.

**The plot changes color with zone state** — band fill, threshold line, and
the force trace itself all recolor together. This is the single most
important visual affordance, and it's carried by the chart rather than a
full-screen tint so the signal stays attached to the data (and so a dark gym
doesn't get a full-brightness color wash):

| State      | Plot appearance                            | Meaning                     |
| ---------- | ------------------------------------------ | --------------------------- |
| Below band | greyed out / desaturated, thinner trace    | clock stopped, pull harder  |
| In band    | green band + green trace, slightly thicker | clock running, on target    |
| Above band | teal shift of the same green               | clock running, above target |

Only the _live_ portion of the trace recolors — already-drawn history keeps
the color it had when recorded, so the curve doubles as a visual timeline of
when you were in or out of the zone.

Above-band deliberately does **not** turn red or otherwise read as an error —
it's counted as work, and signalling it as failure would contradict the
metric definition. See [05-design.md](05-design.md) for exact tokens.

**TUT bar** fills toward the set's target duration. This, not the elapsed
timer, is the primary progress indicator — elapsed time is secondary because
time spent below the band doesn't count.

### Cues (audio + haptic)

Assume the phone is **not being looked at**. Every state transition is
announced:

- **Countdown:** three ticks + a distinct "go" tone; haptic on each.
- **Entering the band:** a short rising tone + light haptic — confirms the
  clock started without needing to look.
- **Dropping below the band:** a distinct falling tone + sharper haptic.
  This is the most important cue in the app: it's the one telling you to
  pull harder _right now_.
- **TUT target reached:** success tone + strong haptic — "you can let go."
- **Rest ending:** a 3-2-1 countdown cue so you can get set up in time.
- **Hand switch:** spoken or distinctly toned "right hand" cue.

Because Pascal uses **tones only, no speech**, the tones carry the entire
message and must be distinguishable from each other without context —
differentiate by **pitch direction and pattern**, not just pitch:

| Event               | Tone shape                                                 |
| ------------------- | ---------------------------------------------------------- |
| Countdown tick / go | three short ticks, then one longer higher tone             |
| Entered band        | short **rising** two-note                                  |
| Dropped below band  | short **falling** two-note, louder/sharper than the others |
| TUT target reached  | three-note **ascending** flourish                          |
| Hand switch         | distinct double-beep, unlike any single-event cue          |
| Rest ending         | same countdown pattern as set start, so it's learned once  |

Reusing the countdown pattern for both "set starting" and "rest ending" is
deliberate — fewer distinct sounds to learn, and context makes it
unambiguous.

All cues individually toggleable in Settings (sound / haptic / both / off);
some people train in gyms where beeping is antisocial. Haptic-only must be a
fully functional mode — which means each tone above needs a **distinct
haptic pattern** too, not just a generic buzz, since haptic-only users lose
the pitch information entirely.

### Auto-start on force threshold

Requiring a screen tap to start a pull is awkward with chalked hands and a
block in your fist. Default behavior: after the countdown, the set **arms**,
and the work timer starts when force first exceeds a small threshold (e.g.
5 kg) — so the ramp-up is captured but idle time isn't. A manual "start now"
button remains as fallback. Configurable in Settings.

### Screen-on

`expo-keep-awake` is active for the entire live session (all states,
including rest), released on exit. The screen must never sleep mid-set.

### Disconnect handling

Two distinct failure modes, per [02](02-ble-protocol.md):

- **Progressor (connection lost):** immediately overlay a clear
  "Disconnected — reconnecting…" banner, **pause the TUT clock**, and keep
  the samples already captured. Auto-reconnect in the background. If it
  reconnects within the set, offer "resume set" vs "discard and redo" —
  never silently resume, since the gap corrupts TUT.
- **WH-C06 (advertisements stopped):** after the 10 s watchdog, same
  treatment. Because there's nothing to reconnect to, recovery is automatic
  when advertisements resume.

In both cases the set is marked `disconnected` rather than discarded, and
the live chart must visibly **freeze/grey out** rather than flatlining to
zero — a flatline reads as "you stopped pulling," which is a materially
different and misleading claim.

## Connection UX (Device screen)

- **Remembered device, auto-reconnect.** On opening Today or Device, Pascal
  attempts to reconnect to the last-used device automatically. The common
  case must require zero taps.
- **First-time / manual:** scan button → live list of candidates. Progressor
  entries show name + signal; WH-C06 entries are labeled clearly as
  advertisement-based (no pairing), since they behave differently and that
  will otherwise confuse.
- **Connected state** shows: device name, battery (Progressor only — WH-C06
  has no battery characteristic), live raw force readout, and a **Tare**
  button.
- **Tare is prominent.** Hardware tare on Progressor, software baseline on
  WH-C06 (see [02](02-ble-protocol.md)) — but presented identically to the
  user; the distinction is an implementation detail, not a user concept.
- **Emulator toggle** lives here, behind a dev flag, with a sequence picker
  (`steady-hang`, `repeaters`, `noisy-pull`, `dropout`, `slow-whc06`).
  Never visible in a release build unless deliberately enabled.

### Permission handling

BLE permissions differ by platform and are a common first-run failure. The
Device screen must distinguish and give **actionable** copy for: Bluetooth
off, permission denied, permission permanently denied (deep-link to OS
settings), location services off (Android scan requirement), and "scanning,
nothing found yet." A generic "connection failed" is not acceptable.

## Data entry — when it happens

The guiding rule: **nothing is typed while a pull is in progress or
imminent.**

**Before the session** (Session setup screen):

- Exercise (from the user's list — creating one requires name, grip, edge
  depth, modality per [03](03-training-and-data-model.md)).
- Protocol: max-effort test / target-band training / repeaters.
- For training sets: source max (defaults to latest for that exercise +
  hand), target %, tolerance, work duration, rest durations, number of sets.
  Target force in kg is **shown computed** from % × max so the abstract
  percentage is grounded in a real number before starting.
- Added load, if the rig uses any.

**Bodyweight** is captured **per session**, prompted at session start,
pre-filled from the last known value. It's needed for normalization and
changes slowly — a one-tap confirm, not a typing task.

**After each set** (Set summary): optional RPE and a note. Both skippable in
one tap; the session flows on without them.

**After the session** (Session summary): overall notes and tags.

**Stale max warning:** if the chosen source max is older than a
configurable window (e.g. 6 weeks), Session setup shows a gentle
"this max is from 2026-08-01 — retest?" prompt. Training at a percentage of
a stale max is the main way this model silently goes wrong.

## Set summary (immediately after each set)

Appears inline in the live session during the rest period, so the rest time
is used productively and you get feedback while it's relevant:

- Per hand: smoothed peak, TUT achieved vs target, time in/above/below band.
- **Left vs right side by side**, with the difference shown as kg and %.
- The force curve for each hand, small.
- If asymmetry exceeds the configured threshold (default 5%, per
  [03](03-training-and-data-model.md)), a quiet informational note —
  explicitly **not** an alarm, since the evidence for acting on asymmetry is
  weak and Lattice declines to set a threshold at all.
- Rest countdown remains visible and dominant; this is secondary content.

## Session summary

- Totals: sets completed, total TUT, total impulse, per-hand volume.
- Per-exercise max achieved this session, and whether it's a **new PB**
  (celebrated, but quietly — this is a personal tool, not a game).
- Asymmetry summary across the session.
- Notes + tags, then **Save**. Aborted/partial sets are shown as such and
  saved, never dropped.

## History & Session detail

- **History:** reverse-chronological list; each row shows date, exercise(s),
  set count, headline number (max or total TUT). Grouped by month.
- **Session detail:** session metadata → list of sets → tap a set to see
  both hands' force curves overlaid (left/right in distinct colors, with the
  band overlaid) — reusing the same chart component as the live screen, so
  a past set looks exactly like it did live.
- Any set can be viewed, including aborted/disconnected ones, which are
  clearly marked with the reason.

## Progress

- **Max progression** — per exercise, **per hand**, over time. Toggle
  absolute kg ↔ % bodyweight (normalization computed from stored bodyweight
  at test time, per [03](03-training-and-data-model.md)).
- **Asymmetry trend** — L/R difference over time, with the threshold drawn
  as a reference line.
- **Training load** — TUT and impulse per week, per exercise.
- Charts must handle the **sparse-data** case gracefully — one or two data
  points is the normal state early on, and must not render as a broken or
  empty chart.

## Visual states / edge cases

Every list and chart needs three designed states — empty, error, loading —
plus these specific ones:

| Situation                         | Behavior                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No sessions yet                   | Today shows a guided "connect your device → create an exercise → run a max test" first-run path, not an empty list.                                           |
| No exercises defined              | Session setup routes to exercise creation first.                                                                                                              |
| No max recorded for exercise      | Target-band setup is blocked with a clear "run a max test first" CTA — a % of nothing is meaningless.                                                         |
| Max is stale                      | Non-blocking retest suggestion (see above).                                                                                                                   |
| Bluetooth off / permission denied | Specific, actionable copy per case; deep-link to settings where possible.                                                                                     |
| Device not found while scanning   | Distinguish "still scanning" from "nothing found" after a timeout; suggest the device may be asleep (Progressor sleeps).                                      |
| Disconnect mid-set                | Pause clock, freeze chart, offer resume/redo; never flatline to zero.                                                                                         |
| App backgrounded mid-set          | Treat as an interruption: pause, mark the set, offer resume on return. Don't pretend the data is continuous.                                                  |
| App killed mid-session            | Resume card on Today next launch.                                                                                                                             |
| Force reads negative              | Possible on Progressor (sign flips with direction, per [02](02-ble-protocol.md)). Clamp display at 0 and prompt a tare rather than showing a negative number. |
| Battery low (Progressor)          | Passive warning on Device screen and at session start — not mid-set.                                                                                          |

## Accessibility & practical constraints

- **Portrait only**, locked app-wide (`expo-screen-orientation` or the
  equivalent app config). No landscape layouts need to be designed or
  tested, and no rotation can occur mid-set.
- **Dark mode only** — gyms are often dim, and a full white screen at arm's
  length is unpleasant. No light theme in v1; the app does not follow the
  system appearance setting. See [05-design.md](05-design.md).
- Live-screen text must survive being viewed at a steep angle and from ~2 m.
  Large numerics, high contrast, **tabular figures** so the force readout
  doesn't jitter in width as digits change.
- **Never rely on color alone** for zone state — pair every color change
  with the TUT bar moving, a shape/label change, and a sound/haptic. Red/green
  color blindness is common, and the in/out-of-band distinction is the
  app's core signal.
- One-handed reachability: the only controls needed during a session
  (start/skip/abort) sit in the lower third of the screen.

## Resolved decisions

- **Portrait only.** No landscape support. The app locks to portrait
  throughout — this removes a whole class of layout work and mid-set
  rotation edge cases, and the live screen is designed for a phone lying
  flat or propped on the floor where orientation is arbitrary anyway.
- **Tones only, no voice cues.** Simpler, language-neutral, no TTS
  dependency or localization burden. This puts more weight on the tones
  being genuinely distinguishable from each other (see
  [Cues](#cues-audio--haptic)) — the drop-below-band cue in particular must
  be unmistakable without a spoken word to disambiguate it.
- **Set summary shows during rest**, as specified in
  [Set summary](#set-summary-immediately-after-each-set) — rest time is
  otherwise dead time, and per-hand feedback is most useful while the set is
  still fresh.
