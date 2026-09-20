# 🏃 Running The Expertise Wins API

This is the **operator's runbook** — everything needed to run and interact with the project *as it currently is*: a terminal CLI that prints channel-ready cards and accepts manual settlement input.

> **Where this fits:** `README.md` explains *what* the project is and *why*. `Roadmap.md` explains *where it's going*. **This file explains how to actually run it.**

---

## What the app is (right now)

A **CLI**, not a server. There is no database, no frontend, and no automated Telegram bot. It has two jobs:

1. **Produce** today's tips as channel-ready text you copy into the channels.
2. **Settle** yesterday's/today's results from input you paste in.

That's the whole loop: **produce → paste → settle → repeat.**

---

## Requirements

* **Node.js** (the scripts are plain `.js`; no build step)
* Dependencies installed once:

```bash
npm install
```

> On Windows, if `node`/`npm` aren't on your `PATH`, invoke them from `C:\Program Files\nodejs\`.

---

## Commands at a glance

| Command | What it does |
|---|---|
| `npm run expertise` | **Full daily run** — scrape → normalize → save → print cards |
| `npm start` | Print cards from the **existing** snapshot (no scraping) |
| `npm run settlement` | **Settle results** from the pasted template and print the settled report |
| `npm test` | Run all tests (freetips + contract + settlement) |
| `npm run test:settlement` | Run only the settlement tests |

---

## 1. Producing today's tips

### Full run (scrape the site and print)

```bash
npm run expertise
```

This runs, in order:

1. `orchestrator/run-freetips.js` — scrapes FreeTips, normalizes to the 26-field contract, saves the snapshot, exports a dated dump, cleans up transient HTML, and runs the test suite.
2. `services/app.js` — prints the day's channel-ready cards.

Output sections (copy these into your channels):

```text
💰 MAXBET TIPS          → Bet-of-the-Day featured cards
💎 VIP TIPS             → other-sport VIP cards
🆓 The Expertise Wins Free Tips
----------------------------------------
             SUMMARY
```

### Just print (no scraping)

If you already scraped and only want the cards again:

```bash
npm start
```

### Scrape for a specific date

```bash
npm run expertise --date=2026-09-17
```

---

## 2. Settling results (manual input)

Results are **not** scraped automatically. You paste them in, and the CLI marks them.

### Step 1 — paste the results into the template

Open:

```text
settlement/settlement-template.txt
```

Paste the day's results in this shape (ticks win/lose, and `🔥` is optional — you can include it as in the source, it's just cosmetic):

```text
[17/09/2026 09:13] Pikk Maxbet VIP: ⚽️ || Besiktas v Marseille
Bet of the Day
Beginning: 23:00 Kenyan Time
Bet: Besiktas Win
Stake: 4 Units

Besiktas have won all six home matches under Vincenzo Italiano. ...

Besiktas Win @1.75 - 4 Units ✅✅
Dusan Vlahovic Anytime Goalscorer @2.10 - 2 Units ❎❎
```

* **`✅`** → win
* **`❎`** → loss

### Step 2 — run the settlement

```bash
npm run settlement
```

By default this settles the **latest** dated dump using the template above.

To be explicit:

```bash
npm run settlement --date=2026-09-17
npm run settlement --date=2026-09-17 path/to/results.txt
npm run settlement path/to/results.txt
```

### What the settlement does

```text
Read dated dump  (settlement/previous-day-results/freetips-<date>.json)
        ↓
Match each tip's fixture + selection against your pasted text
        ↓
Mark outcomes  (win / lose, status = settled) — including nested tips & extraTips
        ↓
Write the annotated dump back to disk
        ↓
Print the settled report
```

In the printed report:

* Paid (Maxbet/VIP) **wins** show `✅🔥`
* Losses show `❎` (no fire)
* Free tips print plain

### Settlement rules (important)

| Situation | Result |
|---|---|
| A tip's line shows `✅` | **win** |
| A tip's line shows `❎` | **lose** |
| A **free** tip is **not present** in your pasted text | **loss** (a free tip you never marked as won is accounted as a loss on your end) |
| A **featured / VIP** tip is not present | left **unsettled** (needs an explicit marker) |

> ⚠️ **Match the text carefully.** The matcher finds the **first** line in a fixture's block that contains the selection text. If one selection is a substring of another on the same fixture, put the more specific line in the position you want it matched — otherwise the wrong marker can be applied.

---

## 3. Where data lives

```text
orchestrator/test-results/freetips.json
    → TODAY's working snapshot (what gets printed)

settlement/previous-day-results/freetips-<DDth Mon YYYY>.json
    → the DATED dump the settlement reads and writes back
```

### How tips accumulate (intentional)

Within the same day, `saveTestResults` **merges** new tips into the snapshot rather than overwriting:

* Existing same-day tips are kept.
* New tips are added, matched by `homeTeam|awayTeam|selection|market`.
* A re-scraped tip with the same key is **updated in place**, not duplicated.

So if you have 5 tips in the morning and 5 more appear later, the snapshot holds **10**. Tips from a *previous* day are dropped from the working snapshot — because they're already preserved in that day's dated dump.

This is deliberate: **a tip is only a win if you mark it as won in the public channel — otherwise it counts as a loss and is accounted for on your end.** The settlement layer enforces exactly that.

---

## 4. Tests

```bash
npm test                 # freetips + contract + settlement
npm run test:settlement  # settlement layer only
```

The settlement tests run against a self-contained throwaway dump and clean up after themselves.

---

## 5. Typical day (copy-paste recipe)

```bash
# 1. Morning — produce today's output
npm run expertise

#    → copy the Maxbet / VIP / Free cards into your channels

# 2. Later / next morning — settle the results
#    (paste the day's results into settlement/settlement-template.txt first)
npm run settlement

# 3. Sanity check
npm test
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `JSON dump not found for date ...` | No dump matches the date and none exists to fall back to. Run `npm run expertise` first to create one, or pass a valid `--date=`. |
| `Text file not found ...` | Your `settlement-template.txt` (or the path you passed) doesn't exist. |
| Settlement marks the wrong outcome | Matcher hit a substring line first — reorder the lines for that fixture (most specific first). |
| `node` / `npm` not found | Use the full path, e.g. `"C:\Program Files\nodejs\npm.cmd" run settlement`. |
| Cards look empty | The snapshot is empty or was reset for a new day. Run `npm run expertise`. |

---

## Not built yet (by design)

These are **not** part of the current CLI and are deferred until the daily workflow is proven:

* a database
* a frontend UI
* an automated Telegram publisher
* automated result scraping

See `Roadmap.md` for where these sit.
