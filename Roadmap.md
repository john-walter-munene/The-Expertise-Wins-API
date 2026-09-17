# 🚀 The Expertise Wins API — Development Roadmap

This roadmap reflects the **current product direction** rather than the original platform-first plan.

The project is being developed in stages:

> **Make the workflow work → use it daily → prove it → improve it → productize it.**

The first product is **The Expertise Wins itself**.

> **Current stage:** the CLI is being **tested day to day**. The focus is on operating it consistently and learning what friction actually appears — not on adding infrastructure.

The API, database, external integrations, and larger infrastructure remain part of the long-term vision, but they should emerge from a working operation rather than being built prematurely.

> 📘 For how to run the project as it is today, see [`Run.md`](./Run.md). This roadmap covers direction, not operation.

---

# Phase 0 — Validate the Operating Model

**Goal:** Prove that the software automates a workflow that is already useful manually.

* [x] Identify trusted free-tip sources already used in the workflow
* [x] Define the free vs paid distribution model
* [x] Establish The Expertise Wins as the primary product/channel
* [x] Decide that Telegram is the first practical distribution channel
* [x] Define a normalized tip contract
* [x] Establish the principle of starting with a small MVP
* [x] Establish a CLI-first operating loop (produce → paste → settle)
* [ ] Establish a consistent daily publishing routine (run over several days)
* [ ] Begin collecting a transparent historical record

---

# Phase 1 — Working Scrapers

**Goal:** Reliably collect tips from a small number of useful sources.

* [x] Build FreeTips / MaxBet scraper (the active source)
* [x] Extract matches/events
* [x] Extract selections
* [x] Extract odds where available
* [x] Preserve source/detail URLs where available
* [x] Record scrape timestamps
* [x] Handle source-specific failures (incl. Cloudflare / browser fetch)
* [x] Narrow the pipeline to a single reliable source
* [ ] Add more sources only when the existing workflow justifies them
* [ ] Improve scraper resilience as real failures are encountered
**Principle:** Do not add sources simply to increase the number of sources. Add sources when they improve the actual product. The pipeline was deliberately narrowed to one source while the daily workflow is proven.

---

# Phase 2 — Normalization & Contracts

**Goal:** Give every source a predictable internal representation.

* [x] Create the source normalizer (`freetips.normalizer.js`)
* [x] Normalize sport
* [x] Normalize competition
* [x] Normalize teams
* [x] Normalize market/selection fields
* [x] Normalize odds where available
* [x] Preserve source-specific details where useful
* [x] Define the normalized tip contract (26 fields)
* [x] Add contract tests
* [ ] Improve edge cases discovered through real daily runs
* [ ] Separate source extraction problems from presentation problems
* [ ] Expand normalization only when real data requires it

---

# Phase 3 — Daily Snapshots & Orchestration

**Goal:** Make daily collection repeatable.

* [x] Build orchestrator
* [x] Run scraper + normalization as a repeatable workflow
* [x] Save JSON snapshots
* [x] Validate generated snapshots
* [x] Clean temporary HTML snapshots after validation
* [x] Allow a specific date to be supplied
* [x] Export a dated dump into `settlement/previous-day-results/` on each save
* [x] Add a convenient previous-day loader (`resolveJsonPath` falls back to the newest dump)
* [ ] Compare today's and yesterday's snapshots
* [ ] Make daily execution simple enough to become routine
* [ ] Eventually schedule the workflow automatically
Current snapshot concept:

```text
orchestrator/
└── test-results/
    └── freetips.json                    # today's working snapshot
settlement/
└── previous-day-results/
    └── freetips-<DDth Mon YYYY>.json    # dated dump the settlement layer reads/writes
```

Snapshots are an intentional MVP storage mechanism. A permanent database does not need to be introduced until it solves a real operational problem.

---

# Phase 4 — Consumption & Publishing Output
**Goal:** Turn normalized data into the exact output required by The Expertise Wins.

> **Current reality:** output is printed by a **terminal CLI** and the operator **pastes it into the channels manually**. There is no Telegram client yet — and none is needed to publish today.

