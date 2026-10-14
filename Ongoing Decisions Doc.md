# Ongoing Decisions Doc — Petal Ping

A running log of design and technical decisions for Petal Ping, a personal menstrual cycle
tracking and notification tool. Built solo by Elle Brauchle for the MIT Sloan AI Builder
Space Proseminar (15.S23), Fall 2026.

**Purpose:** capture not just *what* was decided but *why*, and what was rejected. Future-me
(and anyone reading this repo) should be able to understand a choice without re-deriving it.

**Privacy note:** this document deliberately contains no personal health data — no period
dates, no flow values, no symptom logs. Those live in a git-ignored data file. This repo IS
public, so this constraint is live: describe patterns in the abstract, never by their values.
Audited and redacted 2026-10-14 before the first commit.

---

## Status legend

| Status | Meaning |
| --- | --- |
| **Decided** | Settled; change only with a new entry superseding it |
| **Provisional** | Working assumption, not yet validated |
| **Open** | Actively undecided; needs a call |
| **Superseded** | Replaced by a later decision (kept for history) |

---

## D1 — Build from scratch rather than adopt an existing app

**Date:** 2026-09-30 · **Status:** Decided

Petal Ping is being built rather than solved by adopting Flo, Natural Cycles, or Apple
Health's native tracking.

**Why:** three reasons, in honest order — to learn to build software, because the tool will
genuinely be useful to its creator, and to avoid a recurring subscription. Existing tools are
either too limited (Apple Health's prediction is basic) or paid (Flo's useful features).

**Tradeoff accepted:** significantly more work than downloading an app, for a tool that will
start out worse than the paid options at most things.

---

## D2 — Data source: Clue manual export

**Date:** 2026-10-05 · **Status:** Decided

Cycle and symptom data comes from Clue's "Export my data" function, run manually every few
weeks. Each export is a complete history dump, so a new export simply replaces the old one —
no delta handling, no gaps to reconcile.

**Why:** no consumer cycle app offers a usable public API, so some manual step is unavoidable
at the data boundary. Clue's export is rich (all logged types, with dates) and requires zero
setup, which made it the fastest path to real data.

**Tradeoff accepted:** a recurring manual chore, forever, in exchange for better data and no
build effort at the ingest layer.

### Alternatives considered

**Apple Health via a native iOS app (HealthKit)** — *rejected.* HealthKit is readable only
from an app running on-device; there is no server-side or macOS read path. Would require Xcode,
Swift, and a free developer certificate that expires every 7 days and forces a reinstall. Too
much machinery for the benefit.

**Apple Health via iOS Shortcuts** — *rejected for now, viable as a fallback.* Verified that
this iOS version **does** expose menstruation, abdominal cramps, and mood changes to the
Shortcuts "Find Health Samples" action. (An earlier source claimed symptoms were unavailable;
that turned out to be outdated.) This path would have been fully automated, free, and needed
no Xcode. Abandoned because building the export shortcut — `Find Health Samples → Repeat with
Each → Text → Add to Variable → Combine Text → Save File` — proved too fiddly in practice.
Worth revisiting if the manual export becomes annoying; see D3.

**Email the export to Claude and have it fetch the file** — *rejected.* Two fatal problems:
Claude only runs when a session is open, so this isn't automation at all; and Clue's export
arrives as an expiring download link rather than a plain attachment.

**Flo / Natural Cycles as data source** — *rejected.* No individual-accessible API.

---

## D3 — Ingest is a swappable layer

**Date:** 2026-10-05 · **Status:** Decided

The data source sits behind a thin ingest layer. Everything downstream — store, prediction,
notifications, companion app — reads from a normalized internal format and knows nothing about
where the data came from.

**Why:** D2 is the decision most likely to be revisited. Isolating it means switching from
Clue export to Shortcuts (or anything else) later is a contained change rather than a rewrite.

---

## D4 — Prediction is statistics, not machine learning

**Date:** 2026-10-05 · **Status:** Decided

