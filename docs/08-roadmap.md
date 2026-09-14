# 08 — Roadmap

Phased build plan. Each phase has explicit **done when** criteria — a phase
isn't finished because the code exists, but because the criteria hold.

## Build strategy: emulator-first

**No phase blocks on physical hardware.** Development proceeds entirely
against `EmulatorDevice` ([02](02-ble-protocol.md)), which replays canned
force sequences through the real pipeline. Every phase's "done when"
criteria are verifiable on the emulator alone.

This works because the emulator exercises genuinely everything downstream of
parsing: ring buffer, drain loop, metric math, session state machine,
persistence, charts, cues, and the full UI. That's the large majority of the
app, and it's all testable in CI.

### What the emulator cannot verify

It replays sequences written _from_ the byte layouts in
[02](02-ble-protocol.md) — it never produces real device bytes. So it cannot
confirm:

- That the Progressor packet framing and float parsing are correct
- That the WH-C06 weight offset (bytes 10–11, big-endian, ÷100) is correct
- That 60 Hz is actually sustained over real BLE
- That iOS delivers WH-C06 manufacturer data at all — the top platform risk
  in [02](02-ble-protocol.md)

**If a parser is wrong, every emulator test still passes.** Per
[06](06-non-functional-and-open-source.md), a parser regression is the worst
bug class in this app precisely because it produces plausible-looking
corrupt training data rather than an obvious failure.

