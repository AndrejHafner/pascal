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

**Status: done.** `ProgressorDevice` and `WHC06Device` implement
`DeviceSource` over `react-native-ble-plx`; byte-fixture parser tests cover
both devices' happy paths, malformed/truncated packets, and non-finite
floats; permission-state UI logic is pure and fully tested; a Device screen
reaches every real device class's connect/tare/sample/battery path and the
`EmulatorDevice` picker. 103 tests total.

Two real bugs the tests caught in `WHC06Device`, both would have silently
corrupted every reading on real hardware:

1. **Tare was firing on the very first sample ever received**, before
   `tare()` was ever called — every untared reading would have read as an
   offset from an arbitrary first sample rather than the true raw value.
   Fixed: tare now only captures a baseline after an explicit `tare()` call.
2. **The 2-byte manufacturer company-id prefix was never stripped** before
   handing bytes to the weight-field parser, shifting every read by 2 bytes
   from where docs/02's offset 10-11 actually falls once the id is removed.
   Fixed: the id is checked and stripped before parsing.

Both were caught by fixture tests using realistically-shaped scan data
(prefix + payload), not idealized inputs — a reminder that a fixture too
close to what the code already assumes won't catch an assumption baked into
the code itself.

Also flagged, not yet resolved: whether `react-native-ble-plx`'s
`manufacturerData` field actually includes that 2-byte prefix on real
hardware is unconfirmed (the ble-plx types only say "format defined by
manufacturer") — an explicit ASSUMPTION comment sits at the strip site, and
this is now a named check in [Phase H](#phase-h--hardware-validation-deferred).
Android location-services detection (the `location_services_off` UI branch)
is implemented and tested in the pure logic but not yet wired to a real
native check — deferred to Phase 4/5, tracked in a code comment.

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

**Status: done.** `rollingPeak` (trailing time-weighted windowed mean, not
a naive arithmetic mean — correct for the unevenly-spaced samples the real
pipeline produces), `tut` (in/above/below bucketing with the exact
`[target-tolerance, target+tolerance]` boundary semantics, TUT = in +
above), `impulse`, `fatigueIndex`, and `asymmetry` are all pure functions
with incremental/final agreement tests. `prescribeTargetForce` handles
`no_max` and stale-max (6-week default, per docs/04) as real, typed
outcomes rather than edge cases bolted on. The session machine implements
every phase and event from docs/07 exactly, including that `DEVICE_RESTORED`
after a mid-working loss returns to `armed`, never directly to `working` —
per docs/04's "never silently resume, since the gap corrupts TUT." 141 new
tests, including a headless integration test that drives a real
`EmulatorDevice` sequence through the state machine and the metrics
functions into real SQLite via the actual repositories, then asserts on
what actually landed in the database.

Two gaps were caught in review before any test ran — worth recording
because they're exactly the kind of bug a narrower, transition-at-a-time
test suite would have missed entirely:

1. The first draft's `TICK` handler didn't include `'working'` among its
   timed phases at all — work duration elapsing had no effect, so a set
   would stay in `working` forever once armed.
2. There was no path from `working` to `setRest`, only to `interHandRest`
   — a session would loop the same two hands forever and never advance to
   the next set or reach `done`.

Fixed by adding `finishWorking()`, the shared exit path from `working` that
checks whether the finishing hand was the last one in `plan.hands` and
routes to `setRest` instead of `interHandRest` when it was. The lesson
carried into the test suite: the full-session integration test (driving a
real `EmulatorDevice` sequence through the whole machine to `done`) is what
would have caught this if it hadn't been — per-transition unit tests can
all pass while the transitions still don't compose into a working whole,
which is why that end-to-end test is treated as load-bearing, not optional
polish.

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

**Status: built, unverified on-device.** `ForceChart`, the cue service, the
session-runner effect layer, and `app/session/live.tsx` are all in place
and exercised by 259 passing tests (up from 189 after Phase 3), including a
hook-level integration test driving `useSessionRunner` through countdown →
armed → working → interrupted → resumed with real assertions on persisted
effort status. `expo-keep-awake` is wired in; the disconnect overlay offers
resume/discard per docs/04. The 60fps and <50ms latency criteria are
**not measured** — they require a running device and are exactly what
[Phase H](#phase-h--hardware-validation-deferred) exists to check;
recorded here as unverified rather than assumed passing.

One deliberate divergence from doc 07's original design, discovered while
implementing: the installed Skia version (2.6.2) has no `useFrameCallback`
— that hook belonged to an older Skia API and this version's live-animation
model expects either React state driving its JSX props (its own
lightweight reconciler does the native draw, not React DOM) or a
Reanimated shared-value integration this project doesn't otherwise need.
`ForceChart` uses `requestAnimationFrame` reading the ring buffer directly,
committed to React state at a throttled ~30fps rather than every frame —
satisfying docs/07's actual performance intent (don't block the UI thread
on 60Hz updates) through a different mechanism than the hook name it
originally specified.

Cue audio is a known, deliberate gap: `expo-audio` needs real audio file
assets (`require('./tone.mp3')`), not runtime-synthesized tones, and Pascal
has none yet. `CuePlayer` is fully wired for audio (`playTone` is a no-op
pending real assets) with haptics completely real today — satisfying
docs/04's "haptic-only must be a fully functional mode" as an actual
requirement, not a fallback. Real tone assets are a follow-up, not blocking
any roadmap phase.

Two real bugs the tests caught, both would have corrupted real data:

1. **`useSessionRunner` stamped every sample's `offsetMs` from
   `Date.now()`**, which only has millisecond resolution — a Progressor
   notification batches several samples at once (per docs/02), so multiple
   samples landing in the same JS tick collided on the `sample` table's
   `(effort_id, offset_ms)` primary key and threw. Fixed: prefer the
   device's own `deviceTimestampMs` when present, else a monotonic
   per-effort counter — never a raw wall-clock read for ordering.
2. A hook test combining `useSessionRunner`'s real `setInterval`-driven
   TICK with `@testing-library/react-native`'s real-timer `waitFor` polling
   hung indefinitely (two independent real-time sources racing, never both
   settling). Fixed by switching the test to fake timers with explicit
   `jest.advanceTimersByTime` — a reminder that a hook wrapping a real
   timer needs its tests to control time deterministically, not just await
   real elapsed time and hope.

Also required a testing-library version pin: `@testing-library/react-native@14.x`
expects a `createRoot` API that `react-test-renderer@19.2.3` (the version
this Expo SDK bundles) doesn't export — pinned to `13.3.3`, which targets
the classic `create()` API and works correctly with this React/RN version
pairing.

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

**Status: done.** Session setup builds a multi-step `SessionPlan` (add a
max-effort test, then a target-band step that can prescribe off that exact
step's just-recorded max or off the latest DB max), persisted to a new
`session_plan` table (migration 0002) before the live screen even opens —
which also gives "resume unfinished session" (docs/04) real teeth: the
plan and progress through it survive an app kill, not just individual
`TrainingSet` rows. Exercise CRUD (create + list; required edge depth
enforced) exists at `/exercise`. Bodyweight is prompted at setup,
pre-filled from the last session. Set summary shows left/right side by
side during the between-set pause; Session summary shows totals, per-hand
max, asymmetry, and a notes field before Save. 284 tests total (95 new
this phase), including an end-to-end data-correctness test that runs the
exact doc scenario — 3 max attempts, both hands → best-attempt selection →
`MaxRecord` → a target-band step prescribed at 80% of that specific
session's fresh max (not any stale DB value) → 3 training sets created
with that target baked in → session saved — and asserts on what actually
lands in the database.

One real architectural correction, caught before any test ran: the first
design had `useStepRunner` call `useSessionRunner` directly to run each
set. That's broken — `useSessionRunner`'s machine state is created once via
`useState`'s lazy initializer and does not reset when its config prop
changes, so the same hook instance would carry `phase: 'done'` from
attempt 1 straight into attempt 2 and never restart. Fixed by inverting
the ownership: `useStepRunner` only sequences `TrainingSet` creation and
exposes `activeSet` config; the caller (`app/session/live.tsx`) mounts a
`LiveSetRunner` component **keyed by `trainingSetId`**, so React's own
remount-on-key-change gives each set a genuinely fresh runner instance.
The same note is recorded in both files' doc comments so it isn't
rediscovered.

Deliberately scoped out, not silently dropped:

- **Repeaters** have a defined preset (`presets.ts`, docs/03) but aren't
  wired into `SessionStep`/the live runner. Setup only builds max-effort
  and target-band steps.
- **One shared band drives both hands** in a target-band step — resolved
  from the left hand's prescription. Docs/03 doesn't specify per-hand
  target bands, so this isn't a gap against the spec, but it's a real
  simplification: an asymmetric session-step max (e.g. left 38kg, right
  41kg) prescribes one target off the left value for both hands' live
  zone/TUT feedback, even though each hand's actual result is still
  compared independently at summary time.
- **Exercise edit/delete** don't exist yet — create and list only.
- Session setup has no "warm-up" guidance flow (post-v1 per docs/08).

## Phase 6 — History & progress

- History list, session detail, set detail with both hands overlaid
- Max progression per exercise per hand; kg ↔ %BW toggle
- Asymmetry trend with threshold reference line
- Training load (TUT, impulse) per week
- PB tracking; stale-max warning in setup
- Sparse-data chart handling (one point must render)

**Done when:** several emulated sessions render correctly across all views,
and the numbers reconcile with the raw sample data.

**Status: done.** History lists sessions grouped by month (date, exercise
names, set count, headline number — session peak force if any effort
completed, else total TUT), reverse-chronological with `LIMIT`/`OFFSET`
paging. Session detail lists sets with both hands' status (aborted/
disconnected efforts are labeled, not hidden). Set detail overlays both
hands' force curves on the SAME `ForceChart` used live — a new
`secondaryHistoricalSamples` prop draws the second hand as a plain
fixed-color trace sharing the primary series' Y-scale (so a stronger
second hand can't clip off-chart) and X-window (so both hands share
identical axes even if one effort ran longer), styled per docs/05 as
`handLeft` solid / `handRight` dashed — a `DashPathEffect` addition to
`DrawSegment` that the live screen doesn't otherwise use.

Progress is an exercise picker → per-exercise detail with four charts, all
built on a new `TrendChart` component (`trendGeometry.ts`, unit-tested
separately from `ForceChart`'s time-within-one-effort geometry, since a
calendar-time-across-sessions axis is a genuinely different shape):
max progression per hand with a kg ↔ %BW toggle (normalized against each
`MaxRecord`'s own stored `bodyweightKgAtTest`, never today's weight — a
past point must not silently reshape when the climber's weight changes),
asymmetry trend (left/right `MaxRecord`s paired by nearest-in-time match
within 24h, since the two hands' maxes are independent rows with no
structural 1:1 link — see `pairForAsymmetryTrend`) with the 5% threshold
drawn as a dashed reference line, and weekly TUT/impulse training load
(bucketed in JS, not SQL, since SQLite's date functions assume Unix
seconds while this schema stores epoch ms throughout). Sparse data (one or
two points) renders as labeled dots per docs/05, never an empty or broken
chart — `computeTrendScale`/`trendPointToXY` handle the single-point
divide-by-zero case explicitly and are tested for it.

PB tracking and the stale-max warning were both spec'd in earlier phases'
docs/04 sections but never actually wired up — closed here rather than
left as a silent gap. `SessionSummary`'s docstring claimed "whether it's a
new PB" since Phase 5; the code never checked it. Now each exercise/hand
touched in a session is compared via the new `maxRecords.getBestBefore()`
query against every record from _before that session's start_ (not
`Date.now()`, so reopening a saved summary later doesn't retroactively
un-PB it), and a genuine PB gets a quiet one-line note — never an alert,
per docs/04's "celebrated, but quietly." Session setup now runs
`prescribeTargetForce` against the latest max whenever a "Target-band
(latest max)" step is added and shows a non-blocking retest suggestion
when it's stale (the existing 6-week default from `prescription.ts`,
already correct, just never surfaced in this screen).