Next-period prediction uses the average/median of observed cycle lengths plus a confidence
window derived from the observed spread. No model training.

**Why:** with only 2 complete cycles on record, there is nothing to train on. Any ML approach
would be false sophistication. The real engineering problem here is *communicating
uncertainty* honestly — a window ("likely Nov 2–5") is both the best available estimate and
the truthful one. A confidently wrong single date is worse than a correct range.

**Consequence:** prediction quality improves automatically as data accumulates, with no code
changes. This is a feature, not a limitation to engineer around.

---

## D5 — Flow intensity is a first-class signal

**Date:** 2026-10-05 · **Status:** Provisional (hypothesis falsified — see test result)

Daily flow values (light / medium / heavy) are retained and used, not just period start dates.

**Why:** an earlier call dismissed flow as adding little — that was correct for predicting
*start dates* but wrong in general. The first two cycles on record shared an apparent
mid-period intensity peak, which looked like it would support a "heavy day likely tomorrow"
notification.

### Test result (2026-10-07) — the pattern did not hold

The pattern was treated as a prediction for the next cycle and **failed** — that cycle showed
no intensity peak at all. Two cycles matched, the third did not.

**Consequence:** the "heavy day likely tomorrow" notification is **deferred**, not shipped.
Retaining flow data is still correct, but there is no usable intensity pattern yet.

**Why this is the right outcome anyway:** this is exactly the failure mode D4 exists to guard
against. A pattern that held twice was marked Provisional rather than built on, so its failure
cost nothing but a line in this document. Keep treating two-observation patterns this way.

---

## D6 — Symptom features deferred pending data

**Date:** 2026-10-05 · **Status:** Decided (unblocked 2026-10-07)

Symptom prediction and trend alerts are deferred. The data model accommodates symptom records;
no features are built on them yet.

**Why:** the first Clue export contained **zero** symptom records — every record was a period
entries. Separately, symptom correlation would need far more history than exists even if
logging started today. Deferring costs little this sprint.

**Unblocked 2026-10-07:** the second export confirmed symptoms **do** come through (Q1 resolved).
Clue is viable as a symptom source and D2 does not need revisiting. Features stay deferred on
data volume alone — 4 symptom records is not enough to predict anything.

### Symptom record shapes observed

Symptom records do not share one schema, so the parser must branch on `type`:

| Type | Value shape | Example |
| --- | --- | --- |
| `period` | object with `option` | `{"option": "<flow level>"}` |
| `feelings` | **list** of objects | `[{"option": "<mood>"}]` |
| `sleep_duration` | object with `minutes` | `{"minutes": <n>}` |

Expect more shapes as more symptom types get logged. `ingest.py` currently stores non-period
records verbatim rather than guessing at a unified schema — deliberately, so new shapes surface
instead of being silently coerced.

---

## D7 — Notification runtime must not depend on Claude or the laptop

**Date:** 2026-10-05 · **Status:** Decided

The scheduled job that computes predictions and sends notifications runs on infrastructure
that is always awake — not in a Claude session, and not on the laptop.

**Why:** the laptop sleeps, and Claude only exists during an open session. Either dependency
means the 6am notification silently never fires. Claude is the tool that *builds* the pipeline,
not a component *inside* it.

---

## D8 — Keep personal health data out of version control

**Date:** 2026-10-05 · **Status:** Decided

The Clue export and any derived data store are git-ignored from the first commit. The repo
contains code and documentation only. If a companion app is ever exposed to the internet, it
requires authentication.

**Why:** menstrual data is among the most sensitive categories of personal data, with real
legal exposure in the current US context. Cheap to get right at the start; genuinely painful
to retrofit after a leak.

---

## D9 — Notifications via PWA + Web Push, hosted on Vercel free tier

**Date:** 2026-10-07 · **Status:** Decided (with a defined fallback)

The companion app is a Progressive Web App added to the iPhone home screen, and it is also the
notification endpoint via Web Push. Hosting, push endpoint, and daily scheduler all run on
Vercel's free tier.

