# The Expertise Wins — Backend

REST API server exposing tips produced by the scraping engine in `../cli`.

## Responsibilities

- Serve daily tips (free + premium/VIP) as JSON endpoints
- Wrap the `cli` orchestrator/pipeline (scrape → normalize → snapshot)
- Persist snapshots/results for the `frontend` app and future consumers

## Planned stack

- Runtime: Node.js (matches repo engines: >=22)
- Framework: (TBD — e.g. Express or Fastify)
- Reuses `../cli/scrapers`, `../cli/normalizers`, `../cli/services` as modules

## Endpoints (planned)

- `GET /tips/free` — today's free tips
- `GET /tips/vip` — VIP/maxbet tips
- `GET /settlement/previous-day` — yesterday's results
