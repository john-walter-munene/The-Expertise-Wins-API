# The Expertise Wins

> [The Expertise Wins on Telegram](https://t.me/+D_jIXFB807E0NmRk)

The Expertise Wins is a monorepo containing a sports-tip CLI, an Express/Prisma API, and a Next.js frontend. The CLI collects and normalizes FreeTips records into local JSON dumps; `npm run sync` pushes those dumps into PostgreSQL, which is what the web app reads. Channel publication remains manual.

## Project Structure

- `cli/` collects and normalizes FreeTips records, writes local snapshots and dated dumps, formats cards, applies manually pasted settlement markers, and syncs dumps to a database.
- `backend/` contains the Express API, PostgreSQL Prisma schema, and the importer that `npm run sync` uses.
- `frontend/` contains the Next.js public site, blog, account pages, and admin dashboard UI.

## Documentation

All documentation lives in [`docs/`](./docs):

| Document | What it covers |
|---|---|
| [`docs/runbook.md`](./docs/runbook.md) | Docker-first setup, database initialization, syncing, and local CLI operations |
| [`docs/roadmap.md`](./docs/roadmap.md) | Development phases, current status, and open work |
| [`docs/v2-ideation.md`](./docs/v2-ideation.md) | Open, non-committal V2 ideas for discussion |
| [`docs/packages/backend.md`](./docs/packages/backend.md) | Express API, Prisma schema, route map, database setup |
| [`docs/packages/frontend.md`](./docs/packages/frontend.md) | Next.js app, pages, API layer, SEO notes |
| [`docs/packages/cli.md`](./docs/packages/cli.md) | Scraper, normalizer, card formatting, settlement, syncing |

## Quick Start (Docker)

Docker runs the API, frontend, and PostgreSQL. Node.js is only needed on the host if you choose to run the CLI locally.

Install Docker Desktop with Linux container support enabled. From the repository root in PowerShell, set a private random `JWT_SECRET` of at least 32 characters and configure the local admin credentials in the ignored `backend/.env` file, then initialize the database:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
docker compose config --quiet
docker compose up -d db
docker compose run --rm app npm run --prefix backend prisma:generate
docker compose run --rm app npm run --prefix backend prisma:migrate -- --name init
docker compose run --rm app npm run --prefix backend seed:check
docker compose run --rm app npm run sync
docker compose up -d app
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env` before syncing. The sync promotes an existing user with that email without changing its password, or creates an active admin if the user does not exist. Passwords are stored as bcrypt hashes.

The first `docker compose run app` builds the shared image, including frontend dependencies, and can take a few minutes; later runs reuse the image.

Run daily CLI commands on the host when you want to edit and inspect dumps directly. Install CLI dependencies once:

```powershell
npm ci --prefix cli
npm run expertise
npm run settlement
```

These commands write to the shared CLI files; they do not start another API or database. Sync reviewed dumps into the Docker database with `docker compose run --rm app npm run sync`. The scrape and settlement commands can also run in Docker with `docker compose run --rm app npm run expertise` and `docker compose run --rm app npm run settlement`.

The Docker image includes CLI dependencies. When Compose first starts with an empty or older `cli_node_modules` volume, its entrypoint installs the CLI dependencies into that volume automatically. You can then run `docker compose run --rm --no-deps app npm run expertise` directly.

Stop the services while preserving data:

```powershell
docker compose down
```

`docker compose down --volumes` also erases PostgreSQL data and dependency caches. That is destructive and resets the environment.

For local development, the API, frontend, and PostgreSQL use host ports `3000`, `3001`, and `5432`. Frontend settings live in `frontend/.env`; API/database and admin settings live in `backend/.env`. The API container connects to PostgreSQL at `db:5432`; host-run CLI sync uses `localhost:5432`. Dependency and database data live in Docker volumes, so `docker compose down` keeps them. These ports and development servers are not a production deployment; keep the database private and configure production access controls before publishing the site.

## Daily Workflow

```powershell
# Morning: scrape and print cards locally, then sync the reviewed dumps into Docker
npm run expertise
docker compose run --rm app npm run sync

# Later: paste yesterday's results into cli/settlement/settlement-template.txt
npm run settlement
docker compose run --rm app npm run sync
```

`docker compose run --rm app npm run sync:prod` targets production and uses `.env.production`.

## Default Ports

| Service | Host URL | Docker Compose URL |
|---|---|---|
| Backend API | `http://localhost:3000` | `http://localhost:3000` (inside containers: `app:3000`) |
| Frontend | `http://localhost:3001` | `http://localhost:3001` |
| PostgreSQL | `localhost:5432` | `localhost:5432` (inside containers: `db:5432`) |

Use `docker compose run --rm app npm run sync` to run the local sync against the Compose database. `docker compose run --rm app npm run sync:prod` remains an explicit production operation and uses `.env.production`.

## API Areas

| Area | Current purpose |
|---|---|
| Authentication | Registration, login, profiles, password changes, and avatar upload. Emails are trimmed and lowercased for both registration and login; usernames may contain letters, numbers, dots, hyphens, and underscores (3–30 characters), and passwords require at least 8 characters. |
| Tips | Public Free tips, entitlement-gated current VIP/MaxBet feeds, a public historical archive across tiers, and admin curation under `/api/admin/tips`. Routine daily production and settlement use CLI dump → review → sync. |
| Statistics | Win rate, ROI, odds, sport/market/competition breakdowns, time-filtered analytics, and admin-only application usage |
| Products and access | Product tiers plus access tokens, which are **always issued by an admin to a registered user** |
| Administration | User, access-token, and product management; admin routes and mutation services enforce an active `ADMIN` role. Admins can change a user's role, suspend or reactivate an account, or permanently delete it. Daily tip production/settlement remains CLI dump → review → sync. |

Subscription-style access is represented by access tokens; the Prisma schema has no separate `Subscription` model.

### Access tokens

Tokens are issued **only by an admin** and **only for a specific registered, active user**:

- Creating or bulk-creating a token requires a product and an assigned user; the API rejects a missing, unknown, or suspended user.
- A token can only be redeemed by the account it was issued to, while signed in. Anonymous redemption is no longer supported.
- A token's owner cannot be changed after creation, so access cannot be transferred.
- Revoke disables a token while retaining its record; `DELETE /api/admin/subscription-tokens/:id` permanently deletes it.
- Run backend service-logic checks in Docker with `docker compose run --rm --no-deps app npm run --prefix backend test`; they use mocked persistence and do not require PostgreSQL.

### User accounts

Admins manage accounts from `/admin/users`:

- **Role** changes take effect on the account's next request; the API re-reads the user on every JWT-authenticated call.
- **Suspend / Activate** toggles the account between `SUSPENDED` and `ACTIVE` and is reversible.
- **Delete** (`DELETE /api/admin/users/:id`) permanently removes the account. Its access tokens are unassigned, and its usage events and tip authorship references are cleared, inside a single transaction so the delete cannot fail on a foreign-key constraint; those records are retained. An admin cannot delete their own account, and the last active admin cannot be deleted, demoted, or suspended.

## V1 Status

V1 feature work is complete. The codebase includes the daily scrape → review → sync workflow; public Free tips; access-controlled VIP and MaxBet feeds; archives and transparent performance statistics; accounts, admin curation, access-token redemption, and a content/blog area. The API, frontend, and PostgreSQL run through Docker Compose.

The project is **under active testing and validation** across all core functionality: authentication and account flows, tip publication and settlement, access-token redemption, admin curation, archive and stats accuracy, and frontend-to-API acceptance. Backend service tests, CLI scraper/contract/settlement tests, and the frontend lint and optimized production build all pass; the only outstanding warning is the existing profile-page `<img>` optimization notice.

Production deployment, origin isolation, backup/restore, and final real-user acceptance remain the final launch steps. This is a step closer to live.

### Current verification

- All routes, the frontend-to-API contract, and access-control logic are reviewed and consistent.
- The frontend API layer (auth, tips, stats, subscriptions, products, admin) matches the backend route map — all endpoints align.
- Docker Compose reports the application container running and PostgreSQL healthy.
- Backend service tests, CLI scraper/contract/settlement tests pass; frontend lint and the optimized production build pass with one existing `img` optimization warning in the profile page.
- SEO uses `NEXT_PUBLIC_SITE_URL` for canonical URLs, social metadata, sitemap, and robots.
- Admins can settle a single tip and assign an outcome to every selection in that tip in one save.

These checks verify code-level tests and a local build only; they do not exercise a production database, browser account flows, edge configuration, origin firewall, or database recovery. Public historical archive and tier performance routes remain available to website visitors. Deployment bot controls are intended to deter automated extraction without introducing a content paywall.

| Area | Implemented in V1 | Still needs work or validation |
|---|---|---|
| CLI | Scrape/normalize/export, sport-aware channel formatting, local JSON dumps, manual settlement, and repeatable database sync. | Telegram publishing and live-score settlement are not automated. Review scrape and settlement output before sync. |
| Backend | Express/Prisma REST API, accounts, token-based product access, tip administration, archives, statistics, and usage tracking. | Developer API services are a V2 idea. Finish real-user/database-backed acceptance and reconcile data before launch. |
| Frontend | Next.js public pages, account/profile pages, transparent archives and stats, product access, editorial content, and admin pages. | UI-to-API acceptance is still required across the full set of customer and admin workflows. |
| Operations | Docker Compose for API, frontend, and PostgreSQL; separate `backend/.env` and `frontend/.env`; standard host/container ports. | Production deployment, security review, backups/restores, monitoring, and release acceptance remain open. |

The current release scope and remaining acceptance work are in [`docs/roadmap.md`](./docs/roadmap.md). [`docs/v2-ideation.md`](./docs/v2-ideation.md) is a separate, open proposal for possible future enhancements; it is not a V1 commitment.

### Operational Notes

- **Settlement flows to the database.** `npm run settlement` records results in the dump (defaulting to yesterday's file, or an explicit `--date`); `docker compose run --rm app npm run sync` publishes them, so win rate and ROI update automatically. Review the generated settlement before syncing.
- **Settlement defaults are channel-aware.** An unmarked free-channel pick settles as a **loss**; an unmarked paid-group (VIP/MaxBet) pick settles as a **win**. Explicit `✅✅` / `❎❎` markers always override the default, a `Refunded ♻️♻️` card settles as **void**, and a `Plays today...♻️♻️` card settles as a **win** for the day it was published while being flagged **carried forward** for the next day's settlement (`npm run --prefix cli settlement next`).
- **Live tips are day-scoped.** Daily tips are intended to show the current Nairobi day across tiers; historical tips belong in the archive. Admin tip management defaults to today and provides today/yesterday filters for daily review and settlement.
- **Admins see every tier.** The tips page loads Free, VIP, and MaxBet for an admin account; the public tips list intentionally exposes only the public (Free) product.
- **Single-tip settlement supports every selection.** From Admin → Tips, choose Settle, set the overall outcome, then set each selection's outcome (or apply the overall outcome to all) and save once.
- **Syncing is safe and idempotent.** The Docker sync command validates every dump before writing, masks the database password in its output, and refuses to run against a half-configured environment. Running it repeatedly never duplicates tips or discards settled results.
- **Regenerate the Prisma client** after any `schema.prisma` change (`docker compose run --rm app npm run --prefix backend prisma:generate`). A stale client silently omits newly added models and causes runtime failures in code that references them.

## License

MIT License.