**Why:** evaluated against four criteria, three of which pointed here unanimously —

| Criterion | Answer | Implication |
| --- | --- | --- |
| Companion app timing | Wanted **this sprint** | PWA delivers app + notifications in one build |
| Message privacy | **Prefer to keep private** | Own server; no third party holds message content |
| Feedback buttons (PRD Q6) | **Yes, wanted** | Real actionable buttons need PWA or native |
| Setup friction tolerance | "Depends how fiddly" | The only criterion arguing against — see fallback |

**Cost:** $0. No Apple Developer Program, no subscription. Satisfies the no-recurring-cost goal
from D1.

### Alternatives considered

**Pushover** — *rejected.* $5 once, most reliable, lowest effort, and the shortest path to a
working notification. Rejected only because it's a throwaway channel: it would be replaced the
moment the companion app exists, and the app was wanted this sprint.

**ntfy (free public server)** — *rejected as primary, retained as fallback.* Free and simple,
but on the public `ntfy.sh` server the topic name is the only secret — anyone who guesses it
can read the messages. Too thin for menstrual health data under D8. Self-hosting fixes this but
costs the simplicity that was its main advantage.

**Native iOS app + APNs** — *rejected.* Requires the $99/yr Apple Developer Program; push does
not work on free accounts. Directly contradicts D1.

### Known risk and fallback — RESOLVED 2026-10-07

iOS Web Push was the least reliable of the options considered. It requires the PWA be added to
the home screen (push does not work from a Safari tab), and iOS has a history of silent
permission failures that are unpleasant to debug.

**Mitigation taken:** built the push plumbing first, before any UI, as a time-boxed spike —
a stateless endpoint that accepted a subscription and immediately pushed back to it, with no
storage, no prediction wiring and no interface. The single question was whether a push would
land on the phone.

**Outcome: it worked on the first attempt.** Permission granted, subscription created, test
notification delivered to the iPhone. The ntfy fallback is **not needed** and D9 stands without
qualification.

**Worth keeping:** the spike page prints its own diagnostic log on screen (standalone status,
service worker state, permission result, server response). There is no browser console on iOS,
so this stays in place as the debugging surface for any future push problem.

---

## D10 — Ingest is run manually on request, not on a schedule

**Date:** 2026-10-14 · **Status:** Decided

Steps 2–3 of the data chain — parse the newest Clue export, recompute the prediction, upload it
to the server — are run by hand, by asking Claude to "re-ingest" in a session (or by running
`./ingest.py --prune` in Terminal). The `launchd` agent that ran this every 6 hours is removed.

This does **not** weaken D7. The notification runtime is unchanged: Vercel's daily cron still
sends without the laptop or a Claude session. What is now manual is only the refresh of the
*input* to that cron, which changes every few weeks rather than every six hours.

**Why:** the scheduled agent never worked. macOS TCC protects `~/Documents` and iCloud Drive
per-application. An interactive run inherits Terminal's grant and succeeds; `launchd` starts
`/usr/bin/python3` with no grant of its own, cannot show a permission prompt from a background
agent, and fails silently. All five logged runs died with `Operation not permitted` before
opening the script.

The workarounds were each worse than the loss:

| Option | Rejected because |
| --- | --- |
| Full Disk Access for `/usr/bin/python3` | Grants the *interpreter*, not the script, read access to all of Documents, Desktop, iCloud, Mail, Messages and Photos. Any Python run through that binary inherits it. macOS offers no per-folder scoping here — the Files-and-Folders list only shows apps that prompted, and a background agent never prompts |
| Move the project out of `~/Documents` | Works with no grant at all, but takes the project out of the course folder and the exports out of iCloud. Reconsider if automation is wanted back — moving only `ingest.py`, `data/` and the exports is the smaller version |
| App-bundle wrapper that prompts for its own folder access | Real, but fiddly to build and prompts at unpredictable moments |

