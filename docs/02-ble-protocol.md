# 02 — BLE Protocol

## Device identity

Pascal targets two devices, both consumer/climbing force-measurement
hardware communicating over BLE:

- **Tindeq Progressor** — official climbing-specific load cell, protocol
  published by Tindeq (https://tindeq.com/progressor_api/). Also spoken by
  compatible open-source clones: **Crimpdeq**, **Mito**, **Hangman**.
- **Weiheng WH-C06** — a generic 300 kg hanging/luggage scale repurposed by
  climbers as a cheap alternative. Protocol is community reverse-engineered,
  not vendor-published.

Both are supported by v1. No custom ESP32 rig or other hardware is planned
for now.

## Existing library coverage

**Grip Connect** — npm package `@hangtime/grip-connect` (repo
[`Stevie-Ray/hangtime-grip-connect`](https://github.com/Stevie-Ray/hangtime-grip-connect),
BSD-2-Clause) — already implements both devices, plus several others
(Griptonite Motherboard, PitchSix Force Board, CTS500, Entralpi, Climbro,
etc.). It's a **Web Bluetooth** client, published as several packages:
`packages/core` (browser, canonical implementation), `packages/capacitor`,
`packages/react-native`, `packages/runtime` (Node/Bun/Deno).

Decision: **do not vendor `@hangtime/grip-connect` as a runtime dependency.**
Its `packages/react-native` target exists but Pascal is committed to
`react-native-ble-plx` (see project stack), not Web Bluetooth polyfills, so
pulling in a second BLE abstraction layer on top of `ble-plx` would be
redundant complexity. Instead, **replicate its protocol logic** (byte
layouts, opcodes, parsing) directly against `ble-plx`'s connect/notify/write
API. This doc captures everything needed to do that without re-deriving it
from Grip Connect's source again. Grip Connect's own test suite (see
[Emulator / test-fixture device](#emulator--test-fixture-device) below) is
also the model for Pascal's BLE emulator class.

## GATT profile

### Tindeq Progressor

| Role | UUID |
|---|---|
| Service | `7e4e1701-1ea6-40c9-9dcc-13d34ffead57` |
| Notify ("rx", data + command responses) | `7e4e1702-1ea6-40c9-9dcc-13d34ffead57` |
| Write ("tx", commands) | `7e4e1703-1ea6-40c9-9dcc-13d34ffead57` |

Discovery: filter on advertised device **name prefix `"Progressor"`** (not a
service-UUID scan filter, though the service UUID above should still be
declared so `ble-plx` can discover services post-connect on iOS/Android).

Progressor also exposes the Nordic Secure DFU service
(`0000fe59-0000-1000-8000-00805f9b34fb`) for firmware updates. Out of scope
for Pascal v1 — no in-app firmware update flow planned.

### Weiheng WH-C06

**No GATT service or characteristic at all.** The WH-C06 never establishes a
data-carrying GATT session — it broadcasts its weight reading inside BLE
**advertisement manufacturer-data packets**, continuously, without requiring
a connection.

Discovery: filter on **manufacturer data company identifier `0x0100`**
(256 decimal). Note this ID is a coincidental reuse of TomTom International
BV's assigned Bluetooth SIG identifier — not a dedicated ID for this device
— so the filter is inherently loose. Real-world observed advertised local
name is `"IF_B7"`, but Grip Connect does not filter on name; Pascal should
follow suit and filter on manufacturer data.

**Platform implication for `react-native-ble-plx`:** advertisement-based
(connectionless) data means the normal `ble-plx` connect → discover services
→ monitor characteristic flow **does not apply to WH-C06**. Instead this
needs `BleManager.startDeviceScan()` kept running with the manufacturer-data
filter, parsing weight directly out of each scan result's manufacturer data
— there is no "connect" step for data purposes. This is a meaningfully
different code path from Progressor and should be modeled as such (see
[Connection behavior](#connection-behavior)).

## Data format

### Tindeq Progressor

Every notification on the "rx" characteristic is framed as:

```
byte0        = kind (response type)
byte1        = payloadLength
bytes[2..]   = payload (payloadLength bytes)
```

Drop the packet if `value.byteLength < 2 + payloadLength`.

`kind` values:

| kind | Meaning |
|---|---|
| 0 | `RESPONSE_COMMAND` — response to a previously written command |
| 1 | `RESPONSE_WEIGHT_MEASUREMENT` — streamed force data |
| 2 | `RESPONSE_RFD_PEAK` — not needed for v1 |
| 3 | `RESPONSE_RFD_PEAK_SERIES` — not needed for v1 |
| 4 | `RESPONSE_LOW_POWER_WARNING` — log only |

**`kind === 1` (weight measurement) — batched, 8 bytes per sample:**
`payloadLength / 8` samples can arrive in a single notification.

```
offset +0:  float32 LE   weight in kg (signed — sign flips with pull direction)
offset +4:  uint32  LE   device timestamp in microseconds (device's own free-running
                          clock; NOT wall-clock/epoch — use for sampling-rate/interval
                          math only, timestamp the sample on receipt for storage)
```

Skip non-finite (`NaN`/`±Infinity`) weight values per-sample without
corrupting any running peak/mean/min calculation.

**`kind === 0` (command response)** — payload shape depends on which command
was last written:

| Last command | Response payload |
|---|---|
| `GET_BATTERY_VOLTAGE` | `uint32` LE, millivolts |
| `GET_FIRMWARE_VERSION` / `GET_ERROR_INFORMATION` | UTF-8 text |
| `GET_PROGRESSOR_ID` | 8 bytes, reversed then hex-encoded MSB-first |
| `GET_CALIBRATION` | 12 bytes = 3× `float32` LE: `slope`, `intercept`, `trim`. `value = raw*slope + intercept + trim` |
| `GET_CALIBRATION_TABLE` | sequence of 16-byte records (one per notification): `[u32 lowerRaw, u32 upperRaw, f32 slope, f32 intercept]` |

Calibration read/write and the RFD-peak commands are **not needed for
Pascal v1** — the device ships pre-calibrated and Pascal only consumes
already-scaled kg weight. Note them here for completeness in case a
recalibration flow is ever needed.

### Weiheng WH-C06

One sample per BLE advertisement event — **no batching**. Within the
manufacturer-data payload (company ID `0x0100`):

```
offset 10-11:  uint16 BE   weight = (byte[10] << 8) | byte[11]
                            divide by 100 -> kilograms
                            e.g. 0x04D2 = 1234 -> 12.34 kg
```

Offset 14 reportedly packs a `stable` flag (high nibble) and `unit` (low
nibble), per Grip Connect's source, but it's commented out/unused there —
unverified and not currently relied upon. Treat as a future investigation
item, not something to build against yet.

No device-native timestamp — stamp on receipt (`Date.now()`).

### Sample rate

Target is ~60 Hz end-to-end (see stack constraints). Progressor batches
multiple 8-byte samples per notification depending on its internal rate and
the negotiated connection interval — actual achievable rate must be measured
against real hardware, not assumed. WH-C06 is capped by its advertisement
interval, which is generally **much slower** than 60 Hz (crane-scale
hardware, not designed for high-rate streaming) — expect WH-C06 to be the
lower-fidelity device of the two; do not assume it can hit the 60 Hz target used elsewhere in this project. Confirm actual WH-C06 advertisement rate empirically before relying on it for time-under-tension style protocols.

## Command protocol

### Tindeq Progressor

Single-byte ASCII opcodes written to the "tx" characteristic:

| Command | Char | Hex | Notes |
|---|---|---|---|
| `TARE_SCALE` | `d` | 0x64 | Hardware tare — device must be actively streaming when called |
| `START_WEIGHT_MEAS` | `e` | 0x65 | Begin streaming |
| `STOP_WEIGHT_MEAS` | `f` | 0x66 | Stop streaming |
| `GET_FIRMWARE_VERSION` | `k` | 0x6b | |
| `GET_ERROR_INFORMATION` | `l` | 0x6c | |
| `CLR_ERROR_INFORMATION` | `m` | 0x6d | |
| `SLEEP` | `n` | 0x6e | Shuts the device down |
| `GET_BATTERY_VOLTAGE` | `o` | 0x6f | |
| `GET_PROGRESSOR_ID` | `p` | 0x70 | |
| `GET_CALIBRATION` | `r` | 0x72 | |
| `REBOOT` | `u` | 0x75 | Send as `[0x75, 0, 1]` (needs confirmation byte); drops the BLE connection immediately by design |

Commands used for v1: `START_WEIGHT_MEAS`, `STOP_WEIGHT_MEAS`, `TARE_SCALE`,
`GET_BATTERY_VOLTAGE`. The rest (calibration, RFD, reboot, error log) are
out of scope unless a specific need comes up.

### Weiheng WH-C06

**None.** No write characteristic exists on this device at all — there's no
start/stop/tare/battery/firmware command surface. Tare must be done in
software (subtract a captured baseline from subsequent readings) since there
is no hardware tare to invoke.

## Connection behavior

### Tindeq Progressor

Standard `ble-plx` connect → discover services → monitor "rx" characteristic
flow. On Android, call `requestConnectionPriority('High')` immediately after
connecting (per project-wide BLE constraint) to push toward a tighter
connection interval. Must explicitly write `START_WEIGHT_MEAS` after
connecting — streaming does not start automatically. Write `STOP_WEIGHT_MEAS`
before disconnecting cleanly where possible (not guaranteed on unexpected
disconnects).

Reconnection: on unexpected mid-session disconnect, surface it to the user
immediately (test data up to that point should not be silently discarded —
see [session/data model](03-training-and-data-model.md) for how partial
sessions are handled). Auto-reconnect attempt is reasonable to try in the
background, but the live-test UI must clearly show "disconnected" state
rather than silently freezing on the last value.

### Weiheng WH-C06

No connect/GATT session for data at all — this is scan-and-listen, not
connect-and-monitor. Practically:

- Keep `BleManager.startDeviceScan()` running (filtered to the manufacturer
  ID) for the duration of the live test.
  Note `ble-plx`'s scan API surfaces raw manufacturer data per scan result;
  confirm during implementation that iOS actually delivers manufacturer data
  on background/foreground scans reliably — this is a known soft spot on iOS
  Core Bluetooth and should be verified on a physical iOS device early, not
  assumed to just work because it works on Android.
- Treat "no advertisement received for 10 seconds" as equivalent to a
  disconnect (mirrors Grip Connect's own watchdog timeout) and surface that
  to the UI the same way as a Progressor disconnect.
- Because there's no persistent connection, there's nothing to explicitly
  reconnect to — recovery is just "keep scanning, resume when an
  advertisement reappears."

### General

- BLE cannot be tested in a simulator/emulator at the OS/hardware level —
  iOS Simulator and Android Emulator do not support real Bluetooth hardware
  access. All *device* protocol verification requires physical iOS and
  Android hardware. See below for how Pascal mitigates this at the
  application level for day-to-day development.

## Emulator / test-fixture device

Since BLE cannot be exercised in a simulator, and iterating against real
hardware for every UI/logic change is slow, Pascal will include an
**in-app BLE emulator** used for development and automated tests, modeled
directly on the fake-Web-Bluetooth test infrastructure Grip Connect uses
internally for its own test suite (`packages/core/test/web-bluetooth-helpers.mjs`
and `packages/core/test/helpers.mjs` — not part of Grip Connect's public API,
but a solid reference implementation to port from).

### Design

Both real devices and the emulator implement the same internal interface —
whatever shape Pascal's BLE layer settles on in
[07-architecture.md](07-architecture.md) (roughly: `connect()`,
`disconnect()`, `onSample(callback)`, `tare()`, `isConnected()`) — so the
rest of the app (live-test screen, session recorder) is unaware whether it's
talking to a real device or the emulator. This mirrors Grip Connect's own
`Device` base class / device-subclass split, just with an `EmulatedDevice`
subclass standing in for `Progressor`/`WHC06`.

```
DeviceSource (interface)
├── ProgressorDevice   (real, ble-plx)
├── WHC06Device        (real, ble-plx scan-based)
└── EmulatorDevice     (fake, no BLE — emits a chosen canned sequence)
```

### Behavior

- `EmulatorDevice` takes a **sequence name/id** at construction and emits
  samples on a timer that mimics real device pacing (batched every ~15-30ms
  for a simulated Progressor-like source, one-at-a-time on a slower interval
  for a simulated WH-C06-like source) — not just dumping all samples
  instantly, so downstream code (ring buffer, chart, batched DB writes) is
  exercised realistically.
- Must support **multiple named sequences**, at minimum:
  - `steady-hang` — flat force plateau around a target value, for testing
    basic max-hang / time-in-zone logic
  - `repeaters` — on/off cycling pattern, for testing rep-counting logic
  - `noisy-pull` — a ramp-up, noisy plateau, ramp-down, to exercise
    peak/mean/smoothing logic against realistic jitter, not a perfect signal
  - `dropout` — a sequence that stops emitting mid-stream (simulates a
    mid-session BLE disconnect) to exercise reconnect/error-state UI without
    needing to physically walk out of BLE range
  - `slow-whc06` — a low-rate, single-sample-at-a-time sequence to exercise
    the WH-C06 code path's lower fidelity specifically
- Sequences are just data (arrays of `{ forceKg, offsetMs }` or similar) —
  should be trivial to add new ones without touching emulator logic, and
  usable both from a developer-facing in-app "use emulator" toggle and from
  automated tests.
- The emulator is dev/test-only — never shipped as a user-facing "demo mode"
  unless that's explicitly decided later; keep it behind a dev flag.

## Testing notes

- Physical-device protocol verification (real Progressor, real WH-C06) is
  still required before shipping — the emulator de-risks day-to-day
  development and automated testing, it does not replace real-hardware
  verification of the actual GATT/advertisement parsing.
- Open question: confirm WH-C06's real-world advertisement rate on both iOS
  and Android before committing to any protocol (e.g. max-hang) that assumes
  a minimum sample rate from it.
- Open question: confirm iOS Core Bluetooth reliably surfaces manufacturer
  data during scanning for the WH-C06 path — this is the single biggest
  platform-risk item in this doc.
