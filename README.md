# The Expertise Wins API

The **The Expertise Wins API** is a backend service for collecting, organizing, curating, and distributing sports betting tips from trusted external sources.

The project exists to provide a stable, centralized source of curated tips that can power multiple products and publishing channels without requiring each product to independently collect and process tips.

The primary consumer is currently **Overlay Picks**, where the API can provide tips for both the public/free-tip experience and the admin/tipster account.

Over time, the API may also provide curated tips to **The Expertise Wins** channels and potentially to other tipsters or third-party applications.

---

## 🎯 Project Goal

The core idea is simple:

> **Collect once. Curate once. Distribute everywhere.**

The most difficult part of running a tipster operation is often not publishing the tips. It is consistently finding useful predictions, collecting them from multiple sources, understanding the characteristics of each provider, and deciding which selections are worth publishing.

The Expertise Wins API is intended to centralize that work.

```text
External Tip Sources
        │
        ▼
   Web Scrapers
        │
        ▼
    Raw Tips
        │
        ▼
   Normalization
        │
        ▼
 Curated Tips
        │
        ├───────────────┐
        ▼               ▼
 Overlay Picks    Expertise Wins
        │
        ▼
 Future API Clients
```

This allows the consuming applications to focus on **presentation, users, subscriptions, tipster experiences, and product growth**, rather than rebuilding the tip collection pipeline.

---

# 🏗️ Architecture

The system is designed around several distinct stages.

### 1. Tip Sources

External websites and providers are the initial source of predictions.

Examples may include football prediction websites, statistical prediction services, and other trusted sources.

Each source should have its own scraper/adapter so that changes to one provider do not affect the rest of the system.

```text
Source A ──┐
Source B ──┤
Source C ──┼──> Scraping / Ingestion
Source D ──┤
Source E ──┘
```

The initial goal is to support approximately **4–5 reliable sources** rather than attempting to scrape every available prediction website.

---

# 🕷️ Scraping Layer

The scraper is responsible for retrieving predictions from external sources.

A scraper should:

* retrieve the source data
* identify relevant matches/events
* extract predictions
* extract odds where available
* preserve the original source URL
* record when the information was collected
* retain enough raw information for debugging and auditing

The scraper should **not** make final curation decisions.

Instead, it produces structured raw data for the ingestion pipeline.

Example:

```json
{
  "source": "example-provider",
  "sourceUrl": "https://example.com/predictions",
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "prediction": "Over 2.5",
  "odds": 1.82,
  "scrapedAt": "2026-08-10T10:00:00Z"
}
```

---

# 🧹 Normalization

Different providers may describe the same prediction differently.

For example:

```text
Over 2.5
O2.5
Goals Over 2.5
Over 2.5 Goals
```

These should ultimately map to a common internal representation.

Likewise:

```text
BTTS
GG
Both Teams To Score
Both Teams Score
```

should be normalized into a consistent market/selection representation.

Normalization allows the system to compare and organize predictions from different providers without losing the original source information.

---

# 🗃️ Data Storage

The database should distinguish between **raw source information** and **normalized application data**.

Raw scraped information should be retained where practical.

This provides an audit trail and makes it possible to investigate problems when:

* a scraper changes
* a provider changes its format
* normalization produces an unexpected result
* a prediction needs to be reviewed
* historical source performance needs to be analyzed

Conceptually:

```text
Raw Tip
   │
   ▼
Normalized Event
   │
   ▼
Normalized Prediction
   │
   ▼
Curated Tip
```

---

# ⭐ Curation

Curation is the most important layer of the application.

The system is not intended to blindly publish every prediction collected from external providers.

Instead, collected tips can be reviewed and selected based on factors such as:

* source reliability
* market
* available odds
* agreement between sources
* historical performance
* match context
* personal curation criteria
* suitability for a particular publishing channel

The final curated tip becomes the reusable asset that can be distributed to different products.

---

# 🏷️ Tip Channels

