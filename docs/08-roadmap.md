# 08 — Roadmap

Phased build plan. Each phase has explicit **done when** criteria — a phase
isn't finished because the code exists, but because the criteria hold.

## Sequencing principle

The order is driven by **risk, not by screens**. Two things could invalidate
large amounts of work if discovered late:

1. **The BLE protocol doesn't behave as documented** — especially WH-C06
   manufacturer data on iOS, flagged as the top platform risk in
   [02](02-ble-protocol.md).
2. **60 Hz sustained isn't achievable** through the real pipeline
   ([06](06-non-functional-and-open-source.md)).

Both are settled in Phases 1–2, before any training logic or polished UI is
built on top of them. Conversely, the emulator comes first so that everything
after it can be developed and tested without hardware in hand.

## Phase 0 — Project skeleton

Get a custom dev build running on both physical devices. Nothing else.

- Expo + TypeScript, `expo-dev-client`, EAS Build configured
- Expo Router with the four tabs and empty screens, portrait locked
- Theme tokens from [05](05-design.md); dark only
- ESLint / Prettier / typecheck / Jest wired into GitHub Actions
- `expo-sqlite` opening a database with pragmas set

**Done when:** a dev build installs and launches on a real iPhone *and* a
real Android phone, CI is green on a push, and tab navigation works.

> This phase exists because EAS Build + provisioning is the classic place a
> project stalls for a day. Better to hit it with nothing else in flight.

## Phase 1 — Data layer & emulator

No real hardware yet. Build the substrate everything else is tested against.

- Full schema from [07](07-architecture.md) + migration runner
- Repositories for exercise / session / set / effort / sample / max
- `DeviceSource` interface and `EmulatorDevice` with all five sequences
  (`steady-hang`, `repeaters`, `noisy-pull`, `dropout`, `slow-whc06`)
- Ring buffer + drain loop, wired emulator → buffer → batched insert
- A throwaway debug screen showing live numbers from the emulator

**Done when:** the emulator drives samples through the ring buffer into
SQLite at the expected rate, a 60 s emulated effort produces the expected
row count with no dropped samples, migrations run clean on a fresh install,
and repository tests pass in CI.

## Phase 2 — Real BLE

The riskiest phase. Do it early, on both platforms, with both devices.

- `ProgressorDevice`: connect, discover, notify, `START`/`STOP`, hardware
  tare, battery
- `WHC06Device`: manufacturer-data scanning, software tare, 10 s watchdog
- Byte-fixture parser tests for both ([06](06-non-functional-and-open-source.md))
- Device screen: scan, connect, live readout, tare, battery, **observed
  sample rate**
- Permission handling for every case in [04](04-screens-and-ux.md)
- Android `requestConnectionPriority('High')`

**Done when:** both devices connect and stream on both platforms; Progressor
sustains ≥ 60 Hz with **zero dropped samples** over a 60 s capture;
WH-C06's real advertisement rate is **measured and written into
[02](02-ble-protocol.md)**; iOS manufacturer-data delivery is confirmed or
the risk is escalated with a decision; tare works on both; and readings are
sanity-checked against a known weight.

> If iOS manufacturer data proves unreliable, that's a scope decision
> (Progressor-only on iOS?) and it must be made here — not after the UI is
> built.

## Phase 3 — Metrics & protocol engine

Pure logic. No UI. This is where correctness lives.

- `rollingPeak` (1 s default, window stored), instantaneous peak, mean
- TUT bucketing: in / above / below band, TUT = in + above
- Impulse, fatigue index, asymmetry
- Prescription: % of max → target force, with stale/missing max handling
- Session state machine as a pure reducer, all phases and events
- Protocol presets: max-effort, target-band, repeaters

**Done when:** every metric has tests over known curves; incremental and
final computations agree on all emulator sequences; the machine handles
`DEVICE_LOST` mid-effort correctly in tests; and a full emulated session
runs start-to-finish headlessly, persisting correct efforts and metrics.

