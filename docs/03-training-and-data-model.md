# 03 — Training & Data Model

## Core training loop

Pascal is built around one central loop, per [01-overview.md](01-overview.md):

1. **Test** — run a max-effort protocol (block pull) to establish a current
   max, **per hand**.
2. **Prescribe** — training sets are defined as a **percentage of a recorded
   max**, not an absolute force, so load stays correct as the max changes.
3. **Train** — run training sets against that percentage target, measuring
   **time spent with force inside a tolerance band** around the target,
   since a human can't hold an exact force number.
4. **Review** — log everything, track progression of max and training load
   over time, including left/right balance.

Everything below supports that loop specifically, not generic workout
logging.

## Modality: block pull, not hangs

Pascal measures **block pulls** — pulling an edge upward from the ground
against a floor-anchored load cell. This is deliberate and has consequences
that must not be blurred:

- **Bodyweight is not in the load path.** The device reads applied force
  directly. This is fundamentally different from hangboard hangs, where
  total load = bodyweight + added weight.
- **Normalization differs.** For hangs the convention is
  `(bodyweight + added) / bodyweight × 100`, giving values >100%. For block
  pulls it's simply `force / bodyweight × 100`, and typical one-hand values
  are roughly **40–60% of bodyweight**.
- **There is no published conversion between block-pull and hang numbers.**
  Sources explicitly decline to give one. If hang-style exercises are ever
  added, they must be a separate exercise type with separate normalization —
  never mixed into the same progression chart.

## Defining "max" — this is a spec decision, not an implementation detail

**Max is the peak of a rolling-average force curve, not the peak
instantaneous sample.** Raw instantaneous peak is noisy and overstates true
max.

This follows the peer-reviewed Tindeq validation study (Labott et al. 2022),
which applied a **3-second moving average** to the force curve and took the
maximum of the smoothed result. That study recorded at 80 Hz and reported
validity ICC 0.99 against a Kistler force plate, between-day reliability
ICC 0.95, CV ≤ 8.2%.

Design requirements that follow:

- The **averaging window is a stored parameter on every max record**, not a
  global constant. A "peak 1s average" and a "peak 3s average" are not
  interchangeable; if the window ever changes, historical records must
  remain interpretable.
- **Default window: 1 s (best rolling 1-second average).** Rationale: Labott's
  3 s window was tied to a 3 s pull — it effectively averages the entire
  plateau. Pascal's default pull is 3–5 s, and a 3 s window on a 5 s pull
  would drag the force ramp-up into the average and understate true max. A
  1 s window still averages ~60 samples at 60 Hz (ample noise rejection)
  while staying inside the plateau. The window remains configurable, and a
  3 s window should be used if replicating Labott's protocol exactly.
- Also store the raw instantaneous peak as a **secondary** field — useful
  for display and sanity-checking, never as the basis for prescribing load.

**Max rule: single best attempt.** The best smoothed peak across the
attempts for that hand becomes the max. (The validation study used
"best 2 of 3, averaged", which is more robust to a flukey attempt — noted as
a possible future option, but v1 uses single best attempt.) The rule is
stored on each max record so the meaning stays unambiguous if it ever
changes.

## Protocols

### Max-effort test (block pull)

Establishes the baseline. Sources disagree on parameters; Pascal should make
them configurable with defaults drawn from the load-cell-specific literature
rather than the hang-based literature.

| Parameter | Default | Source / note |
|---|---|---|
| Pull duration | 3–5 s | Labott 3 s; Camp4/critical-force work 5 s |
| Attempts per hand | 3 | Labott 3; Tyler Nelson 3–4 |
| Rest between attempts | 90 s – 3 min | Labott 90 s; Nelson 3–4 min between sets |
| Force onset | slow ramp, not a jerk | Tyler Nelson's load-cell block-pull guidance |
| Max metric | peak of 3 s rolling mean | Labott (see above) |

Note the competing convention: **Lattice uses 7 s weighted hangs**, where
"max" is a load survived for 7 s, not a force reading. That's the dominant
convention in the broader climbing community but doesn't fit direct force
measurement. Pascal implements the 3–5 s load-cell convention and should say
so in-app where a number might be compared against Lattice-style figures.

