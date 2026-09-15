# 🚀 The Expertise Wins API — Development Roadmap

This roadmap reflects the **current product direction** rather than the original platform-first plan.

The project is being developed in stages:

> **Make the workflow work → use it daily → prove it → improve it → productize it.**

The first product is **The Expertise Wins itself**.

The API, database, external integrations, and larger infrastructure remain part of the long-term vision, but they should emerge from a working operation rather than being built prematurely.

---

# Phase 0 — Validate the Operating Model

**Goal:** Prove that the software automates a workflow that is already useful manually.

* [x] Identify trusted free-tip sources already used in the workflow
* [x] Define the free vs paid distribution model
* [x] Establish The Expertise Wins as the primary product/channel
* [x] Decide that Telegram is the first practical distribution channel
* [x] Define a normalized tip contract
* [x] Establish the principle of starting with a small MVP
* [ ] Establish a consistent daily publishing routine
* [ ] Begin collecting a transparent historical record

---

# Phase 1 — Working Scrapers

**Goal:** Reliably collect tips from a small number of useful sources.

* [x] Build TipsBet scraper
* [x] Build Vitibet scraper
* [x] Build FreeTips / MaxBet scraper
* [x] Extract matches/events
* [x] Extract selections
* [x] Extract odds where available
* [x] Preserve source/detail URLs where available
* [x] Record scrape timestamps
* [x] Handle source-specific failures
* [x] Support sources with different scraping requirements
* [ ] Add more sources only when the existing workflow justifies them
* [ ] Improve scraper resilience as real failures are encountered

**Principle:** Do not add sources simply to increase the number of sources. Add sources when they improve the actual product.

---

# Phase 2 — Normalization & Contracts

**Goal:** Give every source a predictable internal representation.

* [x] Create source-specific normalizers
* [x] Normalize sport
* [x] Normalize competition
* [x] Normalize teams
* [x] Normalize market/selection fields
* [x] Normalize odds where available
* [x] Preserve source-specific details where useful
* [x] Define normalized tip contract
* [x] Add contract tests
* [ ] Improve edge cases discovered through real daily runs
* [ ] Separate source extraction problems from presentation problems
* [ ] Expand normalization only when real data requires it

---

# Phase 3 — Daily Snapshots & Orchestration

**Goal:** Make daily collection repeatable.

* [x] Build orchestrator
* [x] Run scraper + normalization as a repeatable workflow
* [x] Save dated JSON snapshots
* [x] Validate generated snapshots
* [x] Clean temporary HTML snapshots after validation
* [x] Allow a specific date to be supplied
* [ ] Add a convenient previous-day loader
* [ ] Add `--previous` support
* [ ] Compare today's and yesterday's snapshots
* [ ] Make daily execution simple enough to become routine
* [ ] Eventually schedule the workflow automatically

Current snapshot concept:

```text
orchestrator/
└── test-results/
    └── YYYY-MM-DD/
        └── freetips.json
```

Snapshots are an intentional MVP storage mechanism. A permanent database does not need to be introduced until it solves a real operational problem.

---

# Phase 4 — Consumption & Telegram Output

**Goal:** Turn normalized data into the exact output required by The Expertise Wins.

* [x] Create consumption boundary
* [x] Consume `{ free, premium }` service output
* [x] Separate TipsBet free output
* [x] Separate Vitibet free output
* [x] Build premium/MaxBet formatting
* [x] Support featured "Bet of the Day" output
* [x] Support featured "Tennis Bet of the Day" output
* [x] Include premium reasoning/context where available
* [x] Format odds
* [x] Apply configurable stake policies
* [ ] Finish formatting tests against saved JSON
* [ ] Verify every output against the desired Telegram presentation
* [ ] Add message-length/chunking handling where necessary
* [ ] Build Telegram delivery client
* [ ] Test sending without coupling delivery to formatting

Target boundary:

```text
Normalized Services
        ↓
TipsConsumptionClient
        ↓
Telegram-ready messages
        ↓
Telegram Client
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

# Phase 6 — Results & Performance

**Goal:** Close the loop between prediction and outcome.

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

* [ ] Confirm final scores/results
* [ ] Update tip status
* [ ] Record win/loss/push where applicable
* [ ] Store result timestamps
* [ ] Record stake/result information
* [ ] Produce daily result summaries
* [ ] Produce weekly/monthly summaries
* [ ] Track source performance
* [ ] Track market performance
* [ ] Track tier performance
* [ ] Identify consistently useful sources
* [ ] Identify weak or unreliable sources
* [ ] Use actual records to improve curation

This phase is strategically important because historical results turn the project from a tip collection script into an increasingly informed operating system.

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

# 🧭 Current Priority — September 2026

The current priority is **not** PostgreSQL, API keys, Redis, queues, or a large public API.

The immediate priority is:

```text
1. Finish consumption formatting
2. Test Telegram-ready output
3. Finish Telegram delivery
4. Confirm results/scores
5. Start daily operation
6. Publish free output consistently
7. Publish paid output consistently
8. Record the track record
9. Observe what actually needs improvement
```

The near-term target is a small but functioning MVP that can be operated every day.

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
Consumption → formats
Telegram client → delivers
Results → records
API → exposes
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

**MVP — final delivery pipeline / pre-launch**

Current foundation:

* working scrapers
* working normalizers
* normalized contract tests
* daily snapshots
* free and premium services
* consumption/formatting client
* free/paid product structure

Immediate work:

* finish formatting tests
* finish Telegram delivery
* finish result confirmation
* begin daily live operation

The next stage should be determined increasingly by **what happens after launch**, not by assumptions made before launch.