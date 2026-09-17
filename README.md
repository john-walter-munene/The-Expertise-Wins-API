# The Expertise Wins API

> 📣 **Live channel (proof this is running in production):** [The Expertise Wins — Telegram](https://t.me/+D_jIXFB807E0NmRk)
>
> The tips this project produces and settles are published here every day.

The **Expertise Wins API** is the backend and data pipeline behind the **The Expertise Wins** betting-tip operation.

Its immediate purpose is practical: collect predictions from a small number of trusted external sources, normalize them into a common format, curate and organize them, and turn them into reliable daily outputs for **The Expertise Wins channels**, initially through Telegram.

The project may eventually become a reusable API and data service for other products, tipsters, or clients. But the current priority is deliberately smaller:

> **Build the machine I need, use it every day, prove the workflow, then expand it.**

## Where it is right now (TL;DR)

Today this is a **terminal CLI**, not a server. It has two jobs:

1. **Produce** — scrape and print channel-ready cards (Maxbet VIP / VIP / Free Tips) that the operator **pastes straight into the channels**.
2. **Settle** — the operator pastes the day's results in, and the CLI marks each tip win/lose on the dated dump and prints a settled report.

There is **no database, no frontend, and no automated Telegram bot yet** — and that is intentional. The project is currently being **tested as a CLI, day to day**, before deciding what to build next.

> 📘 **To actually run it, see [`Run.md`](./Run.md)** — the operator's runbook. This README explains *what* and *why*; that file explains *how*.

---

## 🎯 Current Product Direction

The project started with a broader vision of building centralized tip infrastructure for multiple applications. That vision still exists, but the development strategy has changed.

The first product is **The Expertise Wins itself**.

The immediate workflow is:

```text
External Tip Sources
        │
        ▼
     Scrapers
        │
        ▼
 Normalized Tips
        │
        ▼
  Curation / Rules
        │
        ▼
 Consumption / Formatting
        │
        ├───────────────┐
        ▼               ▼
   FREE OUTPUT     PAID OUTPUT
        │               │
        └───────┬───────┘
                ▼
        Telegram Channels
                │
                ▼
        Results / Records
                │
                ▼
       Improve the System
```

The goal is not to build a giant prediction database before anyone uses it.

The goal is to create a **repeatable daily operating system for producing and publishing tips**.

---

# 🧠 Product Philosophy

The project is built around a simple principle:

> **First make it work. Then make it better.**

The system automates a workflow that has already been personally validated rather than attempting to invent an untested workflow from scratch.

The project should progressively remove repetitive work:

```text
Find sources
    ↓
Collect tips
    ↓
Normalize tips
    ↓
Review / curate
    ↓
Assign to free or paid output
    ↓
Format
    ↓
Publish
    ↓
Record results
    ↓
Learn
```

The software is the machine behind this workflow.

---

# 🆓 Free + 💎 Paid Model

The initial distribution model deliberately has both free and paid tiers.

## Free

The free tier exists primarily to:

* introduce people to The Expertise Wins
* demonstrate consistency
* provide useful selections
* build an observable track record
* create a path toward the paid products

Free output is intentionally more limited than paid output.

The current consumption layer renders free tips as a distinct section of the output, kept intentionally plain so they read differently from the paid cards:

```text
🆓 The Expertise Wins Free Tips
fixture
Selection @odds - N Units
```

Free cards are designed to be simple and easy to consume.

## Paid

The paid side is where the more curated service lives.

The current product direction includes:

```text
The Expertise Wins
│
├── Free
│
├── Better VIP
│
└── MaxBet VIP
```

Paid output can include:

* more curated selections
* reasoning/context from the source
* multiple markets or betting options
* assigned stake units
* featured selections
* premium/MaxBet opportunities

The distinction is not simply "free information vs paid information."

The objective is to make the **paid service materially more useful and differentiated** while keeping the free tier valuable enough to demonstrate the quality and consistency of the operation.

---

# 🕷️ Scraping Layer

Each external provider has its own scraper/adapter.

Current active source:

* **FreeTips / MaxBet** (feeds the Maxbet VIP, VIP, and Free Tips output)

The project intentionally starts with **one** reliable source instead of attempting to scrape every available prediction website. Earlier TipsBet/Vitibet scaffolding has been removed to keep the pipeline focused while the daily workflow is proven.

A scraper is responsible for:

* retrieving source data
* identifying relevant matches/events
* extracting predictions
* extracting odds where available
* preserving source/detail URLs where available
* recording collection time
* retaining enough information for debugging

A scraper should not decide the final business-facing presentation.

Conceptually:

```text
Source
  ↓
Scraper
  ↓
Raw / Source-specific Data
  ↓
Normalizer
```

Different sources can use completely different HTML structures and terminology while still producing the same internal contract.

---

# 🧹 Normalization

Normalization converts source-specific data into a common representation.

The current normalized tip contract contains fields such as:

```json
{
  "source": "freetips",
  "externalId": null,
  "sport": "Football",
  "competition": "Premier League",
  "country": null,
  "homeTeam": "Liverpool",
  "awayTeam": "Nottm Forest",
  "kickoff": "7h 51m",
  "market": "Anytime Goalscorer",
  "selection": "Cody Gakpo",
  "odds": 3.1,
  "previewTitle": "Liverpool vs Nottingham Forest Tips & Predictions",
  "preview": "...",
  "analytics": null,
  "confidenceIndex": null,
  "predictedScore": null,
  "detailsUrl": "...",
  "status": "pending",
  "result": null,
  "extraTips": [],
  "scrapedAt": "2026-08-29T03:41:55.293Z"
}
```

The exact contract will evolve as more source-specific cases are discovered.

The important boundary is:

```text
Scraper
   ↓
Source-specific extraction
   ↓
Normalizer
   ↓
Common normalized tip
   ↓
Consumption / curation
```

This allows the rest of the application to work with normalized data instead of knowing how every website works.

---

# ⭐ Curation

Curation is intentionally separate from scraping.

The system should not blindly publish everything it finds.

Curation can eventually consider:

* source reliability
* available odds
* market type
* agreement between sources
* historical performance
* match context
* personal selection criteria
* intended distribution tier
* stake policy

At the MVP stage, curation does not need to be a sophisticated AI or ranking system.

Simple, explicit rules are preferable until the workflow generates enough real data to justify more complex logic.

---

# 📦 Consumption Layer

The project has a dedicated **Tips Consumption Client**.

Its job is to consume the normalized output from the services and turn it into business-facing text.

For example:

```js
const result = client.consume({
    free: [...],
    premium: [...]
});
```

produces:

```text
{
    freeCards: [...],
    premiumCards: [...]
}
```

This creates an important separation:

```text
Scrapers
    ↓
Normalizers
    ↓
Services
    ↓
TipsConsumptionClient
    ↓
Telegram-ready messages
```

The consumption layer knows how the business wants tips presented.

It does not need to know how the underlying source was scraped.

---

# 📱 Publishing (currently CLI → manual paste)

Telegram is the first practical publishing channel.

**Today the app is a CLI.** It prints channel-ready output to the terminal, and the operator copies that text straight into the channels. There is intentionally **no Telegram bot/client yet** — the delivery layer is a human paste, and that is fine while the workflow is being proven.

The current daily loop:

```text
Run collection
     ↓
Review the printed cards
     ↓
Copy free + paid cards     (pasted directly into channels)
     ↓
Publish
     ↓
Settle later (manual input)
```

> 📘 The exact commands for each step are in [`Run.md`](./Run.md).

Because the consumption client is the boundary that produces the final text, the *same* cards can later be handed to an automated delivery layer without touching the formatting logic:

```text
TipsConsumptionClient
        ↓
Channel-ready messages
        ↓
┌───────────────────────────┐
│ today: operator pastes    │
│ later: Telegram client/bot│
└───────────────────────────┘
        ↓
Channel / Group
```

This means presentation can be reviewed and tested locally without actually sending messages — and an automated publisher can be added later without changing how tips are formatted.

---

# 📊 Results, Manual Settlement & Historical Records
A major part of the long-term value of the system is not only collecting today's tips, but recording what happened afterward.

The intended loop is:

```text
Today's Tip
    ↓
Published
    ↓
Match Happens
    ↓
Result Confirmed
    ↓
Historical Record
    ↓
Source / Market / Tip Analysis
```

## Manual settlement (current)

Results are **not** scraped automatically yet. Settlement currently accepts **manual input from a real user**: the operator pastes the day's results (with ✅✅ wins and ❎❎ losses) into `settlement/settlement-template.txt` and runs the settlement command.

The settlement layer then:

1. reads the dated dump from `settlement/previous-day-results/`,
2. matches each tip's fixture/selection against the pasted results text,
3. marks each tip (and its nested/extra tips) `win`/`lose` and `settled`,
4. writes the annotated dump back to disk, and
5. prints a settled version of the channel output — where paid (VIP) **wins** carry a 🔥 after the ticks to distinguish them from free picks.

A couple of deliberate rules govern this:

* **A free tip is only a win if it is marked as won in the public channel — otherwise it counts as a loss.** Anything absent from the pasted text defaults to a loss, so free picks are always accounted for on the operator's end.
* **Featured / VIP tips require an explicit marker** in the pasted text; they are not auto-defaulted.

This manual step is intentional while the workflow is being proven. Automating result confirmation is a later phase, not part of the current MVP.

> 📘 **The settlement commands, template format, and matching rules are documented in [`Run.md`](./Run.md).**

This eventually makes it possible to understand:

* which sources perform well
* which markets perform well
* which types of selections perform well
* how different tiers perform
* what should be promoted or reduced
* how transparent historical records can be presented to users

The project should build trust through **consistency and transparent records**, not claims of guaranteed winnings.

---

# 🗂️ Daily Snapshots

The project currently uses local JSON snapshots while the workflow is being developed.

The orchestrator can scrape, normalize, validate, and save daily output.

Current conceptual layout:

```text
orchestrator/
├── free-tips/                 # transient HTML snapshots (cleaned after a run)
└── test-results/
    └── freetips.json          # today's normalized tips (the working snapshot)

settlement/
├── settlement.js              # settlement logic (mark outcomes on the snapshot)
├── app.js                     # terminal logger that prints the settled output
├── settlement-template.txt    # where the real user pastes the day's results
└── previous-day-results/
    └── freetips-<DDth Mon YYYY>.json   # dated dump the settlement layer reads/writes
```

Two things are worth calling out:

1. **`orchestrator/test-results/freetips.json`** holds *today's* tips — the working set that services and the consumption client render.
2. **`settlement/previous-day-results/`** holds *dated dumps* — the copy the settlement layer reads, annotates with outcomes, and writes back. When a new day is scraped, the saver also exports the current tips into this dated directory so yesterday's batch is preserved for settlement.

Snapshots provide a practical intermediate storage layer while the permanent database architecture is still being developed.

This is intentional.

The MVP does not need to begin with a fully deployed cloud data platform.

---

# ⚙️ Orchestrator

The orchestrator is responsible for running the current collection workflow.

The current workflow can:

1. run the relevant scraper
2. normalize the results
3. save the daily snapshot and export a dated dump into `settlement/previous-day-results/`
4. run validation/tests
5. clean temporary HTML where appropriate

The system is being developed so that a daily run becomes a repeatable operation rather than a manual scraping exercise.

> 📘 **For the actual commands and the day-to-day workflow, see [`Run.md`](./Run.md).**

---

# ⌨️ Operating the Project

The project is operated through a small set of CLI commands that all print channel-ready output to the terminal — producing the day's cards, and settling results from pasted input.

> 📘 **The full command reference and daily recipe live in [`Run.md`](./Run.md).**

> ⚠️ **Status:** the CLI + manual-settlement workflow is the current product, and it is being **tested day to day** right now. A database or frontend UI will only be considered after this workflow has proven itself in real use.

---

# 🧪 Testing
Testing currently covers individual scraping and normalization components, the normalized contract, the consumption/formatting client, and the settlement layer.

Current suite:

```text
tests/freetips.test.js          scraper + normalizer + fixtures
tests/tips.client.test.js       consumption / card formatting
tests/tips.contract.test.js     every tip satisfies the 26-field contract
tests/settlement.test.js        outcome matching, write-back, fire-emoji rules
```

> 📘 Run instructions are in [`Run.md`](./Run.md).

The intended testing boundaries are:

```text
Scraper tests
    ↓
Normalizer tests
    ↓
Contract tests
    ↓
Consumption / formatting tests
    ↓
Settlement tests
    ↓
(later) Delivery tests
```

The consumption and settlement layers can be tested directly against saved JSON fixtures without running the scrapers again.

This is important because presentation and settlement changes should not require live scraping. The settlement tests run against a self-contained throwaway dump and clean up after themselves.

---

# 🏗️ Current Architecture

The current codebase is intentionally simpler than the original long-term architecture.

The practical structure is evolving around:

```text
the-expertise-wins-api/

├── scrapers/
│   └── freetips.scraper.js         # the active source scraper
│
├── normalizers/
│   ├── contract.js                 # the shared 26-field tip contract
│   └── freetips.normalizer.js      # source-specific normalization
│
├── services/
│   ├── services.js                 # TipsService / FreeTipsService / PremiumTipsService
│   ├── tips.client.js              # TipsConsumptionClient — turns tips into channel cards
│   └── app.js                      # terminal logger for the published output (CLI)
│
├── orchestrator/
│   ├── run-freetips.js             # scrape → normalize → save the daily snapshot
│   └── test-results.js             # snapshot read/write + previous-day dump export
│
├── settlement/
│   ├── settlement.js               # settlement logic (annotate outcomes)
│   ├── app.js                      # terminal logger for settled output (CLI)
│   ├── settlement-template.txt     # where the operator pastes the day's results
│   └── previous-day-results/       # dated result dumps
│
├── tests/
│   ├── freetips.test.js
│   ├── tips.client.test.js
│   ├── tips.contract.test.js
│   └── settlement.test.js
│
└── package.json
```

> **Note:** The project currently runs **one active source (`freetips`)**. Earlier TipsBet/Vitibet scaffolding has been removed; the pipeline was deliberately narrowed to a single reliable source while the daily workflow is proven. New sources should be added only when they improve the actual product.

The structure will continue to change as the actual application boundaries become clearer.

The README intentionally documents the current direction rather than pretending the final architecture is already known.

---

# 🗄️ Database & API
A PostgreSQL + Prisma backend remains part of the longer-term architecture.

However, the database and public API are **explicitly deferred** until the CLI workflow has been run daily for a while and has proven what actually needs storing.

The project is currently proving:

```text
Source
  ↓
Scraping
  ↓
Normalization
  ↓
Daily snapshots
  ↓
Curation
  ↓
Consumption (CLI output)
  ↓
Manual paste to channels
  ↓
Manual settlement
```

Once that workflow is stable and repeatedly useful, persistent storage and a public API can be introduced where they solve real problems.

Potential future API resources include:

```http
GET /api/tips
GET /api/tips/free
GET /api/tips/vip
GET /api/tips/maxbet
GET /api/sources
GET /api/events/:id
POST /api/scrape
```

These are possibilities, not a commitment to build every endpoint.

---

# 🔌 Future Consumers

**The Expertise Wins is the primary consumer and product.**

Future consumers may include:

```text
The Expertise Wins
       │
       ├── Telegram
       ├── Future web/app experiences
       └── Paid subscription products

Future integrations
       │
       ├── Overlay Picks
       ├── Other tipsters
       └── External API clients
```

Overlay remains a potential important integration, but it is no longer the reason the project exists.

The infrastructure should eventually be reusable by Overlay and other products without making them the center of the current MVP.

---

# 🛣️ Long-Term Direction

The long-term ambition is to turn the project into a dependable **tips collection, curation, and distribution platform**.

Possible future capabilities include:

* persistent historical tip storage
* source performance analytics
* event matching across sources
* advanced curation/ranking
* scheduled scraping
* background workers
* queues
* API authentication
* API keys
* client-specific feeds
* subscriptions/licensing
* multiple publishing channels
* external tipster customers

But these belong after the core operating loop is proven.

The progression is:

```text
WORKING MVP
     ↓
DAILY PERSONAL USE
     ↓
CONSISTENT PUBLIC OUTPUT
     ↓
TRACK RECORD
     ↓
PAID CUSTOMERS
     ↓
BETTER AUTOMATION
     ↓
PERSISTENT DATA / API
     ↓
EXTERNAL CLIENTS
     ↓
LARGER PRODUCT
```

The project should grow from actual usage rather than from assumptions about what a future platform might need.

---

# 🎯 Current Mission

The immediate mission is:

> **Build a small, reliable machine that can collect today's tips, turn them into useful free and paid channel output, settle the results, and make tomorrow's operation easier.**

If the machine works for its creator every day, it has a foundation for becoming a real product. Right now it is being **operated and tested day to day as a CLI** — see [`Run.md`](./Run.md).

---

# ⚠️ Disclaimer

This project is a software and data aggregation project.

Sports predictions and betting tips are inherently uncertain and should not be treated as guarantees of financial outcomes.

External sources may contain errors, change their formats, become unavailable, or provide inaccurate information.

The Expertise Wins is responsible for how it curates and presents information, while users remain responsible for how they use betting-related information.

---

# 📄 Status
**MVP — CLI being tested day to day (pre-database, pre-UI)**

The current product is a **terminal CLI** that:

* scrapes and normalizes the day's tips,
* prints channel-ready Maxbet VIP / VIP / Free Tips cards for manual pasting, and
* accepts **manual settlement input** to mark results and print a settled report.

Current foundation:

* working scraper + normalizer (single active source)
* normalized 26-field contract + contract tests
* daily snapshots and dated previous-day dumps
* free and premium services
* consumption/formatting client (the card boundary)
* settlement layer (logic + CLI logger) with its own tests
Immediate work:

* **run the CLI + manual-settlement workflow daily for a few days**
* confirm the printed output pastes cleanly into the channels
* confirm the settlement rules hold up against real results
* note friction points before deciding what to automate
Explicitly **not** next:

* a database
* a frontend UI
* an automated Telegram publisher
* automated result scraping
Those are deliberately deferred. The next stage should be determined by **what the daily runs actually reveal**, not by assumptions made before using it.