* [x] Create consumption boundary
* [x] Consume `{ free, premium }` service output
* [x] Build Maxbet VIP formatting
* [x] Build VIP (PikkBetter) formatting
* [x] Build Free Tips formatting
* [x] Support featured "Bet of the Day" output
* [x] Support featured "Tennis Bet of the Day" output
* [x] Include premium reasoning/context where available
* [x] Format odds
* [x] Apply stake policies
* [x] Add consumption/formatting tests against saved JSON
* [x] Print channel-ready output via a CLI (`services/app.js`)
* [ ] Verify the printed output against the desired channel presentation over real daily runs
* [ ] Add message-length/chunking handling if the pasted output ever exceeds limits
* [ ] (Later) Build an automated Telegram delivery client
Target boundary — note the same formatted cards serve both today's manual paste and a future automated publisher:

```text
Normalized Services
        ↓
TipsConsumptionClient
        ↓
Channel-ready messages
        ↓
┌─────────────────────────┐
│ today: operator pastes  │
│ later: Telegram client  │
└─────────────────────────┘
        ↓
The Expertise Wins
```

---

# Phase 5 — Free + Paid Product Launch

**Goal:** Get the actual operation into the market.

## Free

* [x] Define free tier
* [x] Create source-based free cards
* [ ] Publish free tips consistently
* [ ] Track free-tip results
* [ ] Establish a visible historical record

## Better VIP

* [x] Define Better VIP as a paid tier
* [x] Define premium output structure
* [ ] Finalize the daily paid workflow
* [ ] Publish consistently
* [ ] Track paid-tip results
* [ ] Refine what differentiates Better from Free

## MaxBet VIP

* [x] Define MaxBet as the highest current tier
* [x] Define featured/premium output structure
* [ ] Finalize MaxBet curation rules
* [ ] Publish consistently
* [ ] Track MaxBet results
* [ ] Refine MaxBet based on actual performance and customer feedback

**Important:** The objective is not to promise outcomes. The objective is to create a consistent service with clearly differentiated value and transparent records.

---

# Phase 5.5 — Manual Settlement (current)

**Goal:** Close the prediction → outcome loop using **real user input**, without waiting for automated result scraping.

This phase exists because results are **not** scraped automatically. The operator pastes the day's results and the settlement layer marks them.

How it works today:

```text
Dated dump (settlement/previous-day-results/freetips-<date>.json)
        ↓
Operator pastes results into settlement/settlement-template.txt
        ↓
Run the settlement command
        ↓
Match fixture + selection against the pasted text
        ↓
Mark each tip win/lose + settled (incl. nested + extraTips)
        ↓
Write the annotated dump back to disk
        ↓
Print a settled report
```

> 📘 Commands: [`Run.md`](./Run.md).

* [x] Build the settlement layer (`settlement/settlement.js`)
* [x] Read the dated dump from `settlement/previous-day-results/`
* [x] Parse pasted results text into per-fixture outcomes
* [x] Match tips by fixture and selection (incl. nested `tips` + `extraTips`)
* [x] Default absent **free** tips to a loss (untouched = lost)
* [x] Require explicit markers for featured / VIP tips
* [x] Write settled outcomes back to the JSON dump
* [x] Print a settled report via a CLI (`settlement/app.js`)
* [x] Distinguish paid wins in the output (`✅🔥`) from loses (`❎`)
* [x] Add settlement tests (matching, write-back, fire-emoji rules)
* [ ] Run settlement daily on real results and confirm the rules hold
* [ ] Note any fixtures/edge cases the matcher gets wrong, then refine
* [ ] (Later) Automate result confirmation where a reliable source exists
**Principle:** Keep settlement **manual and explicit** for now. A human confirming results is more trustworthy than a fragile scraper, and it keeps the important decisions visible while the workflow is proven.

---

# Phase 6 — Results & Performance
**Goal:** Close the loop between prediction and outcome.

> **Current approach:** results enter the system via **manual settlement** (see Phase 5.5). Automated result confirmation is deferred.

```text
TIP
 ↓
PUBLISHED
 ↓
MATCH
 ↓
RESULT
 ↓
RECORDED
 ↓
ANALYZED
```

* [x] Confirm results manually (operator pastes them)
* [x] Update tip status (`pending` → `settled`)
* [x] Record win/loss on the tip and its nested/extra tips
* [ ] Store explicit result timestamps
* [x] Record stake/result information on the tip
* [x] Produce a settled report per run
* [ ] Produce weekly/monthly summaries
* [ ] Track source performance
* [ ] Track market performance
* [ ] Track tier performance
* [ ] Identify consistently useful sources
* [ ] Identify weak or unreliable sources
* [ ] Use actual records to improve curation
This phase is strategically important because historical results turn the project from a tip collection script into an increasingly informed operating system.