**Cost accepted:** nothing warns when the stored prediction goes stale. If an export is taken
and ingest is not run, the daily cron keeps notifying against an old window. `generated_at` is
already in the uploaded payload — the companion view should surface it so staleness is visible
rather than silent.

**Why this is tolerable:** the input is manual anyway. Clue has no API (D2), so new data only
exists after a manual export every few weeks. A 6-hour schedule was mostly re-uploading an
identical prediction.

---

## Open questions

| # | Question | Why it matters | Needed by |
| --- | --- | --- | --- |
| ~~Q1~~ | ~~Do symptoms logged in Clue actually appear in its export?~~ | **Resolved 2026-10-07: yes.** `feelings` and `sleep_duration` records came through in the second export. See D6. | — |
| ~~Q2~~ | ~~Which push service?~~ | **Resolved 2026-10-07: PWA + Web Push**, with ntfy as fallback. See D9. | — |
| ~~Q3~~ | ~~Where does the scheduled job run?~~ | **Resolved 2026-10-07: Vercel free tier** — hosting, push endpoint and daily cron in one place. See D9. | — |
| ~~Q7~~ | ~~Where do push subscriptions and cycle data get stored server-side?~~ | **Resolved 2026-10-14: private Vercel Blob store** (`lib/store.js`) holding the push subscription, the uploaded prediction, a sent-log and feedback. Only the prediction conclusion is uploaded; the full history stays on the laptop (D8). Verified end to end 2026-10-14. | — |
| Q4 | Research-backed tips: curated static library, or RAG over uploaded articles? | A curated set avoids hallucinated health claims for ~40 items of content; RAG is more machinery and more risk | Before the tips feature |
| Q5 | Ideal notification frequency? | Over-notifying gets the app muted, which kills the project | After first real notifications ship |
| Q6 | How to incorporate feedback (thumbs up/down per notification)? | Carried over from PRD; unclear if upfront or post-launch | Not blocking |

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-07 | Document created. Backfilled D1–D8 and Q1–Q6 from prior sessions. |
| 2026-10-07 | `ingest.py` written — parses newest Clue export, normalizes, predicts. Exports accumulate (not overwritten); script always reads the newest by date in folder name. |
| 2026-10-07 | **Q1 resolved:** symptoms do export from Clue. D6 unblocked; symptom record schemas documented. |
| 2026-10-07 | **D5 hypothesis falsified:** the third cycle did not reproduce the intensity pattern seen in the first two. Heavy-day notification deferred. |
| 2026-10-07 | **Q2 + Q3 resolved** by D9: PWA + Web Push on Vercel free tier. Pushover, ntfy and native APNs evaluated and rejected; ntfy retained as fallback. |
| 2026-10-07 | **Push spike succeeded on first attempt.** PWA deployed to `petal-ping.vercel.app`; test notification delivered to iPhone. D9's ntfy fallback no longer needed. |
| 2026-10-07 | **Q7 opened:** push subscriptions and cycle data both need server-side storage before the daily cron can send anything. |
| 2026-10-14 | **Q7 resolved:** private Vercel Blob store built — subscription, prediction, sent-log, feedback. Pipeline verified end to end: ingest uploaded, cron dry-run selected a rule. |
| 2026-10-14 | Push subscription re-created from the phone and persisted (the spike had been stateless, so nothing could send). |
| 2026-10-14 | **D10:** `launchd` ingest agent removed after never once succeeding — macOS TCC blocks `python3` under `launchd`. Ingest is now run on request ("re-ingest"). Full Disk Access and moving the project were both considered and rejected. |
| 2026-10-14 | **Privacy audit before first commit.** D5 and D6 redacted — flow values and symptom examples replaced with abstract descriptions; the reasoning is unchanged. `.gitignore` rewritten to name sensitive paths explicitly (the earlier `*.json` blanket rule would have excluded `vercel.json` and `manifest.json` and broken the deploy). Repo made public for portfolio purposes; PDFs and the old Apple Health folder left ignored pending review. |
