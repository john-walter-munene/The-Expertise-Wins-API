# The Expertise Wins API

The **Expertise Wins API** is the backend and data pipeline behind the **The Expertise Wins** betting-tip operation.

Its immediate purpose is practical: collect predictions from a small number of trusted external sources, normalize them into a common format, curate and organize them, and turn them into reliable daily outputs for **The Expertise Wins channels**, initially through Telegram.

The project may eventually become a reusable API and data service for other products, tipsters, or clients. But the current priority is deliberately smaller:

> **Build the machine I need, use it every day, prove the workflow, then expand it.**

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

The current consumption layer separates free tips into source-based cards such as:

```text
TipsBet → Free Card 1
Vitibet → Free Card 2
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

Current sources include:

* **TipsBet**
* **Vitibet**
* **FreeTips / MaxBet**

The project intentionally starts with a small number of reliable sources instead of attempting to scrape every available prediction website.

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

It does not need to know how TipsBet, Vitibet, or FreeTips were scraped.

---

# 📱 Telegram Distribution

Telegram is the first practical publishing channel.

The immediate objective is to make daily publishing simple:

```text
Run collection
     ↓
Review output
     ↓
Generate free cards
     ↓
Generate paid cards
     ↓
Post
```

The Telegram delivery layer should eventually be separate from formatting:

```text
TipsConsumptionClient
        ↓
Telegram-ready messages
        ↓
Telegram Client / Bot
        ↓
Channel / Group
```

This means presentation can be tested locally without actually sending messages.

---

# 📊 Results & Historical Records

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
├── free-tips/
└── test-results/
    └── YYYY-MM-DD/
        └── freetips.json
```

Snapshots provide a practical intermediate storage layer while the permanent database architecture is still being developed.

This is intentional.

The MVP does not need to begin with a fully deployed cloud data platform.

---

# ⚙️ Orchestrator

The orchestrator is responsible for running the current collection workflow.

Example:

```bash
npm run expertise -- --date=2026-09-15
```

The current workflow can:

1. run the relevant scraper
2. normalize the results
3. save a dated JSON snapshot
4. run validation/tests
5. clean temporary HTML where appropriate

The system is being developed so that a daily run becomes a repeatable operation rather than a manual scraping exercise.

---

# 🧪 Testing

Testing currently covers individual scraping and normalization components as well as the normalized contract.

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
Telegram delivery tests
```

The consumption layer can be tested directly against saved JSON fixtures without running the scrapers again.

This is important because presentation changes should not require live scraping.

---

# 🏗️ Current Architecture

The current codebase is intentionally simpler than the original long-term architecture.

The practical structure is evolving around:

```text
the-expertise-wins-api/

├── scrapers/
│   ├── freetips.scraper.js
│   ├── tipsbet.scraper.js
│   └── vitibet.scraper.js
│
├── normalizers/
│   ├── freetips.normalizer.js
│   ├── tipsbet.normalizer.js
│   └── vitibet.normalizer.js
│
├── services/
│   ├── free.service.js
│   ├── premium.service.js
│   ├── admin.service.js
│   └── tips.client.js
│
├── orchestrator/
│
├── tests/
│
└── package.json
```

The structure will continue to change as the actual application boundaries become clearer.

The README intentionally documents the current direction rather than pretending the final architecture is already known.

---

# 🗄️ Database & API

A PostgreSQL + Prisma backend remains part of the longer-term architecture.

However, the database and public API are **not the first milestone**.

The project is currently proving:

```text
Sources
  ↓
Scraping
  ↓
Normalization
  ↓
Daily snapshots
  ↓
Curation
  ↓
Consumption
  ↓
Telegram
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

> **Build a small, reliable machine that can collect today's tips, turn them into useful free and paid Telegram output, record the results, and make tomorrow's operation easier.**

If the machine works for its creator every day, it has a foundation for becoming a real product.

---

# ⚠️ Disclaimer

This project is a software and data aggregation project.

Sports predictions and betting tips are inherently uncertain and should not be treated as guarantees of financial outcomes.

External sources may contain errors, change their formats, become unavailable, or provide inaccurate information.

The Expertise Wins is responsible for how it curates and presents information, while users remain responsible for how they use betting-related information.

---

# 📄 Status

**MVP development — approaching live operation**

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