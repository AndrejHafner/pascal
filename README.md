# Pascal

A personal, open-source, cross-platform (iOS + Android) climbing finger
strength training app built around a Bluetooth force-measuring device
(Tindeq Progressor or Weiheng WH-C06).

Pascal measures **block pulls** — pulling an edge upward against a
floor-anchored load cell. You test your max, then train at a percentage of
it, with time-under-tension counted only while your pulled force stays
within a target band. Both hands, every set.

## Status

Specs in [`/docs`](docs/) are complete. Implementation is well underway,
following the phases in [`08-roadmap.md`](docs/08-roadmap.md) — the full
app (BLE emulator, session flow, history/progress, CSV and database
export) runs end-to-end against the built-in device emulator. **Not yet
validated against real hardware** — see
[Phase H](docs/08-roadmap.md#phase-h--hardware-validation-deferred), which
gates v1.0.0. Until then, treat the app as feature-complete but
unverified: fine for exercising the UI, not yet for making real training
decisions.

## Stack

- **Framework:** Expo (React Native) with a custom dev build
  (`expo-dev-client`, built locally via `expo run:android`/`expo run:ios`
  — EAS Build is an alternative for CI/distribution but isn't required for
  local development) — not Expo Go, since BLE requires native modules Expo
  Go can't load
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
> (`expo-dev-client`).

BLE also cannot be tested in the iOS Simulator or Android Emulator — real
Bluetooth requires physical devices. For development without hardware,
Pascal includes a built-in device emulator (`EmulatorDevice`) that replays
canned force sequences through the real pipeline — see
[`docs/02-ble-protocol.md`](docs/02-ble-protocol.md) and
[`docs/08-roadmap.md`](docs/08-roadmap.md#build-strategy-emulator-first).
Every phase up to [Phase H](docs/08-roadmap.md#phase-h--hardware-validation-deferred)
is built and verified this way — an Android emulator or iOS simulator is
enough to run the whole app.

### Prerequisites

- **Node.js** 20+ and npm
- **JDK 17** (Android builds only) — not whatever JDK Android Studio bundles
  by default. As of writing, Android Studio ships JDK 25, which breaks
  Gradle's native CMake configure step for `react-native-skia` and
  `expo-modules-core` with an opaque `WARNING: A restricted method in
java.lang.System has been called` failure. Install a JDK 17 separately
  (e.g. `brew install --cask temurin@17` on macOS) and point `JAVA_HOME`
  at it — don't rely on Android Studio's bundled one.
- **Android SDK** — installed via Android Studio (SDK Platform, Build-Tools,
  Platform-Tools, and an emulator system image; a Pixel AVD on a recent API
  level works well). `ANDROID_HOME` must be set and
  `$ANDROID_HOME/platform-tools` on `PATH` for `adb`.
- **Xcode** (iOS builds only, macOS only)

### Setup

```sh
npm install
npm run typecheck && npm run lint && npm test   # confirm a clean baseline
```

### Running on Android

1. Start an Android emulator (via Android Studio's Device Manager, or
   `emulator -avd <name>` once one exists).
2. `npm run android` — this builds the native project with Gradle (first
   build compiles all native code and takes several minutes; subsequent
   builds are much faster) and installs the dev client.
3. Once it's running, `npm start` keeps the Metro bundler available for
   fast-refresh iteration without rebuilding native code.

### Running on iOS

`npm run ios` (macOS + Xcode required). Same caveats as Android around
native rebuilds after adding a package with native code.

### Everyday scripts

| Command                                 | What it does                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm start`                             | Metro bundler for an already-installed dev client                                                   |
| `npm run android` / `npm run ios`       | Full native build + install                                                                         |
| `npm run typecheck`                     | `tsc --noEmit`                                                                                      |
| `npm run lint`                          | ESLint                                                                                              |
| `npm run format` / `npm run format:fix` | Prettier check / write                                                                              |
| `npm test`                              | Jest — pure logic and repository tests run against real SQLite (`better-sqlite3`), no device needed |

### After installing a package with native code

Any package with a native module (BLE, SQLite, Skia, file system, sharing,
audio, haptics, Reanimated) needs a native rebuild, not just a Metro
reload — re-run `npm run android` / `npm run ios`. A plain JS/TS change
never needs this; Fast Refresh picks it up automatically while `npm start`
is running.

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
