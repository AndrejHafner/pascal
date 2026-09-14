# 07 — Architecture

Drafted from [01](01-overview.md)–[06](06-non-functional-and-open-source.md).
This is the implementation plan; the build order is in
[08-roadmap.md](08-roadmap.md).

## Guiding constraints

Four constraints from the specs shape almost every decision here:

1. **The sample pipeline must never be blocked by UI work**
   ([06](06-non-functional-and-open-source.md)) — no DB writes, layout, or
   React renders in the BLE callback.
2. **Recorded data must be exactly what was measured**
   ([06](06-non-functional-and-open-source.md)) — no interpolation, no
   gap-filling, no silent discards.
3. **Two structurally different devices** ([02](02-ble-protocol.md)) —
   Progressor is connect-and-notify, WH-C06 is scan-and-parse. They cannot
   share a connection lifecycle, only a data interface.
4. **Metric math is where correctness risk lives**
   ([06](06-non-functional-and-open-source.md)) — so it must be pure,
   isolated, and heavily tested.

## Layering

Strict one-directional dependencies. Nothing below points upward:

```
┌──────────────────────────────────────────────┐
│  app/          screens, navigation (Expo Router)
├──────────────────────────────────────────────┤
│  features/     session runner, charts, history views
├──────────────────────────────────────────────┤
│  core/         pure domain logic — metrics, protocols, prescription
├──────────────────────────────────────────────┤
│  services/     BLE devices, database, export, cues
└──────────────────────────────────────────────┘
```

**`core/` imports nothing from the other layers** — no React, no SQLite, no
BLE. It's plain TypeScript over plain data, which is what makes it testable
in CI without hardware.

## Folder structure

```
pascal/
├── app/                          # Expo Router file-based routes
│   ├── (tabs)/
│   │   ├── index.tsx             # Today
│   │   ├── history.tsx
│   │   ├── progress.tsx
│   │   └── settings.tsx
│   ├── session/
│   │   ├── setup.tsx
│   │   ├── live.tsx              # modal, portrait-locked
│   │   └── summary.tsx
│   ├── device.tsx
│   ├── exercise/[id].tsx
│   └── _layout.tsx
│
├── src/
│   ├── core/                     # ── pure, no I/O, no React ──
│   │   ├── metrics/
│   │   │   ├── rollingPeak.ts    # smoothed peak + window
│   │   │   ├── tut.ts            # band bucketing, TUT
│   │   │   ├── impulse.ts
│   │   │   ├── fatigue.ts
│   │   │   └── asymmetry.ts
│   │   ├── protocol/
│   │   │   ├── machine.ts        # session state machine (pure reducer)
│   │   │   ├── presets.ts        # max-effort, target-band, repeaters
│   │   │   └── prescription.ts   # % of max → target force
│   │   ├── ringBuffer.ts
│   │   └── types.ts              # Sample, Effort, Set, Session…
│   │
│   ├── services/
│   │   ├── ble/
│   │   │   ├── DeviceSource.ts   # the shared interface
│   │   │   ├── ProgressorDevice.ts
│   │   │   ├── WHC06Device.ts
│   │   │   ├── EmulatorDevice.ts
│   │   │   ├── parsers/          # pure byte→sample, unit-tested
│   │   │   │   ├── progressor.ts
│   │   │   │   └── whc06.ts
│   │   │   └── sequences/        # canned emulator data
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── migrations/
│   │   │   ├── schema.sql
│   │   │   └── repositories/     # one per aggregate
│   │   ├── export/
│   │   └── cues/                 # tones + haptics
│   │
│   ├── features/
│   │   ├── session/              # SessionRecorder, live-screen hooks
│   │   ├── chart/                # Skia ForceChart (live + historical)
│   │   └── history/
│   │
│   └── theme/                    # tokens from 05-design.md
│
├── docs/
└── __tests__/
```

## The sample pipeline

The most performance-critical path in the app, and the one most likely to be
got wrong. Four stages, deliberately decoupled:

```
BLE callback         ring buffer          drain timer            consumers
(native thread)      (preallocated)       (~150 ms)
     │                    │                    │              ┌─► chart (Skia, reads buffer directly @60fps)
  parse bytes ──push──►  [ ][ ][ ][ ] ──drain──┼─────────────►├─► metrics accumulator (incremental)
  (pure fn)            fixed-size, no           │              └─► SQLite batch INSERT (one txn)
                       allocation per sample    │
```

Rules:

- **The BLE callback does exactly two things**: parse bytes to samples, push
  into the ring buffer. Nothing else. No `setState`, no logging in release,
  no DB.