**Warm-up** (Labott, standardized — worth offering as a guided option):
2 min general mobility + light band pulling, then four submaximal sets at
3 s on / 3 s off, 60 s between sets, at roughly RPE 4 / 6 / 6 / 8.

### Target-band training set

The core training mode, and Pascal's main differentiator.

- User picks: exercise, source max, target % of max, tolerance band, work
  duration, rest, number of sets.
- **Time-under-tension accumulates while force is at or above the lower
  bound** — i.e. `force >= target − tolerance`. Pulling harder than the
  target still counts as working; only falling *below* the band stops the
  clock.
- Time is still **bucketed** three ways for review — in-band, above-band,
  below-band — so a set held consistently on-target is distinguishable from
  one that overshot throughout, even though the first two both count toward
  TUT. The buckets are descriptive; the TUT total is the prescriptive
  number.

Rationale for counting above-band time: the training intent is "work at
least this hard for this long." Overshooting is imprecise, not a failure to
train, and stopping the clock for it would perversely penalize a harder
pull. The above-band bucket still surfaces overshoot so persistent
overshooting can be spotted — it may indicate the target % is set too low,
or that the source max is stale.

**Honesty note:** no established protocol in the literature defines a
tolerance band around a target force — this is a Pascal design decision, not
a published method. The closest academic grounding is work on optimizing
intermittent finger endurance tests with respect to *deviation in force and
pulling time* (PMC9168274). Worth stating plainly rather than implying
scientific backing it doesn't have.

Consider also recording **impulse** (force × time) alongside band-TUT —
impulse is the literature-standard "true" work measure and weights *how hard*
you pulled, not merely whether you were inside a band. Band-TUT is the
prescriptive metric; impulse is the more defensible descriptive one.

### Repeaters

The classic protocol: **7 s on / 3 s off × 6 reps**. Origin is genuinely
unclear ("lost to history"); popularized by Eric Hörst, researched by the
Anderson brothers.

Two established parameter sets that disagree, because "set" means different
things:

| | Hörst / classic | Lattice (anaerobic capacity) | Lattice (aerobic power) |
|---|---|---|---|
| Reps | 6 × (7s/3s) | 5 × (7s/3s) | 12 × (7s/3s) |
| Intensity | 60–80% MVC (40–50% beginners) | 80% of max | 50–60% of max |
| Rest between sets | 12–15 min | 2.5 min | 4 min |
| Rest between grips | 2–3 min | — | — |

The 12–15 min vs 2.5 min gap is *not* a contradiction — Hörst's "set" is a
full circuit of 3–7 grip positions, Lattice's is one 50 s block. See
[Naming: rep / set / block / session](#naming-rep--set--block--session).

**In scope for v1.** Repeaters map cleanly onto the target-band model — same
in-zone logic, windowed into on/off cycles — so they need rep structure
fields (`repWorkMs`, `repRestMs`, `repCount`) and per-rep metric rollup, but
no new concepts. Defaults: Lattice's anaerobic-capacity parameters (5 reps of
7s/3s at 80% of max, 2.5 min between sets), since they're specified as a
%-of-max and therefore fit Pascal's prescription model directly; Hörst's
60–80% MVC range and longer circuit-based rest are available as an
alternative preset.

### Critical Force test — post-v1

Developed by David Giles' group at Lattice / University of Derby. Measures
sustainable finger-flexor intensity — endurance capacity rather than peak
strength.

**Deferred past v1**, for two reasons: it needs analysis machinery nothing
else needs (plateau detection, CF/W′ computation, a handled "no plateau"
outcome), and it measures endurance while 01-overview.md's stated v1 goal is
strength testing and percentage-based strength training. Documented here
because the data model should not *preclude* it — an all-out CF test is
structurally a repeater set with no target band, so `Set.kind` will need a
third value later rather than a restructure.

- Protocol: **7 s on / 3 s off for 4 minutes = 24 contractions**, all-out,
  unilateral.
- **Two competing output definitions** — make the window configurable:
  - **CF** = mean force of the last 30 s (final 3 contractions); some
    sources use the last 6 contractions
  - **CFmin** = mean of the lowest force value in the last three
    contractions — found *more* reliable in 2024 validation
- Reported as **CF/PF (% of peak force)** rather than absolute. Typical:
  CF ≈ 20.1 ± 5.7 kg ≈ 38.8 ± 8.8% of MVC.
