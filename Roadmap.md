# 🚀 Development Roadmap

## Phase 1 — Scraping

* [ ] Select first trusted tip source
* [ ] Build first scraper
* [ ] Extract matches and predictions
* [ ] Extract odds where available
* [ ] Store raw scraped data
* [ ] Handle scraper failures
* [ ] Add scraper logging

## Phase 2 — Data Model

* [ ] Design normalized Prisma schema
* [ ] Model sources
* [ ] Model sports
* [ ] Model leagues
* [ ] Model teams
* [ ] Model events
* [ ] Model markets
* [ ] Model predictions
* [ ] Model curated tips
* [ ] Model channels

## Phase 3 — Multiple Sources

* [ ] Add source #2
* [ ] Add source #3
* [ ] Add source #4
* [ ] Add source #5
* [ ] Normalize predictions across providers
* [ ] Detect duplicate events
* [ ] Improve source reliability tracking

## Phase 4 — Curation

* [ ] Review collected tips
* [ ] Add curation notes
* [ ] Assign confidence
* [ ] Assign channels
* [ ] Publish/unpublish tips
* [ ] Track tip outcomes

## Phase 5 — Overlay Integration

* [ ] Define Overlay API contract
* [ ] Provide free tips
* [ ] Provide admin tips
* [ ] Integrate authentication
* [ ] Add reliable synchronization
* [ ] Prevent duplicate imports

## Phase 6 — Distribution

* [ ] Expertise Wins integration
* [ ] API keys
* [ ] External tipster access
* [ ] Usage tracking
* [ ] Client-specific feeds
* [ ] Subscription/licensing support

---

# 🎯 Long-Term Vision

The long-term goal is to create a dependable **tip collection and curation infrastructure** that separates the difficult work of finding and evaluating predictions from the products that consume them.

```text
                 ┌──────────────────┐
                 │ External Sources │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │    Scrapers     │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Normalized Data │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │     Curation     │
                 └────────┬─────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Overlay     Expertise    API Clients
           Picks         Wins       / Tipsters
```

The objective is not to build the biggest prediction database.

The objective is to build a **stable, maintainable source of curated tips** that can support multiple products and distribution channels.

---

# ⚠️ Disclaimer

This project is a software and data aggregation project.

Predictions and betting tips are inherently uncertain and should not be treated as guarantees of financial outcomes.

External prediction sources may contain errors, change their formats, become unavailable, or provide inaccurate information. Consumers of the API are responsible for determining how they use the data.

---

# 📄 Status

**Early development**

The project is currently focused on establishing the scraping and data-ingestion foundation before expanding into the full API and distribution layer.
