# Petal Ping

A personal menstrual cycle tracker that sends predictive, research-backed notifications to one
phone — mine. Built solo for the MIT Sloan AI Builder Space Proseminar (15.S23), Fall 2026.

This is a working tool I use, not a product. It has one user, no accounts, and no growth plan.
That constraint is the point: it let the design optimize for honesty and privacy rather than
for scale.

---

## What it does

1. I export my data from Clue (the tracking app I already use). Clue has no API, so this step
   is manual, every few weeks.
2. `ingest.py` parses the export, reconstructs period episodes and cycle lengths, and predicts
   the next period as a **date window** rather than a single day.
3. It uploads **only that prediction** — never the underlying history — to a private store.
4. A daily job on Vercel reads the prediction, decides whether anything is worth saying today,
   and sends at most one push notification to my iPhone.

The notification might be a heads-up that the predicted window opens in two days, a note that
I'm past it, or — most days — a single research-backed tip relevant to the current phase.

## Architecture

```
  Clue app  ──manual export──▶  iCloud folder
                                     │
                                     ▼
                              ingest.py  (laptop)
                      parse → episodes → prediction
                                     │
                       POST prediction only (shared secret)
                                     │
                                     ▼
                    ┌─────────── Vercel ───────────┐
                    │  private blob store          │
                    │    prediction / subscription │
                    │    sent-log / feedback       │
                    │                              │
                    │  daily cron ──▶ rules engine │
                    │                      │       │
                    │                 Web Push     │
                    └──────────────────────┼───────┘
                                           ▼
                                   PWA on iPhone
```

**Stack:** Python 3 (no dependencies) for ingest; Node serverless functions on Vercel's free
tier; Web Push via VAPID; a PWA added to the iOS home screen. Total running cost: $0.

## Repo layout

| Path | What it is |
| --- | --- |
| `ingest.py` | Parses the Clue export, derives cycles, predicts, uploads |
| `web/api/data.js` | Receives the prediction (POST only, shared secret) |
| `web/api/subscribe.js` | Stores the phone's push subscription |
| `web/api/cron.js` | The daily job: picks at most one notification and sends it |
| `web/lib/rules.js` | Rules engine — when each notification type is allowed to fire |
| `web/lib/store.js` | Thin wrapper over the private blob store |
| `web/public/` | The PWA: manifest, service worker, page |
| `Ongoing Decisions Doc.md` | **The most interesting file here** — see below |
| `.githooks/pre-commit` | Blocks commits containing health data or secrets |

## Start with the decisions doc

If you're reading this to get a sense of how I work, read
[`Ongoing Decisions Doc.md`](Ongoing%20Decisions%20Doc.md) rather than the code. It records
eleven decisions with their reasoning, what was rejected, and — more usefully — what turned out
to be wrong.

A few that are representative:

- **D4 — prediction is statistics, not machine learning.** With two complete cycles observed,
  any model is false precision. The output is a window derived from observed minimum and maximum
  cycle length, and it reports its own confidence as `low` until there are more cycles.
- **D5 — a hypothesis that failed.** A flow-intensity pattern held across the first two cycles
  and looked worth building a notification on. It was marked *Provisional* instead of shipped,
  tested against the next cycle, and did not hold. The feature was deferred. Marking it
  provisional meant its failure cost one paragraph instead of a buggy feature.
- **D9 — four options evaluated for push.** Pushover, ntfy, native iOS + APNs, and PWA + Web
  Push, scored against cost, privacy, and whether feedback buttons were possible. The riskiest
  assumption (that iOS Web Push would work at all) was tested first as a throwaway spike,
  before any UI existed.
- **D10 — automation removed after it never worked.** A scheduled job silently failed for days
  because macOS blocks background processes from reading protected folders. The fix would have
  been granting a general-purpose interpreter access to everything on the machine; the ingest
  step was made manual instead.
- **D11 — privacy enforced by tooling, not discipline.** See below.

## Privacy design

Menstrual data is among the most sensitive categories of personal data, with real legal exposure
in the current US context. The design reflects that:

- **Only conclusions leave the laptop.** The server receives predicted dates and a confidence
  level. It never receives symptom logs, flow values, or the day-level history. It doesn't need
  them to decide when to notify.
- **The blob store is private** — not reachable by URL without a token.
- **No health data in this repo, enforced automatically.** `.githooks/pre-commit` blocks any
  commit that stages a sensitive path, embeds a secret from `.env`, contains logged flow or
  symptom values, or adds an unrecognized JSON file. It has caught real mistakes, including a
  `.gitignore` written with trailing comments — which git treats as part of the pattern, so it
  silently matched nothing.

If you clone this, install the hook:

```bash
git config core.hooksPath .githooks
```

## Status

Working: ingest and prediction, the PWA, push delivery to the phone, the private store, the
daily cron, and the rules engine.

Not yet built: the companion view. `web/public/index.html` is still the diagnostic page from the
push spike — it proves notifications work but shows no predictions. A read endpoint and a real
interface are the current task, along with the password protecting them.

Deferred, with reasons in the decisions doc: symptom-based features (not enough data), the
flow-intensity notification (hypothesis failed), and the choice between a curated tip library
and retrieval over uploaded research.

## Running it

Not really intended to be run by anyone else — it's wired to one phone and one Clue account —
but for completeness:

```bash
./ingest.py --prune        # parse newest export, predict, upload
cd web && npx vercel dev   # run the API locally
```

Requires a `.env` (git-ignored) with VAPID keys, an upload secret, and the app URL.
