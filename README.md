# Pascal

A personal, open-source, cross-platform (iOS + Android) climbing finger
strength training app built around a Bluetooth force-measuring device
(Tindeq Progressor or Weiheng WH-C06).

Pascal measures **block pulls** — pulling an edge upward against a
floor-anchored load cell. You test your max, then train at a percentage of
it, with time-under-tension counted only while your pulled force stays
within a target band. Both hands, every set.

## Status

Pre-code. Specs in [`/docs`](docs/) are complete; implementation follows the
phases in [`08-roadmap.md`](docs/08-roadmap.md).

## Stack

- **Framework:** Expo (React Native) with a custom dev build
  (`expo-dev-client` + EAS Build) — not Expo Go, since BLE requires native
  modules Expo Go can't load
- **Language:** TypeScript
- **BLE:** `react-native-ble-plx`
- **Storage:** SQLite via `expo-sqlite`, fully offline-first
- **Charts:** React Native Skia (`@shopify/react-native-skia`)

## Docs

- [`01-overview.md`](docs/01-overview.md) — goals, non-goals
- [`02-ble-protocol.md`](docs/02-ble-protocol.md) — device + GATT details
- [`03-training-and-data-model.md`](docs/03-training-and-data-model.md) — protocols, metrics, export
- [`04-screens-and-ux.md`](docs/04-screens-and-ux.md) — screens, live-test UX
- [`05-design.md`](docs/05-design.md) — visual direction
- [`06-non-functional-and-open-source.md`](docs/06-non-functional-and-open-source.md) — license, CI, perf targets
- [`07-architecture.md`](docs/07-architecture.md) — folder structure, module boundaries, sample pipeline, SQLite schema
- [`08-roadmap.md`](docs/08-roadmap.md) — phased build plan with "done when" criteria

## Building

> **Expo Go will not work.** Pascal depends on `react-native-ble-plx`, a
> native module Expo Go cannot load. You need a custom dev build
> (`expo-dev-client` + EAS Build).

BLE also cannot be tested in the iOS Simulator or Android Emulator — real
Bluetooth requires physical devices. For development without hardware,
Pascal includes a built-in device emulator that replays canned force
sequences; see [`docs/02-ble-protocol.md`](docs/02-ble-protocol.md).

## Contributing

Personal project, open sourced as a courtesy. Issues and PRs are welcome,
but **no response time is promised** and contributions that expand scope may
be declined. If you want Pascal to work with different hardware or different
training protocols, **forking is encouraged** — that's likely a better path
than an upstream request.

## Acknowledgements

- **[Grip Connect](https://github.com/Stevie-Ray/hangtime-grip-connect)**
  (BSD-2-Clause) — the source of the BLE protocol details for both supported
  devices. Pascal reimplements this logic against `react-native-ble-plx`
  rather than depending on the package, but the protocol knowledge is theirs.
- Training protocol parameters are drawn from published research and from
  Lattice Training, Eva López, Eric Hörst, and Tyler Nelson; cited inline in
  [`docs/03-training-and-data-model.md`](docs/03-training-and-data-model.md).

Not affiliated with, endorsed by, or supported by Tindeq or Weiheng.

## License

[MIT](LICENSE) © 2026 Andrej Hafner