- **W′** = impulse accumulated above CF (finite anaerobic capacity).
- Caveats worth encoding: the common "40% MVC" endurance rule of thumb does
  *not* reliably match individual CF — which is the whole argument for
  measuring it. And **~6% of climbers never reach a force plateau**;
  validated for climbers redpointing ≥ f7a / bouldering ≥ V5. **"No plateau
  detected" must be a real, handled outcome, not an error state.**

### Submaximal / density ("Abrahangs")

Low-intensity, high-frequency protocol popularized by Emil Abrahamsson.
Citable parameters from the 2024 controlled study:

- **~40% of max**, 10 s holds / 20 s rest, ~10 min total, 18–22 mm edge,
  ≥3 sessions/week.
- Popular write-ups cite 10 s / 50 s and 70–80% effort; these trace to
  secondary sources. **Prefer the study's 40% and 10 s/20 s.**
- Honest results framing: Abrahangs alone **+2.5% (non-significant)**; max
  hangs alone +3.2% (p=0.0005); **combined +5.8% (p<0.01)**. The popular
  "as effective as max hangs" claim is overstated — the real finding is
  *additive when combined*. Don't let the app imply otherwise.

## Bilateral (left/right) training structure

**Pascal trains both hands.** This is a first-class structural concern, not
a tag on a set.

### Execution order

The established practice for unilateral load-cell work is **alternate hands
with minimal rest between them, then take a longer rest after both**:

```
Set N:  [left hand work] → short inter-hand rest → [right hand work]
        → long inter-set rest → Set N+1
```

