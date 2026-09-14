# 06 — Non-functional & Open Source

## License

**MIT.** Chosen for brevity and permissiveness — this is a personal tool
released as a courtesy, and MIT imposes the least friction on anyone who
wants to adapt it to their own hardware or training protocols.

- `LICENSE` at the repo root, copyright the project owner.
- Third-party attribution lives in `NOTICE.md` (or a README section) rather
  than being scattered. Notably: **Grip Connect**
  ([`Stevie-Ray/hangtime-grip-connect`](https://github.com/Stevie-Ray/hangtime-grip-connect),
  BSD-2-Clause) is the source of the BLE protocol knowledge documented in
  [02-ble-protocol.md](02-ble-protocol.md). Pascal reimplements that logic
  rather than vendoring the package, but the debt is real and should be
  credited explicitly — BSD-2-Clause and MIT are compatible, and crediting
  costs nothing.
- Training-protocol parameters in
  [03-training-and-data-model.md](03-training-and-data-model.md) are drawn
  from published research and from Lattice / Eva López / Eric Hörst
  materials. Those are cited inline; they're facts and methods, not
  copyrightable code, but citation is both honest and useful.

**Not affiliated with Tindeq or Weiheng.** The README must say so plainly,
and must not use their logos or imply endorsement.

## Performance targets

These are the numbers that define "working correctly," not aspirations:

| Target | Value | Rationale |
|---|---|---|
| Sample ingest rate | ~60 Hz sustained (Progressor) | Project-wide constraint; WH-C06 will be lower and that's expected ([02](02-ble-protocol.md)) |
| Dropped samples during a set | **0** under normal conditions | A gap corrupts TUT and impulse — the core metrics |
| Live chart frame rate | 60 fps, no dropped frames during a set | The chart is the primary feedback channel |
| Force readout latency | < 100 ms device-to-screen | Beyond this the feedback feels detached from the pull |
| Zone transition → cue | < 50 ms after threshold crossing | The drop-below cue is the most time-critical signal in the app |
| DB write cadence | batched every 100–200 ms | Never per-sample ([02](02-ble-protocol.md)) |
| Cold start → usable | < 2 s | You open it mid-warm-up |
| Reconnect after dropout | < 5 s | Should recover before the next set |

**The sample pipeline must not be starved by UI work.** Per the project-wide
BLE constraint: buffer incoming samples in a ring buffer, drain on a timer.
No SQLite writes, chart layout, or React re-renders inside the BLE
notification callback.

**Measured, not assumed.** The 60 Hz target in particular depends on the
negotiated connection interval and device firmware batching — it must be
verified on real hardware on both platforms, and the app should be able to
surface its **actual observed sample rate** (on the Device screen) so this is
visible rather than hypothetical.

## Data integrity

Because this is a measurement tool, correctness of recorded data ranks above
almost everything else:

- **Never fabricate samples.** No interpolation, smoothing, or gap-filling
  in stored data. Smoothing (the rolling average from
  [03](03-training-and-data-model.md)) is a *derived metric*, computed from
  raw samples that remain stored as measured.
- **Never silently discard a set.** Aborted, disconnected, and partial sets
  are stored with a status, per [03](03-training-and-data-model.md).
- **Gaps must be explicit.** A disconnect leaves a recorded gap, not a
  flatline to zero ([04](04-screens-and-ux.md)).
- **Derived metrics store their parameters** — smoothing window, tolerance
  band, edge depth, bodyweight at test time. A number without its method is
  not reproducible.
- Local data is the only copy. See [Backup](#backup--data-portability).

## Platform support

- **iOS 15+** and **Android 10 (API 29)+.** Rationale: `react-native-ble-plx`
  and Expo's current SDK support these comfortably, and Android 12's BLE
  permission changes (`BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT`) must be
  handled regardless — supporting back to 10 costs little extra given that.
- **Phone only.** Portrait locked ([04](04-screens-and-ux.md)). No tablet
  layouts, no landscape.
- Both platforms are first-class — the owner's own testing must cover both,
  since the BLE code paths genuinely differ (notably WH-C06 manufacturer
  data on iOS, flagged as the top platform risk in
  [02](02-ble-protocol.md)).

## Build & distribution

- **Expo with a custom dev build** (`expo-dev-client` + EAS Build). Expo Go
  cannot load `react-native-ble-plx`, so Expo Go is never a supported path —
  the README must say this prominently, because it's the first thing a
  contributor will get wrong.
- **Distribution for the owner:** EAS internal distribution (ad-hoc/TestFlight
  on iOS, APK/internal track on Android). No public store release planned
  for v1.
- **A public store release is explicitly out of scope** — it brings review
  processes, privacy declarations, and support expectations that contradict
  the "personal tool" framing. Anyone else who wants Pascal builds it
  themselves; the README must make that buildable without guesswork.

## CI / tooling

Kept deliberately light — CI that's painful to maintain gets disabled.

- **On every push/PR:** TypeScript typecheck, ESLint, Prettier check, and
  unit tests. That's it. Fast, and catches what actually breaks.
- **No EAS build on CI initially.** Builds are triggered manually; automated
  builds burn EAS quota for little benefit on a solo project. Revisit if
  contributors appear.
- **GitHub Actions**, single workflow file.
- **Dependency updates:** Dependabot or Renovate, grouped and monthly —
  useful for a project that may sit idle between training cycles, as long as
  it isn't noisy.

### Testing strategy

BLE hardware can't run in CI, so the test pyramid is shaped around that:

- **Unit-testable and therefore heavily tested:** packet parsers (both
  devices — using canned byte fixtures, as Grip Connect does), metric
  computation (rolling-average peak, TUT bucketing, impulse, asymmetry),
  protocol state machine transitions, percentage-of-max prescription math.
  These are pure functions and where the real correctness risk lives.
- **The emulator ([02](02-ble-protocol.md)) is the integration-test
  substrate** — its named sequences (`steady-hang`, `repeaters`,
  `noisy-pull`, `dropout`, `slow-whc06`) let the full session state machine,
  including disconnect handling, run in CI with no hardware.
- **Manual, on real hardware, before any release:** actual GATT/advertisement
  parsing, sustained sample rate, reconnect behavior, cue timing. This
  cannot be automated and should be a written checklist rather than a vague
  intention.

**A parser regression is the worst possible bug here** — it silently
corrupts training data that looks plausible. Byte-level fixture tests for
both devices are non-negotiable.

## Privacy / data handling

- **Fully offline. No backend, no accounts, no sync, no telemetry, no
  analytics, no crash reporting.** Nothing leaves the device unless the user
  explicitly exports it.
- **No third-party SDKs that phone home.** This is a hard constraint, not a
  preference — it's also what makes the privacy story trivially auditable.
- No personal data is collected beyond what the user enters (bodyweight,
  notes). It stays in the local SQLite database.
- **App store privacy declarations**, should a release ever happen, would be
  "no data collected" — and must remain true.
- Bluetooth and (on Android) location permissions are required for BLE
  scanning; the app must explain *why* in plain language at the point of
  request, since "this training app wants your location" is otherwise
  alarming and is a common reason people deny it.

### Backup & data portability

Offline-only means **the user's training history exists in exactly one
place** — a lost or wiped phone loses years of data. This is the main cost
of the no-backend decision and must be mitigated:

- CSV export ([03](03-training-and-data-model.md)) is the primary escape
  hatch and must include raw samples plus their context.
- A **full database export/import** (or a documented way to extract the
  SQLite file) should exist so a device migration doesn't mean starting
  over. Worth treating as a v1 requirement rather than a nicety.
- The app should periodically remind the user to export if they haven't in a
  long while — quietly, not naggingly.

## Contribution model

- **Personal project, open source as a courtesy.** Issues and PRs are
  welcome but **no response time is promised**, and the owner may decline
  contributions that expand scope. This should be said plainly in the README
  so nobody's time is wasted on a large unsolicited PR.
- **Forking is encouraged** — particularly for other devices or other
  training protocols. Adapting Pascal to your own hardware is a more
  appropriate path than requesting it upstream.
- `CONTRIBUTING.md` is deferred until someone actually contributes; a short
  README section covers it until then.
- **No Code of Conduct file initially** — appropriate to add if the project
  ever attracts a community, premature while it's one person.

## Versioning / release

- **Semantic versioning** on tags (`v0.x` through v1; the schema will move
  before then).
- **Database migrations must be forward-only and tested** — there's no
  backup server to restore from if a migration destroys data. Every schema
  change ships with a migration, and migrations are covered by tests. This
  matters more here than in most apps precisely because the data is
  irreplaceable.
- A `CHANGELOG.md` is worth keeping from the first release, mostly for the
  owner's own memory across training cycles.

## Non-functional open questions

- Should the app enforce a **minimum observed sample rate** before allowing
  a max test (refusing to record a PB from a degraded connection), or just
  record the observed rate alongside the result and let it be interpreted
  later? The second is less paternalistic; the first prevents a bad number
  entering the training-load calculation.
- Whether full-database export lands in v1 or immediately after — it's the
  only real protection against total data loss.
