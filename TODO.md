# Next steps — picked up 2026-10-15

Working as of 2026-10-14: ingest → prediction → private store → daily cron → rules → Web Push →
iPhone, with the companion view behind a password. Five commits, repo
clean, nothing broken. Everything below is new work, not repair.

---

## 1. ~~Decide on the PDFs~~ — DONE 2026-10-19

Both PRDs reviewed and confirmed clean, unignored and committed. `old - apple health/` is
still ignored (superseded experiment, not reviewed) — delete or publish it whenever.

## 2. ~~Push the repo to GitHub~~ — DONE 2026-10-19

Pushed to `ellebrauchle/Cycle-Tracking`, **still private**. 29 files, no `data/`, no `.env`,
no exports. Going public is now the last step on this list.

Note: the pre-commit hook is local. It will not follow a clone unless you run
`git config core.hooksPath .githooks` there.

## 3. PRD update for this week (~1 hr)

New material since the last version — D10, D11, D12 are all written up in the decisions doc:

- [ ] **Manual ingest (D10)** — state it plainly as a scope concession, not a config tweak. The
      chain now has a manual step in the middle and the failure mode is silent. Mitigation
      shipped: the staleness banner.
- [ ] **Privacy enforced by tooling (D11)** — the hook, and that it caught real mistakes
- [ ] **Password gate + companion view (D12)** — the PRD's "view upcoming predictions" is done
- [ ] Update status on PRD must-haves: notifications ✅, companion app ✅, research-backed tips
      ✅ (curated set of 6, sources attached)

## 4. Open product questions (pick one)

- [ ] **Q5 — notification frequency.** You now have real notifications arriving. Live with them
      for a week, then decide. Over-notifying is the thing that kills the project.
- [ ] **Q6 — feedback buttons.** `/api/feedback.js` exists and nothing calls it. Smallest useful
      version: thumbs up/down on "Today's note" in the companion view, stored with the rule id.
      That data is what would eventually answer Q5 with evidence rather than a guess.
- [ ] **Q4 — tips: curated vs RAG.** Currently 6 curated tips with citations. Only worth
      revisiting if they start repeating noticeably.

## 5. Data (ongoing, no deadline)

- [ ] Export from Clue when convenient — still only 2 complete cycles, so confidence stays "low"
      until roughly 4. Say "re-ingest" here and I'll run it.
- [ ] Log symptoms in Clue if you want the deferred symptom features (D6) to become possible —
      they're blocked on data volume, not code.

## 6. Last step — make the repo public

Do this once you're happy with how it reads. It is the one irreversible action here: assume
anything public has been archived by someone, even if you flip it back.

- [ ] Skim the repo on GitHub — README rendering, and the decisions doc, which is what a
      recruiter will actually read
- [ ] Decide on the name and description. It is currently `Cycle-Tracking`, described as
      "pulls personal health data…". `petal-ping` with an engineering-forward description may
      land better on a resume. Renaming is free now, awkward once people have the link
- [ ] Flip to public (`gh repo edit ellebrauchle/Cycle-Tracking --visibility public`)
- [ ] Decide separately whether the live app URL goes in the repo description — the app is
      password-protected, but the URL reveals that it exists

---

## Not doing, and why

- **Re-automating ingest** — rejected today (D10). macOS TCC needs Full Disk Access for the
  whole Python interpreter. Revisit only if you're willing to move the project out of
  `~/Documents`.
- **Heavy-day notification** — hypothesis failed (D5). Needs more cycles before retesting.
- **Symptom-based rules** — deferred (D6), blocked on data.