Hardware validation is therefore not skipped — it's **deferred to a single
step ([Phase H](#phase-h--hardware-validation-deferred))** that must be
completed before any recorded number is treated as real training data.

### Sequencing

Within that, order is driven by **dependency and risk**: the emulator and
data layer come first so everything after can be built and tested against
them, then pure logic, then UI.

## Phase 0 — Project skeleton

Get a custom dev build running and CI green. Nothing else.

- Expo + TypeScript, `expo-dev-client`, EAS Build configured
- Expo Router with the four tabs and empty screens, portrait locked
- Theme tokens from [05](05-design.md); dark only
- ESLint / Prettier / typecheck / Jest wired into GitHub Actions
- `expo-sqlite` opening a database with pragmas set

**Done when:** the app launches (dev build on an Android phone, or the
simulator/emulator — BLE is not exercised yet, so either is fine), CI is
green on a push, and tab navigation works.

> Android-first: dev builds install as a plain APK with no paid account or
> provisioning. iOS device installs need an Apple Developer account, which
> is deferred along with the rest of the iOS work.

## Phase 1 — Data layer & emulator

Build the substrate everything else is developed and tested against.

- Full schema from [07](07-architecture.md) + migration runner
- Repositories for exercise / session / set / effort / sample / max
- `DeviceSource` interface and `EmulatorDevice` with all five sequences
  (`steady-pull`, `repeaters`, `noisy-pull`, `dropout`, `slow-whc06`)
- Ring buffer + drain loop, wired emulator → buffer → batched insert
- A throwaway debug screen showing live numbers from the emulator

**Done when:** the emulator drives samples through the ring buffer into
SQLite at the expected rate, a 60 s emulated effort produces the expected
row count with no dropped samples, migrations run clean on a fresh install,
and repository tests pass in CI.

**Status: done.** Schema, migrations, all six repositories, `DeviceSource`,
`EmulatorDevice` with all five sequences, ring buffer, drain loop, and the
debug-emulator screen are built and tested — 44 tests, including an
end-to-end emulator→buffer→SQLite pipeline test asserting exact row counts
and zero drops against a real SQLite engine (`better-sqlite3` in tests,
`expo-sqlite` on-device).

One implementation note worth recording: `newId()` originally used
`expo-crypto`'s `randomUUID()`, which silently returns `undefined` under
Jest's native-module auto-mock (no error) — a real trap, since `undefined`
was quietly accepted by some NOT NULL columns before a test caught it.
Switched to the global `crypto.randomUUID()` (Web Crypto, native on Hermes/
RN 0.76+ and in Node/Jest), dropping the `expo-crypto` dependency entirely.

## Phase 2 — BLE implementation

Write the real device classes against the documented protocol. **No hardware
required** — correctness is pinned by byte-level fixture tests, which is the
only automated check that can catch a parser bug anyway.

- `ProgressorDevice`: connect, discover, notify, `START`/`STOP`, hardware
  tare, battery
- `WHC06Device`: manufacturer-data scanning, software tare, 10 s watchdog
- **Byte-fixture parser tests for both** — hand-constructed packets matching
  the layouts in [02](02-ble-protocol.md), asserting exact decoded values.
  Include malformed/truncated packets and non-finite floats.
- Device screen: scan, connect, live readout, tare, battery, **observed
  sample rate**
- Permission handling for every case in [04](04-screens-and-ux.md)
- Android `requestConnectionPriority('High')`

**Done when:** parser fixture tests pass for both devices including edge
cases; the Device screen works end-to-end against `EmulatorDevice`;
permission states render correctly; and the code paths compile and are
reachable on both platforms.

> These tests prove the parsers match **the spec**. Whether the spec matches
> **the hardware** is what [Phase H](#phase-h--hardware-validation-deferred)
> settles. Both are needed; only one needs a device.

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

## Phase 5 — Full session flow

Everything around the live screen needed to run a complete workout.

- Session setup screen (exercise, protocol, params, computed target force)
- Set summary during rest; session summary; save
- Exercise CRUD with required edge depth
- Bodyweight prompt at session start

**Done when:** a complete multi-set session runs start-to-finish on the
emulator — setup → max test both hands → training sets at a % of that max →
summary → saved — and the stored data is correct on inspection.

> Spec assumptions that need _physical_ feel-testing — especially the
> tolerance band width, still open in
> [03](03-training-and-data-model.md) — can only be validated in
> [Phase H](#phase-h--hardware-validation-deferred). Until then the defaults
> are educated guesses.

## Phase 6 — History & progress

- History list, session detail, set detail with both hands overlaid
- Max progression per exercise per hand; kg ↔ %BW toggle
- Asymmetry trend with threshold reference line
- Training load (TUT, impulse) per week
- PB tracking; stale-max warning in setup
- Sparse-data chart handling (one point must render)

**Done when:** several emulated sessions render correctly across all views,
and the numbers reconcile with the raw sample data.

## Phase 7 — Export, resilience, release prep

- CSV export (summary + samples), streamed, including smoothing window and
  edge depth
- Full-database export
- Resume-unfinished-session on launch; backgrounding mid-set handled
- Every empty/error state from [04](04-screens-and-ux.md)
- README build instructions verified from a clean clone

**Done when:** exported CSV reopens correctly and reconciles with in-app
numbers; killing the app mid-set loses nothing; and a fresh clone builds
following only the README.

> **Not yet v1.0.0.** Tagging a release means asserting the numbers are
> trustworthy, which requires [Phase H](#phase-h--hardware-validation-deferred).
> Tag `v0.9.0-emulator` here instead.

## Phase H — Hardware validation (deferred)

**The only phase requiring physical hardware.** Run it whenever a device is
available. Until it passes, the app is feature-complete but its recorded
numbers are **unverified** — usable for exercising the app, not for making
training decisions.

Everything here checks the same thing from different angles: _does the
documented protocol match the actual hardware?_

### Progressor

- Connects, streams, and parses to **plausible kg values**
- **Sanity-check against a known weight** — hang a known mass and confirm
  the reading matches. This is the single most important check in the
  phase; it validates the entire parse chain end-to-end in one step.
- Sustains **≥ 60 Hz with zero dropped samples** over a 60 s capture
- Hardware tare works; battery reads sensibly
- Reconnect after a deliberate out-of-range walk

### WH-C06

- Manufacturer-data scan finds the device and decodes plausible weights
- **Known-weight sanity check** (as above)
- **Measure the real advertisement rate** and write it into
  [02](02-ble-protocol.md) — currently an explicit unknown
- **Confirm iOS delivers manufacturer data during scanning** — the top
  platform risk in [02](02-ble-protocol.md). If it doesn't, decide:
  Progressor-only on iOS, or WH-C06 Android-only.
- 10 s watchdog fires correctly when the device is switched off

### Feel-testing (needs a real pull, not just a real device)

- **Tolerance band width** — the open question in
  [03](03-training-and-data-model.md). Is ±5% punishing or forgiving?
- Cue timing and clarity mid-pull; is the drop-below cue unmistakable?
- Live screen readable at arm's length while actually pulling
- Rest defaults sensible in practice

**Done when:** both devices read correctly against a known weight, the
Progressor sustains 60 Hz, the WH-C06 advertisement rate and iOS behavior
are documented, feel-testing findings are written back into the docs, and
**v1.0.0 is tagged**.

> If reality contradicts [02](02-ble-protocol.md), fix the parser _and_ the
> doc, and add a fixture test reproducing the real bytes — so the regression
> can never return silently.

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

Emulator-first trades _early_ risk discovery for _uninterrupted_ build
progress. The tradeoff is explicit: the hardware risks below stay open
longer than they would have otherwise, and are all retired together in
Phase H.

| Risk                                      | Retired in | Mitigation                                                      |
| ----------------------------------------- | ---------- | --------------------------------------------------------------- |
| **Parser doesn't match real hardware**    | H          | Known-weight check; emulator cannot catch this                  |
| iOS manufacturer data unreliable (WH-C06) | H          | Progressor-only-on-iOS fallback is acceptable                   |
| 60 Hz unachievable in practice            | H          | Observed rate surfaced in-app; adjust targets in docs           |
| Tolerance band feels wrong                | H          | Configurable; defaults are guesses until pulled against         |
| Skia performance at 60 fps                | 4          | Chart bypasses React state by design ([07](07-architecture.md)) |
| Metric math errors                        | 3          | Pure functions, heavily tested; emulator fully covers this      |
| Data loss / migration bugs                | 1, 7       | Forward-only tested migrations; export as escape hatch          |

**The concentration of risk in Phase H is the known cost of this approach.**
Worst realistic case: a parser is wrong, and the fix is confined to a pure
function plus its fixtures — everything downstream is unaffected, because
parsing is isolated from transport by design ([07](07-architecture.md)).
That containment is what makes deferring acceptable.

## What "v1 done" means

Restating [01](01-overview.md)'s success criteria as a checklist:

- [ ] Connects to the force device and streams live readings on a plot
- [ ] Runs max tests and training protocols, both hands
- [ ] Measures time under force only within the target band
- [ ] Logs full workouts of multiple sets
- [ ] Shows history and progression over time
- [ ] Exports data
- [ ] Prescribes training as a percentage of a tested max
- [ ] **Readings verified against a known weight on real hardware** (Phase H)

The last item is what separates `v0.9.0-emulator` from `v1.0.0`. Everything
above it can be demonstrated on the emulator; only the last one can't — and
without it, the numbers the app records are unverified.