- **Inter-hand rest:** short. Tyler Nelson's block-pull protocol uses
  **~5 s between hands**. (One-arm *hang* protocols use 90 s — but that's a
  different modality; the 5 s figure matches Pascal's.) Default short,
  configurable.
- **Inter-set rest:** the real recovery, after both hands. Defaults by goal:
  - Max strength: **3 min** (range 2–5; Lattice 2 min, López 3–5 min)
  - Anaerobic capacity / repeaters: **2.5–3 min**
  - Aerobic power: **4 min**
  - Submaximal density: **20–50 s**

### Data model consequence

A **Set contains two Efforts** (left and right), rather than left and right
being separate sets. This matters because:

- Rest timing is a property of the set (after both hands), not of each hand.
- Left/right comparison is naturally scoped — same set, same conditions.
- Session volume counts sets, not hand-reps, matching how it's prescribed.

Single-handed work must still be representable (injury, rehab, deliberate
one-sided work) — a Set with one Effort is valid, not an error.

### Asymmetry tracking

Track per-exercise left/right difference over time, as both absolute kg and
percent.

**Be honest about the evidence here.** Lattice's own dataset shows the
average L/R difference is small (**~1.6 kg**) and many climbers show none.
Lattice explicitly **declines to set a threshold** and states that whether
correcting imbalance is beneficial "is not clear so far." The widely-repeated
**>10% threshold has no climbing-specific support** — it's a general
strength-and-conditioning return-to-sport convention. The only climbing-adjacent
sourced figure is **5%**.

So: make the flagging threshold **user-configurable, default 5%**, and label
it in-app as a heuristic rather than an evidence-based cutoff. Show the trend;
don't nag.

(Supporting Pascal's design: bilateral protocols *mask* asymmetry — dedicated
unilateral testing is the recommended way to quantify it.)

## Naming: rep / set / block / session

Deliberately disambiguated, because the literature uses "set" inconsistently:

- **Rep** — one contraction (e.g. one 7 s pull in a repeater block).
- **Effort** — all reps performed by **one hand** within a set.
- **Set** — one left Effort + one right Effort, plus the rest that follows.
- **Session** — one workout: many sets, possibly across multiple exercises.

Pascal uses these terms consistently in code, schema, and UI.

## Metrics captured per rep / set

Per **Effort** (one hand):

- **Peak force (smoothed)** — peak of the rolling mean; the primary metric.
  Stores its window size.
- **Peak force (instantaneous)** — secondary/display only.
- **Mean force** over the active window.
- **Time under tension** — total ms with `force >= target − tolerance`; the
  prescriptive metric for target-band sets.
- **Time in band / above band / below band** — descriptive breakdown. TUT =
  in-band + above-band.
- **Impulse** (∫force·dt) — the literature-standard work measure.
- **Time to target** — ms from set start to first entering the band; for
  max-effort tests, **time to peak**.
- **Fatigue index / decay slope** — across reps within an Effort; the basis
  of endurance assessment.
- **Raw force curve** — retained for review/replay.

Per **Set**: left/right values for each of the above, plus derived
**asymmetry** (absolute and %).

### On RFD — deliberately limited

Rate of force development is a real metric (elite climbers differ at
50–150 ms) but is **the least reliable metric** in the 2025 systematic
review, which advises against the earliest phase in typical setups.

At Pascal's ~60 Hz (16.7 ms/sample), **RFD at 50 ms would rest on ~3
samples** — not defensible. Decision: **do not expose RFD below 200 ms**,
if at all. Prefer the more robust alternative: **time to reach a given
force threshold** (e.g. time to 25%/50%/75% of bodyweight).

## Exercise / movement

A max is only meaningful relative to the exercise it was tested on — 80% of
a block-pull max is meaningless as a target for a different grip. So
exercise is a first-class entity:

- Fields: name, grip type (e.g. half-crimp, open-hand), **edge depth in mm**,
  modality (block pull vs hang — drives normalization), notes.
- **Edge depth is not optional metadata.** The 2025 systematic review
  recommends fixed **20–23 mm** edges for standardized monitoring; comparing
  maxes across different edge depths is invalid. Pascal should refuse to
  treat two different edge depths as the same exercise.
- A small user-defined set is enough for v1 — not a public exercise library.

## Session model

- **Session** — one workout: date/time, optional notes/tags, **bodyweight at
  time of session**. Contains ordered Sets.
- **Set** — belongs to a Session and an Exercise. Kind: `max_effort` or
  `target_band`. Contains one or two Efforts. Training sets reference the
  **specific max they were prescribed from**, so history stays traceable
  ("this targeted 80% of the max recorded 2026-08-01") even after a newer
  max lands.
- **Effort** — one hand's work within a Set; owns the reps, metrics, and
  samples.
- Added load and device are captured at the level they can vary.

## Data model (conceptual)

Conceptual shape only — literal SQLite DDL belongs in
[07-architecture.md](07-architecture.md).

```
Exercise
  id, name, gripType, edgeDepthMm, modality: "block_pull" | "hang", notes

Session
  id, startedAt, bodyweightKg, notes

Set
  id, sessionId -> Session
  exerciseId -> Exercise
  kind: "max_effort" | "target_band"
  order

  # target_band only
  sourceMaxEffortId -> Effort   # nullable; the max this % was based on
  targetPercent, targetForceKg, toleranceBandKg
  plannedWorkMs, plannedRestAfterMs
  # repeaters: rep structure, nullable
  repWorkMs, repRestMs, repCount

  interHandRestMs, interSetRestMs

Effort
  id, setId -> Set
  hand: "left" | "right"
  startedAt, endedAt
  status: "completed" | "aborted" | "disconnected"
  addedLoadKg
  deviceType, deviceSequence     # Emulator sequence name when applicable

  # derived metrics, computed once at effort end and stored
  peakForceSmoothedKg, smoothingWindowMs
  peakForceInstantKg
  meanForceKg
  impulseKgS
  timeUnderTensionMs                              # in-band + above-band
  timeInBandMs, timeAboveBandMs, timeBelowBandMs  # descriptive breakdown
  timeToPeakMs, timeToTargetMs
  fatigueIndex

MaxRecord                        # denormalized for fast prescribe/lookup
  id, exerciseId -> Exercise, hand
  effortId -> Effort             # provenance
  forceKg, smoothingWindowMs     # default window 1000 ms
  rule: "best_attempt"           # v1 always single best attempt
  bodyweightKgAtTest
  recordedAt

Sample
  id, effortId -> Effort
  offsetMs                       # relative to effort start, avoids clock drift
  forceKg
```

`Sample` is by far the highest-volume table (~60 Hz × duration × 2 hands) —
batched inserts per the project-wide BLE constraint (buffer, drain every
100–200 ms), never per-sample writes. Indexing strategy → 07.

**Normalization is derived, never stored as the source of truth.** Store
absolute kg plus the bodyweight at time of test; compute
`force / bodyweight × 100` on read. A bodyweight change must never
retroactively corrupt history.

**Partial/aborted efforts:** keep samples captured so far and mark status
(`aborted` / `disconnected`) rather than discarding — consistent with the
disconnect handling in [02-ble-protocol.md](02-ble-protocol.md).

## History & progress views

- **Max progression** — per exercise **per hand**, trend of smoothed peak
  force. The headline "am I getting stronger" view. Toggle absolute kg vs
  % bodyweight.
- **Asymmetry trend** — L/R difference over time per exercise, with the
  configurable threshold shown as a reference line, not an alarm.
- **Training load history** — % of max actually trained at over time, and
  time-under-tension (and impulse) accumulated per session/week.
- **Session list / detail** — drill into a session → its sets → each hand's
  force curve, reusing the live-test chart component
  ([04-screens-and-ux.md](04-screens-and-ux.md)).
- **Personal bests** — per exercise per hand: current max, when set.

## Export

Required for v1 per 01-overview.md.

- **Format:** CSV. Raw samples with their Effort/Set/Session context must
  both be exportable — not just summary numbers. Exact shape (one wide table
  vs. paired summary + samples files) → 07.
- Export must include **smoothing window and edge depth**, without which the
  numbers aren't interpretable by anyone else.
- **Trigger:** share sheet (`expo-sharing`). No backend — consistent with
  offline-first.
- JSON export: secondary, non-blocking.

## Resolved decisions

- **Above-band time counts toward TUT** (clock stops only below the lower
  bound); the three-way bucket breakdown is kept for review.
- **Max rule: single best attempt.** Best-2-of-3 noted as a future option.
- **Default smoothing window: 1 s**, configurable, stored per record.
- **Repeaters: in v1.** **Critical Force: post-v1**, but the model must not
  preclude it.

## Open questions

- Confirm the default tolerance band width (±5% of target? ±2 kg?) — needs
  real-hardware feel-testing, since it governs how punishing the in-band
  clock is. Likely needs to differ for max-effort vs. endurance work.
- Whether `Set.kind` should already include an `all_out` variant now (for CF
  later) or be migrated when CF is actually built.

## Sources

Training-science claims above are grounded in:

- [Labott et al. 2022 — Tindeq validity & reliability (Frontiers)](https://tindeq.com/wp-content/uploads/fspor-04-838358.pdf) — 3 s moving average, ICC/CV, warm-up
- [Reliability of finger strength assessment methods in climbing: systematic review (2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12521219/) — ICC ranges, 20–23 mm edges, RFD reliability
- [Measuring critical force in sport climbers: 4-min all-out validation](https://pmc.ncbi.nlm.nih.gov/articles/PMC11365833/) — CF vs CFmin
- [Giles et al. — all-out test for finger flexor critical force](https://eprints.glos.ac.uk/8771/1/8771-Fryer-(2020)-An-all-out-test-to-determine.pdf)
- [Effects of Different Loading Programs on Finger Strength in Rock Climbers (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11576708/) — Abrahangs
- [Lattice Testing & Training Rung Instructions (PDF)](https://latticetraining.com/app/uploads/2018/06/1528799872597_180503_Lattice-Testing-Training-Rung-Instructions.pdf)
- [Lattice — Do strength imbalances make a difference in climbing?](https://latticetraining.com/blog/do-strength-imbalances-make-a-difference-in-climbing/) — ~1.6 kg average asymmetry
- [Eva López — Fingerboard Training Guide II](https://en-eva-lopez.blogspot.com/2018/05/fingerboard-training-guide-II-Maxhangs-SubHangs-and-Inthangs-methodology.html)
- [Eric Hörst — the 7/3 Repeater protocol](https://trainingforclimbing.com/hangboard-finger-training-repeaters/)
- [StrengthClimbing — Dr. Tyler Nelson's active finger strength protocols](https://strengthclimbing.com/dr-tyler-nelsons-new-active-finger-strength-training-protocols/) — block pull, 5 s between hands
- [Hooper's Beta — training finger strength with block pulls](https://www.hoopersbeta.com/library/how-to-train-finger-strength-with-no-hangs) — 40–60% BW benchmark
- [Camp4 — Critical Force in Climbing](https://www.camp4humanperformance.com/research/critical-force-climbing-test)
- [Optimization of an intermittent finger endurance test](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9168274/) — force/time deviation