284 → 341 tests this phase (57 new): repository query correctness
(`listWithSummary`, `listByExerciseChronological`, `getBestBefore`,
`listCompletedForTrainingLoad`) against real SQLite, including a
deliberate exercise-name-containing-a-comma case that would have silently
corrupted the History list had the exercise names been joined with
`GROUP_CONCAT(DISTINCT ...)` and split on `,` — SQLite's `GROUP_CONCAT`
has no custom-separator form for `DISTINCT`, so that path was replaced
with one small per-session query instead of a fragile string-splitting
trick. All new `core/progress/` modules (`trainingLoad`, `personalBest`,
`normalization`, `asymmetryTrend`) are pure and unit-tested without a
database.

Deliberately scoped out, not silently dropped:

- **Training load is TUT/impulse only** — docs/04 doesn't ask for a
  separate volume or rep-count trend, so none was built.
- **Asymmetry pairing is nearest-in-time, not session-linked** — `MaxRecord`
  has no `sessionId` column, so pairing infers "same testing occasion" from
  a 24h proximity window rather than a real foreign key. Correct for every
  realistic emulator/real-world usage pattern (both hands tested minutes
  apart in one session), but a same-day-different-session edge case could
  theoretically mispair. Not worth a schema migration for Phase 6.
- **CSV export of history/progress data** is Phase 7 (docs/08), not this
  phase — Phase 6 is read/visualize only.

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