## Phase 4 — Live session screen

Now build the screen the whole app exists for.

- Skia `ForceChart`: live ring-buffer rendering, band with open top,
  per-segment zone coloring, latched Y axis
- Live layout: force number, TUT bar, hand indicator, target
- Zone coloring of plot (grey → green → teal), 120 ms eased
- Cues: tone + haptic per event, preloaded
- Full flow: countdown → armed → left → hand swap → right → rest → next set
- `expo-keep-awake`; disconnect overlay with pause/resume/redo

**Done when:** a complete emulated session can be run end-to-end from the
UI without touching the phone between sets; the `dropout` sequence produces
a visible frozen chart and paused clock (never a flatline to zero); the
chart holds 60 fps; and cue-to-threshold latency is under 50 ms.

## Phase 5 — First real workout

Deliberately its own phase. The point is to *use* it, not to build.

- Session setup screen (exercise, protocol, params, computed target force)
- Set summary during rest; session summary; save
- Exercise CRUD with required edge depth
- Bodyweight prompt at session start

**Done when:** the owner completes a **real block-pull workout on real
hardware** — max test both hands, then training sets at a % of that max —
and the stored data is correct on inspection. Findings (band width that
feels right, rest defaults, cue clarity) are written back into the docs.

> This is the first phase that can invalidate spec assumptions — especially
> the tolerance band width, still an open question in
> [03](03-training-and-data-model.md). Expect to change things here.

## Phase 6 — History & progress

- History list, session detail, set detail with both hands overlaid
- Max progression per exercise per hand; kg ↔ %BW toggle
- Asymmetry trend with threshold reference line
- Training load (TUT, impulse) per week
- PB tracking; stale-max warning in setup
- Sparse-data chart handling (one point must render)

**Done when:** several real sessions render correctly across all views, and
the numbers reconcile with the raw data.

## Phase 7 — Export, resilience, release prep

- CSV export (summary + samples), streamed, including smoothing window and
  edge depth
- Full-database export
- Resume-unfinished-session on launch; backgrounding mid-set handled
- Every empty/error state from [04](04-screens-and-ux.md)
- README build instructions verified from a clean clone
- Pre-release hardware checklist written and executed

**Done when:** exported CSV reopens correctly and reconciles with in-app
numbers; killing the app mid-set loses nothing; a fresh clone builds
following only the README; and v1.0.0 is tagged.

## Post-v1 (explicitly deferred)

Listed so they stay out of v1 scope:

- **Critical Force test** — needs plateau detection, CF/W′, "no plateau"
  handling ([03](03-training-and-data-model.md)). `'all_out'` already exists
  in the schema, so no migration needed.
- Abrahangs / submaximal density protocol
- Warm-up guidance flow
- Best-2-of-3 max rule
- Hang modality (separate normalization — must never mix with block pull)
- Light mode; tablet/landscape
- Public store release

## Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| iOS manufacturer data unreliable (WH-C06) | 2 | Resolve before UI work; Progressor-only fallback is acceptable |
| 60 Hz unachievable in practice | 2 | Measure early; surface observed rate in-app; adjust targets in docs |
| Tolerance band feels wrong in real use | 5 | Phase 5 exists to find this; band is configurable |
| Skia performance at 60 fps | 4 | Chart bypasses React state by design ([07](07-architecture.md)) |
| Parser regression corrupting data | 2 onward | Byte fixtures are non-negotiable |
| EAS/provisioning friction | 0 | Front-loaded deliberately |

## What "v1 done" means

Restating [01](01-overview.md)'s success criteria as a checklist:

- [ ] Connects to the force device and streams live readings on a plot
- [ ] Runs max tests and training protocols, both hands
- [ ] Measures time under force only within the target band
- [ ] Logs full workouts of multiple sets
- [ ] Shows history and progression over time
- [ ] Exports data
- [ ] Prescribes training as a percentage of a tested max