> **Note:** the dated dumps under `settlement/previous-day-results/` are the current historical record. They are intentionally simple (annotated JSON), because a proper results store belongs in the database phase — and only once the daily workflow has proven what the record actually needs to hold.

---

# Phase 7 — Persistent Data

**Goal:** Introduce a proper database once the workflow has demonstrated what needs to be stored.

Potential stack:

```text
PostgreSQL
    +
Prisma
```

Potential models:

* Source
* Sport
* Competition
* Team
* Event
* Market
* Prediction
* CuratedTip
* Publication
* Result
* Channel
* User/client

Tasks:

* [ ] Define persistent source model
* [ ] Define event model
* [ ] Define normalized tip model
* [ ] Define curation/publication model
* [ ] Define result model
* [ ] Migrate useful snapshot data
* [ ] Prevent duplicate events/tips
* [ ] Preserve source provenance
* [ ] Preserve historical publication records

The schema should be driven by actual requirements discovered during the MVP rather than by designing every possible entity upfront.

---

# Phase 8 — API Layer

**Goal:** Expose stable data to other applications after the internal workflow is stable.

Potential endpoints:

```http
GET /api/tips
GET /api/tips/free
GET /api/tips/vip
GET /api/tips/maxbet
GET /api/sources
GET /api/sources/:id
GET /api/events/:id
POST /api/scrape
```

Tasks:

* [ ] Define API contract from real internal data
* [ ] Implement read endpoints
* [ ] Implement administrative operations
* [ ] Add authentication
* [ ] Add authorization
* [ ] Add validation
* [ ] Add error handling
* [ ] Add API documentation
* [ ] Add API tests
* [ ] Deploy API

The API is a **later distribution interface**, not the first product milestone.

---

# Phase 9 — Overlay Integration

**Goal:** Reuse the proven tips infrastructure inside Overlay where useful.

Overlay remains an important potential consumer, but it follows validation of the core Expertise Wins workflow.

* [ ] Define Overlay integration contract
* [ ] Provide free tips
* [ ] Provide authorized/admin tips
* [ ] Prevent duplicate imports
* [ ] Synchronize tip lifecycle
* [ ] Map Expertise Wins results into Overlay's data model
* [ ] Integrate authentication where required
* [ ] Monitor synchronization failures

Overlay should remain responsible for its own application concerns such as:

* users
* authentication
* subscriptions
* payments
* UI
* tipster accounts
* betting events
* application-level picks
* settlement/statistics

The Expertise Wins system remains focused on collection, curation, distribution, and historical tip data.

---

# Phase 10 — Automation & Operations

**Goal:** Reduce daily manual work without hiding the important business decisions.

* [ ] Schedule daily scraping
* [ ] Add background jobs where needed
* [ ] Add retry handling
* [ ] Add scraper health monitoring
* [ ] Add failure notifications
* [ ] Automate result collection where reliable
* [ ] Automate daily reporting
* [ ] Add operational logs
* [ ] Add backups
* [ ] Deploy production infrastructure
* [ ] Add monitoring

Possible future infrastructure:

```text
Scheduler
   ↓
Queue / Worker
   ↓
Scrapers
   ↓
Normalizer
   ↓
Database
   ↓
Curation
   ↓
Formatter
   ↓
Telegram / API
```

Do not introduce queues, Redis, workers, or cloud infrastructure merely because they are available. Introduce them when workload or reliability requires them.

---

# Phase 11 — External Productization

**Goal:** Determine whether the internal system can become a product for other people.

Potential customers:

```text
The Expertise Wins
        │
        ├── Internal channels
        │
        ├── Overlay
        │
        ├── Other tipsters
        │
        └── API clients
```

Potential capabilities:

* [ ] API keys
* [ ] Client authentication
* [ ] Client-specific feeds
* [ ] Usage tracking
* [ ] Rate limits
* [ ] Subscription/licensing
* [ ] Customer dashboards
* [ ] Client onboarding
* [ ] Usage analytics
* [ ] Billing integration

The external API should emerge from a system that already works internally.

