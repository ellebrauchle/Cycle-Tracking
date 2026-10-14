# Next steps — picked up 2026-10-15

Working as of 2026-10-14: ingest → prediction → private store → daily cron → rules → Web Push →
iPhone, with the companion view at petal-ping.vercel.app behind a password. Five commits, repo
clean, nothing broken. Everything below is new work, not repair.

---

## 1. Decide on the PDFs (5 min, blocks going public)

Both PRDs and `old - apple health/` are git-ignored because I couldn't read the PDFs to check
them for period dates or screenshots.

- [ ] Open `ElleBrauchle_PRD_PetalPing.pdf` and `PetalPing_Sprint 1_PRD_2.pdf`, look for any
      real dates, flow values or symptom logs
- [ ] If clean: remove `*.pdf` from `.gitignore` and commit them — they're good portfolio material
- [ ] If not: leave ignored, or redact and export a public version
- [ ] `old - apple health/` is two small HTML files from the abandoned Shortcuts approach;
      delete or publish, your call

## 2. Push the repo to GitHub (15 min)

- [ ] Create the repo on GitHub (public)
- [ ] `git remote add origin <url>` then `git push -u origin main`
- [ ] Check the rendered README on GitHub — the ASCII diagram should survive
- [ ] Confirm `data/` and `.env` are absent from the pushed tree

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

---

## Not doing, and why

- **Re-automating ingest** — rejected today (D10). macOS TCC needs Full Disk Access for the
  whole Python interpreter. Revisit only if you're willing to move the project out of
  `~/Documents`.
- **Heavy-day notification** — hypothesis failed (D5). Needs more cycles before retesting.
- **Symptom-based rules** — deferred (D6), blocked on data.