- **Ring buffer is preallocated** (`Float32Array` for force, `Uint32Array`
  for offsets) and sized for several seconds of headroom (60 Hz × 2 arrays;
  4096 entries ≈ 68 s — generous). No per-sample object allocation, which
  would otherwise cause GC pauses mid-set.
- **The drain timer (~150 ms)** does the expensive work: a single batched
  `INSERT` inside one transaction, and an incremental metrics update.
- **The chart reads the ring buffer directly** on its own frame loop, not
  via React state. Per-sample `setState` at 60 Hz would be catastrophic;
  Skia can render from a mutable buffer without re-rendering the tree.
- **React state updates at ~10 Hz max** — only the displayed force number,
  zone state, and TUT clock, which is far more than enough for human
  perception and keeps the tree cheap.

**Zone/TUT accounting happens per-sample during the drain, not per-frame.**
Deriving TUT from rendered frames would tie a data metric to display timing;
each sample contributes its own inter-sample interval to the appropriate
bucket. When samples are missing (disconnect), that interval contributes to
*nothing* — a gap, not an assumption ([06](06-non-functional-and-open-source.md)).

## BLE layer

One interface, three implementations, per [02](02-ble-protocol.md):

```ts
interface DeviceSource {
  readonly kind: 'progressor' | 'whc06' | 'emulator'
  readonly capabilities: {
    hardwareTare: boolean      // Progressor yes, WH-C06 no
    battery: boolean           // Progressor yes, WH-C06 no
    requiresConnection: boolean // WH-C06 is advertisement-only
  }
  connect(): Promise<void>
  disconnect(): Promise<void>
  onSample(cb: (s: RawSample) => void): Unsubscribe
  onStatus(cb: (s: DeviceStatus) => void): Unsubscribe
  tare(): Promise<void>
  getBattery?(): Promise<number>
}
```

The two real devices share almost nothing operationally:

| | Progressor | WH-C06 |
|---|---|---|
| Lifecycle | connect → discover → monitor | scan continuously |
| Start streaming | write `0x65` | n/a (always broadcasting) |
| Tare | hardware (`0x64`) | software baseline |
| Disconnect detection | GATT event | 10 s advertisement watchdog |
| Battery | yes | no |

`capabilities` exists so the UI can adapt without type-checking the device
(`getBattery` simply absent on WH-C06). **Tare is presented identically in
the UI** — the hardware/software split is an implementation detail
([04](04-screens-and-ux.md)).

**Parsers are pure functions** — `(bytes: Uint8Array) => RawSample[]` — with
no device or BLE dependency, so the byte-level fixture tests demanded by
[06](06-non-functional-and-open-source.md) run in CI trivially.

**Android:** call `requestConnectionPriority('High')` immediately after
connecting ([02](02-ble-protocol.md)).

## Session state machine

The live session is a **pure reducer** in `core/protocol/machine.ts` — no
timers, no I/O:

```ts
type Phase =
  | 'idle' | 'countdown' | 'armed'        // waiting for force threshold
  | 'working' | 'interHandRest'
  | 'setRest' | 'done' | 'interrupted'

reduce(state: SessionState, event: SessionEvent): SessionState
```

Events: `TICK`, `SAMPLE`, `START`, `SKIP`, `ABORT`, `DEVICE_LOST`,
`DEVICE_RESTORED`, `BACKGROUNDED`.

Keeping it pure means the whole session flow — including hand switching,
rest timing, and disconnect interruption — is testable in CI by feeding
canned event sequences, no hardware and no rendered UI.

The **effect layer** (a hook in `features/session/`) owns the real timer,
subscribes to the device, plays cues, and persists. It translates the
machine's declared intentions (`{ playCue: 'dropped-below' }`) into actual
side effects.

**Auto-start:** `armed` → `working` on the first sample exceeding the
threshold ([04](04-screens-and-ux.md)), so the ramp-up is captured without
idle time.

## Database

`expo-sqlite`, offline-only. Schema follows [03](03-training-and-data-model.md)
directly.