**Status: done.** Settings gained real content (previously the last Phase 0
placeholder tab): Export CSV streams the two files docs/03/docs/07 specify
via `expo-file-system`'s `File.write(chunk, {append: true})` in 1000-row
batches — never one giant in-memory string — then hands both off through
`expo-sharing`'s share sheet. Export full database runs
`PRAGMA wal_checkpoint(TRUNCATE)` before copying the SQLite file, since the
DB runs in WAL mode and a naive copy could silently miss a recently
committed session still sitting in the `-wal` file; the checkpoint forces
everything back into the main file first so the exported `.db` is a
complete, self-contained snapshot. A new `app_setting` key/value table
(migration 0003) tracks `lastExportedAt` for a quiet, non-nagging reminder
(docs/06) — no separate storage library needed for one timestamp.

All three export paths were verified against the emulator's real
accumulated test data, not just unit tests: the summary and samples CSVs
came back with correctly-columned real rows (exercise name, edge depth,
smoothing window, peak force all in the right place), the samples CSV's
row count matched the exported database's own `sample` table count exactly
(1237 in both), and the exported `.db` file opened cleanly in a real
`sqlite3` client. The column-mapping logic itself (`csvRows.ts`) is unit
tested directly — deliberately kept separate from the file-writing I/O
(`exportCsv.ts`), since `expo-file-system`'s native module can't run under
Jest (same class of problem as `react-native-ble-plx`'s `BleManager`) but
the actual correctness risk — a misordered or dropped field silently
corrupting every exported row — lives entirely in the mapping, not the I/O.

App-backgrounded-mid-set was a real gap, not a UI polish item: the state
machine's `BACKGROUNDED` handling (pause, mark the set, require an
explicit resume) has existed since Phase 3, but nothing ever dispatched
it — no `AppState` listener existed anywhere in the codebase. Wired into
`useSessionRunner` via an injectable `AppStateSource` (mirroring
`fakeBleManager.ts`'s pattern: a narrow fake matching the real interface,
not a `jest.mock`, since this project has never used the latter and real
`AppState` can't construct under Jest either). Confirmed foreground return
does **not** auto-resume, matching the same "never silently resume"
principle `DEVICE_RESTORED` already established.

The Device screen closed its remaining docs/04 edge-case gaps:
`Linking.openSettings()` now actually backs the `deepLinkToSettings` state
(the permission logic already computed it; nothing called it). Scanning
now distinguishes "still scanning" from "nothing found" after the 10s
timeout, with a hint that the Progressor sleeps and may need a squeeze to
wake. A negative force reading (Progressor's sign can flip with pull
direction, per docs/02) clamps the _displayed_ number at 0 and shows a
tare prompt, while the underlying signed sample is left untouched for
`tare()` and any other logic. Battery below 3400mV (an assumed
conservative single-cell Li-ion threshold — docs/02 has no documented
cutoff; flagged for Phase H to revisit against real hardware) shows a
passive warning. The "battery warning at session start" half of that
docs/04 line is _not_ built: no real device connects until the live
screen, so there's nothing to check yet at setup time — recorded as a
scope note rather than silently skipped.

README was rewritten from its stale "Pre-code" status and thin build
section into real, verified instructions: JDK 17 specifically (Android
Studio's bundled JDK 25 breaks Gradle's native CMake configure step for
`react-native-skia`/`expo-modules-core` — discovered the hard way earlier
this project and now documented so nobody else loses time to it), Android
SDK setup, and a script reference table. Verified two ways: a fresh
`npm install` in a scratch copy of the tree (outside the working native
`android/`, so it genuinely re-resolves everything) passed typecheck,
lint, and all 370 tests cleanly — and that pass caught two real lint
errors in Settings (`Date.now()` called during render, an unused import)
that had gone unchecked until this exact verification step ran. The full
native rebuild wasn't repeated a second time in this session (the working
build already proves it compiles); that's recorded as a lighter-touch
verification than a byte-for-byte clean-clone-to-emulator run, not a full
substitute for one.

341 → 370 tests this phase (29 new): CSV field-mapping correctness,
`AppSettingRepository`, the `AppState`→`BACKGROUNDED` wiring (including the
"does not interrupt while idle" and "foreground does not auto-resume"
cases), and export query correctness against the `getEachAsync` streaming
pattern added to `EffortRepository`/`SampleRepository` for this phase.

Deliberately scoped out, not silently dropped:

- **Battery warning at session start** — see above; no connected device
  exists at that point in the current flow.
- **A literal fresh-clone-to-running-emulator README verification** — the
  lighter `npm install` + typecheck/lint/test verification in a scratch
  copy was judged sufficient for this pass; a full clean-clone-to-emulator
  run is cheap to redo before an actual release tag if wanted.
- **CSV/JSON export format beyond what docs/03 specifies** — no JSON
  export (docs/03 explicitly marks it "secondary, non-blocking").

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