---

# 📈 Product Growth Loop

The intended long-term loop is:

```text
Better Sources
      ↓
Better Collection
      ↓
Better Normalization
      ↓
Better Curation
      ↓
Better Output
      ↓
More Consistent Publishing
      ↓
More Trust / Better Track Record
      ↓
More Customers
      ↓
More Data
      ↓
Better Curation
```

The system should improve through actual usage.

---

# 🧭 Current Priority

The current priority is **not** PostgreSQL, Prisma, API keys, Redis, queues, a large public API, **a database, a frontend UI, or an automated Telegram bot**.

The immediate priority is to **operate the CLI daily and let reality guide the next step**:

```text
1. Produce today's cards
2. Paste them into the channels
3. Settle the results (manual input)
4. Record the track record (dated dumps)
5. Watch for friction across several days
6. THEN decide: database? UI? automation?
```

The near-term target is a small but functioning CLI that can be operated every day, and a few days of real use to learn what genuinely needs building next.

> 📘 **Commands and the daily recipe: [`Run.md`](./Run.md).**

> **Deliberately deferred:** a database and a frontend UI. They are not next. They become relevant only once the daily CLI workflow has been proven and its real storage/presentation needs are understood.

---

# 🏁 MVP Definition

The MVP is successful when the following loop can happen reliably:

```text
SCRAPE
   ↓
NORMALIZE
   ↓
CURATE
   ↓
FORMAT
   ↓
POST
   ↓
RESULT
   ↓
RECORD
```

without requiring a large amount of repetitive manual work.

It does **not** require:

* a huge database
* dozens of sources
* a public API
* sophisticated machine learning
* complex infrastructure
* a complete mobile/web application
* a large customer base

Those can come later.

---

# 🌍 Long-Term Vision

The long-term vision remains:

> **Build dependable infrastructure for collecting, curating, recording, and distributing sports betting tips.**

The difference is that the path to that vision is now grounded in a real operating workflow.

```text
Personal Workflow
       ↓
Working MVP
       ↓
The Expertise Wins
       ↓
Daily Track Record
       ↓
Paid Customers
       ↓
Stable Data Infrastructure
       ↓
API
       ↓
External Tipsters / Products
       ↓
Larger Business
```

The project should become more sophisticated because the business requires it—not because the roadmap says it should.

---

# ⚠️ Guiding Principles

### 1. First make it work, then make it better.

A working simple system is more valuable than an elaborate unfinished platform.

### 2. Build for the workflow that actually exists.

Automate proven manual work instead of designing hypothetical requirements.

### 3. Keep boundaries clean.

```text
Scraper → extracts
Normalizer → standardizes
Service → combines/provides
Curation → decides
Consumption → formats channel-ready cards
Settlement → records outcomes (manual for now)
API → exposes (later)
```

### 4. Let real data drive architecture.

Don't prematurely model every possible sport, market, customer, or distribution channel.

### 5. Free should demonstrate value.

The free tier is an entry point into the operation, not a replacement for the paid service.

### 6. Paid should be differentiated.

VIP value should come from curation, selection, context, structure, consistency, and service—not empty claims.

### 7. Build trust through records.

Transparent historical performance is more valuable than promises.

### 8. Keep the system usable by its creator.

The first person who should benefit from the automation is the person operating it every day.

---

# 📄 Status
**MVP — CLI operating loop in daily use (pre-database, pre-UI)**

Current foundation:

* working scraper + normalizer (single active source)
* normalized 26-field contract + contract tests
* daily snapshot + dated previous-day dumps
* free and premium services
* consumption/formatting client (channel-ready cards)
* free/paid product structure — Maxbet VIP / VIP / Free Tips
* **settlement layer** (manual input → outcomes → settled report) + its tests
* CLI loggers for both producing and settling (`services/app.js`, `settlement/app.js`)
Immediate work:

* **run the CLI + manual-settlement workflow daily for a few days**
* confirm printed output pastes cleanly into the channels
* confirm settlement rules hold against real results
* record friction points to inform what to build next
Explicitly **not** next (deferred until the daily workflow is proven):

* a database (PostgreSQL + Prisma)
* a frontend UI
* an automated Telegram publisher
* automated result scraping

The next stage should be determined by **what daily use actually reveals**, not by assumptions made before launch.