```sql
CREATE TABLE exercise (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  grip_type     TEXT NOT NULL,
  edge_depth_mm REAL NOT NULL,              -- required, per 03
  modality      TEXT NOT NULL CHECK (modality IN ('block_pull','hang')),
  notes         TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE session (
  id             TEXT PRIMARY KEY,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  bodyweight_kg  REAL NOT NULL,             -- snapshot; never back-filled
  notes          TEXT
);

CREATE TABLE training_set (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  exercise_id          TEXT NOT NULL REFERENCES exercise(id),
  kind                 TEXT NOT NULL CHECK (kind IN ('max_effort','target_band','all_out')),
  ordinal              INTEGER NOT NULL,

  -- target_band only
  source_max_effort_id TEXT REFERENCES effort(id),
  target_percent       REAL,
  target_force_kg      REAL,
  tolerance_band_kg    REAL,
  planned_work_ms      INTEGER,

  -- repeaters (nullable)
  rep_work_ms          INTEGER,
  rep_rest_ms          INTEGER,
  rep_count            INTEGER,

  inter_hand_rest_ms   INTEGER NOT NULL,
  inter_set_rest_ms    INTEGER NOT NULL,

  UNIQUE (session_id, ordinal)
);

CREATE TABLE effort (
  id          TEXT PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES training_set(id) ON DELETE CASCADE,
  hand        TEXT NOT NULL CHECK (hand IN ('left','right')),
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('completed','aborted','disconnected')),
  added_load_kg     REAL NOT NULL DEFAULT 0,
  device_type       TEXT NOT NULL,
  device_sequence   TEXT,                   -- emulator only
  sample_rate_hz    REAL,                   -- observed, per 06

  -- derived metrics, computed once at effort end
  peak_force_smoothed_kg REAL,
  smoothing_window_ms    INTEGER,           -- stored per record, per 03
  peak_force_instant_kg  REAL,
  mean_force_kg          REAL,
  impulse_kg_s           REAL,
  time_under_tension_ms  INTEGER,
  time_in_band_ms        INTEGER,
  time_above_band_ms     INTEGER,
  time_below_band_ms     INTEGER,
  time_to_peak_ms        INTEGER,
  time_to_target_ms      INTEGER,
  fatigue_index          REAL,

  UNIQUE (set_id, hand)
);

CREATE TABLE sample (
  effort_id  TEXT NOT NULL REFERENCES effort(id) ON DELETE CASCADE,
  offset_ms  INTEGER NOT NULL,              -- relative to effort start
  force_kg   REAL NOT NULL,
  PRIMARY KEY (effort_id, offset_ms)
) WITHOUT ROWID;

CREATE TABLE max_record (
  id                   TEXT PRIMARY KEY,
  exercise_id          TEXT NOT NULL REFERENCES exercise(id),
  hand                 TEXT NOT NULL,
  effort_id            TEXT NOT NULL REFERENCES effort(id),
  force_kg             REAL NOT NULL,
  smoothing_window_ms  INTEGER NOT NULL,
  rule                 TEXT NOT NULL DEFAULT 'best_attempt',
  bodyweight_kg_at_test REAL NOT NULL,
  recorded_at          INTEGER NOT NULL
);

CREATE INDEX idx_set_session     ON training_set(session_id, ordinal);
CREATE INDEX idx_effort_set      ON effort(set_id);
CREATE INDEX idx_session_started ON session(started_at DESC);
CREATE INDEX idx_max_lookup      ON max_record(exercise_id, hand, recorded_at DESC);
```

Notes on specific choices:

- **`sample` is `WITHOUT ROWID`** with a composite PK of
  `(effort_id, offset_ms)`. This is the high-volume table (~60 Hz × duration
  × 2 hands ≈ 3.6k rows/minute/hand). `WITHOUT ROWID` stores rows directly
  in the PK b-tree, avoiding a second index and roughly halving storage and
  write cost. The PK also naturally enforces no duplicate timestamps per
  effort.
- **`kind` includes `'all_out'` already** — resolving the open question in
  [03](03-training-and-data-model.md). A `CHECK` constraint is painful to
  alter in SQLite (requires a table rebuild), and admitting one unused enum
  value now costs nothing versus a migration later.
- **Derived metrics are stored, not recomputed** on every history view — but
  they're always recomputable from `sample`, which remains the source of
  truth.
- **`bodyweight_kg` is a per-session snapshot.** Normalization is computed
  on read, never stored, so a bodyweight change can't corrupt history
  ([03](03-training-and-data-model.md)).
- **`ON DELETE CASCADE`** from session → set → effort → sample, so deleting a
  session can't orphan millions of samples. Requires
  `PRAGMA foreign_keys = ON` at startup.

**Pragmas at startup:** `journal_mode = WAL` (concurrent read during writes),
`synchronous = NORMAL` (safe under WAL, much faster batch inserts),
`foreign_keys = ON`.

**Migrations are forward-only, numbered, and tested**
([06](06-non-functional-and-open-source.md)) — there is no backup server, so
a destructive migration is unrecoverable.

## Metrics: incremental, then final

Live metrics must be cheap; stored metrics must be exact. So each metric has
two paths:

- **Incremental** — updated per sample during the drain, O(1), for live
  display. Running peak, TUT buckets, impulse accumulator.
- **Final** — computed once at effort end from the complete sample array,
  stored on `effort`. The smoothed rolling peak in particular is a
  windowed pass that's simplest and most accurate done over the full set.

They must agree. A test asserting incremental and final results match on the
emulator sequences guards the whole metric layer against drift.

**Smoothed peak** uses a monotonic deque over the 1 s window (default per
[03](03-training-and-data-model.md)) — O(n) for the whole effort. The window
size is stored alongside the result, always.

## Charts

One Skia `ForceChart` component, used live and historically
([04](04-screens-and-ux.md), [05](05-design.md)).

- Live: reads the ring buffer on a `useFrameCallback` loop; trailing ~10 s
  window; **never re-renders via React state**.
- Historical: same component, fed a static sample array, full duration.
- **Zone coloring is per-segment** — the trace is drawn as segments colored
  by the zone state at the time each was recorded, so history keeps its
  original colors ([05](05-design.md)).
- **Y axis never rescales downward mid-set** ([05](05-design.md)) — the
  maximum is latched.

## Cues

`services/cues/` wraps tones (`expo-audio`) and haptics (`expo-haptics`)
behind one `playCue(kind)` call. Tones are **pregenerated/preloaded at
session start** — synthesizing or loading on demand would blow the <50 ms
threshold-to-cue budget ([06](06-non-functional-and-open-source.md)).

Each cue has a distinct haptic pattern, since haptic-only must be fully
functional ([04](04-screens-and-ux.md)).

## Export

CSV via `expo-file-system` + `expo-sharing`. Two files, per
[03](03-training-and-data-model.md):

- `pascal-summary-<date>.csv` — one row per effort, with full session/set/
  exercise context, including **smoothing window and edge depth** (without
  which the numbers are uninterpretable).
- `pascal-samples-<date>.csv` — one row per sample, keyed by effort id.

Streamed in chunks, not built as one in-memory string — a year of sessions
is millions of rows.

Full-database export (copying the SQLite file out) is the data-loss
mitigation flagged in [06](06-non-functional-and-open-source.md).

## State management

- **Server/DB state:** TanStack Query over the repositories — caching and
  invalidation for history and progress views.
- **Live session state:** the reducer above, held in one context provider
  scoped to the live screen. It dies with the screen.
- **Settings:** small persisted store (Zustand + AsyncStorage) for
  bodyweight default, cue prefs, thresholds, emulator flag.
- **No global app store.** There's no shared mutable state worth one.

## Testing

Per [06](06-non-functional-and-open-source.md), shaped around BLE being
untestable in CI:

| Layer | How |
|---|---|
| Parsers | Byte fixtures per device. **Non-negotiable** — a parser regression silently corrupts plausible-looking data. |
| Metrics | Known input curves → known outputs; incremental vs. final agreement. |
| State machine | Canned event sequences, including `DEVICE_LOST` mid-set. |
| Prescription | % of max → target force, including stale-max and missing-max cases. |
| Integration | Emulator sequences driving the real pipeline end-to-end in CI. |
| Real hardware | Written pre-release checklist. Cannot be automated. |

## Key decisions

| Decision | Rationale |
|---|---|
| `core/` has zero framework imports | Correctness-critical math testable without hardware or React |
| Ring buffer + timed drain | Only way to hit 60 Hz without blocking the BLE callback |
| Chart bypasses React state | Per-sample `setState` at 60 Hz is not viable |
| Session machine is a pure reducer | Makes disconnect/interruption paths testable |
| `sample` is `WITHOUT ROWID` | Halves cost on the only table that gets large |
| `'all_out'` in the CHECK now | SQLite `CHECK` changes need a table rebuild; free to add now |
| No UI kit | ~12 components; the important screen is a custom Skia canvas |
| Parsers pure, separate from transport | Makes the fixture tests 06 requires trivial |

## Open questions

- **Sample retention.** Millions of rows accumulate over years. Keep raw
  samples forever (simple, honest, ~50 MB/year at heavy use), or downsample
  efforts older than N months? Defaulting to *keep everything* until storage
  is demonstrably a problem — discarding measurements conflicts with
  [06](06-non-functional-and-open-source.md)'s data-integrity stance.
- **Ring buffer overflow behavior** if the drain is starved (app hitch): drop
  oldest, drop newest, or grow? Dropping *anything* silently conflicts with
  data integrity — leaning toward recording an explicit gap marker so the
  loss is visible rather than invisible.