The initial system is expected to support several publishing tiers/channels.

Examples include:

| Channel | Purpose                                        |
| ------- | ---------------------------------------------- |
| Free    | Public/free tips                               |
| VIP     | Premium selections                             |
| MaxBet  | Higher-priority selections                     |
| Admin   | Tips used by the Overlay admin/tipster account |

Channels should remain flexible rather than tightly coupling the database to a fixed list of products.

A curated tip may eventually be published to one or multiple channels.

---

# 🔌 Overlay Picks Integration

One of the primary consumers of this API is the **Overlay Picks** application.

The API is intended to provide a reliable source of tips that Overlay can consume rather than requiring Overlay to independently scrape and curate external sources.

Conceptually:

```text
The Expertise Wins API
          │
          ├── Free Tips ──────> Overlay
          │
          └── Admin Tips ─────> Overlay Tipster/Admin
```

Overlay remains responsible for its own application concerns such as:

* users
* authentication
* subscriptions
* tipster accounts
* UI
* betting events
* picks
* settlement
* statistics
* payments

The Expertise Wins API is responsible primarily for the **tip collection, curation, and distribution pipeline**.

Repository:

[Overlay Picks](https://github.com/john-walter-munene/overlay?utm_source=chatgpt.com)

---

# 📡 API

The API will initially remain intentionally small.

Potential endpoints include:

```http
GET /api/tips
GET /api/tips/free
GET /api/tips/vip
GET /api/tips/maxbet
GET /api/tips/admin

GET /api/sources
GET /api/sources/:id

GET /api/events/:id

POST /api/tips
PATCH /api/tips/:id

POST /api/scrape
```

The exact API surface will evolve as the underlying data model becomes clearer.

The first priority is **reliable data**, not a large number of endpoints.

---

# 🔐 Authentication

Public consumption and administrative operations will be separated.

Potential access levels include:

```text
Public
   │
   └── Public/free tips

Authenticated client
   │
   └── Authorized API access

Admin
   │
   ├── Manage sources
   ├── Run scrapers
   ├── Curate tips
   ├── Assign channels
   └── Publish tips
```

API keys may eventually be introduced for external consumers and third-party tipsters.

---

# 🧰 Technology

The initial technology stack is intended to remain simple and familiar:

* **Node.js**
* **Express**
* **PostgreSQL**
* **Prisma**
* **JavaScript / TypeScript**
* **REST API**
* Web scraping tools appropriate to each source

Additional infrastructure such as Redis, background workers, queues, or scheduled jobs can be introduced when the scraping workload requires them.

---

# 📁 Planned Project Structure

A possible structure is:

```text
the-expertise-wins-api/
│
├── prisma/
│   ├── schema.prisma
│   └── seed.js
│
├── src/
│   ├── config/
│   │
│   ├── controllers/
│   │
│   ├── routes/
│   │
│   ├── services/
│   │
│   ├── scrapers/
│   │   ├── source-a/
│   │   ├── source-b/
│   │   ├── source-c/
│   │   └── source-d/
│   │
│   ├── normalizers/
│   │
│   ├── middleware/
│   │
│   ├── lib/
│   │
│   └── app.js
│
├── tests/
│
├── .env.example
├── package.json
└── README.md
```

The exact structure may change as the project develops.

---

# 🔄 Intended Workflow

A typical daily workflow should eventually look like:

```text
Scheduled scraper
       │
       ▼
Collect predictions
       │
       ▼
Store raw data
       │
       ▼
Normalize predictions
       │
       ▼
Match events
       │
       ▼
Review / curate
       │
       ▼
Assign channel
       │
       ├── Free
       ├── VIP
       ├── MaxBet
       └── Admin
       │
       ▼
Publish
       │
       ├── Overlay Picks
       ├── The Expertise Wins
       └── External clients
```

The goal is to make the process repeatable and reliable enough that daily tip collection does not become a bottleneck for growing the surrounding products.

---