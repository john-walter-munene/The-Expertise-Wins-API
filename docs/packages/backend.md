# The Expertise Wins — Express Backend API

The `backend` directory contains the Express API, Prisma schema, and historical-tip importer for **The Expertise Wins**. Tip mutations and admin operations require an active admin account. Service-logic tests run with persistence mocked; final MVP acceptance still requires operator testing against a configured database.

## 📌 Features & Responsibilities

- **Authentication**: Passport Local and JWT authentication are implemented in source. Admin endpoints enforce the `ADMIN` role.
- **Tips & Curation Engine**: Includes public Free and token-gated current VIP/MaxBet endpoints, a public historical archive across active tiers, tip details, and admin-only mutations.
- **Performance & Analytics Engine**: Calculates real-time win rates, estimated ROI, average odds, sport breakdowns, market performance, time-based reports, and admin-only application usage summaries for the last 30 days.
- **Products & Access**: Manages products and access-token issuance/redemption. Access is represented by tokens; there is no separate `Subscription` database model.
- **Access token issuance**: Tokens are created only through admin routes and are always assigned to one registered, active user. A missing, unknown, or suspended user is rejected, redemption requires signing in as that user, and a token's owner cannot be changed after creation.
- **Admin Management API**: Endpoints for tip publication/settlement, access tokens, user roles/status, user deletion, and products. Routes require an authenticated admin account.
- **Account deletion (admin)**: `DELETE /api/admin/users/:id` permanently removes an account. Access tokens issued to the user, their usage events, and tips they authored or published are detached first inside one transaction, so the delete cannot fail on a foreign-key constraint; the token, usage, and tip records themselves are retained. An admin cannot delete their own account. Suspension (`PATCH /api/admin/users/:id/status`) remains the reversible alternative.
- **Settlement**: An admin can settle one tip with an overall result and per-selection outcomes in one request. Every outcome must be valid and the submitted selection outcome count must match the tip's selections; all changes are saved in one database update.
- **Source privacy**: Public tip responses strip source identifiers, source URLs, provider labels, and source-only metadata; source analytics endpoints are admin-only.
- **Usage tracking**: Finished `/api` requests record a `UsageEvent` row (path, user, status code) for the admin usage dashboard. Repeated GET requests from the same browser to the same route within a short development-mode window are counted once; write requests remain individually recorded. Usage writes are best-effort and cannot fail a real API response. The dashboard's daily series is grouped by Nairobi calendar day.

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database ORM**: Prisma ORM with PostgreSQL
- **Authentication**: Passport.js & JWT (`jsonwebtoken`)
- **Validation**: Joi validation schemas (auth payloads) and strict zod schemas (`backend/schemas/`) for admin and token routes

## 📡 API Route Architecture

- `/api/auth`: User registration, login, logout, profile read/update (`GET/PATCH /me`), password updates, and avatar upload. Emails are trimmed and lowercased on both registration and login, so casing and surrounding whitespace never affect uniqueness or sign-in.
- `/api/tips`: Public Free reads (`/`, `/free`), entitlement-gated current VIP/MaxBet reads, a public historical archive across tiers, and tip details. This router is read-only; routine tip curation and settlement start from CLI dumps.
- `/api/stats`: Comprehensive analytics, win rates, ROI, sport/market breakdowns, and time period statistics.
- `/api/products`: Public and authenticated product tier information.
- `/api/subscriptions`: Active subscriptions, token redemption (`/redeem`, requires the assigned user to sign in), token verification, and subscription history.
- `/api/admin`: Active-admin-only user, tip curation/publication, access-token, and product management. Admin user management supports role/status changes and permanent deletion (`DELETE /users/:id`). Tokens can be revoked (retain audit record) or permanently deleted. Routine daily tip settlement remains CLI dump → review → sync.

Single-tip settlement is `POST /api/admin/tips/:id/settle` with `{ "outcome": "WON", "result": "2-1", "selectionOutcomes": ["WON", "VOID"] }`. `selectionOutcomes` is optional for older callers; when provided it must include one valid result per selection. Supported outcomes are `WON`, `HALF_WON`, `LOST`, `HALF_LOST`, `VOID`, `PUSH`, and `CANCELLED`. The admin UI lets the operator set each selection separately or copy the overall result to all selections before saving. Send an `Idempotency-Key` header to make a retried settlement replay the original response instead of settling twice; a tip that is already settled can only be replayed with the same outcome.

## Verification Status

The project is under **active testing and validation**. The full frontend-to-API contract has been reviewed: every frontend API call in `auth.api.js`, `tips.api.js`, `stats.api.js`, `subscriptions.api.js`, `products.api.js`, and `admin.api.js` matches a corresponding backend route. No missing or mismatched endpoints were found. Backend and CLI test suites pass, frontend lint and the optimized Next.js production build pass, and changed backend files pass Node syntax checks. Frontend lint/build retain one existing profile-page image optimization warning. These results verify code-level tests and a local frontend build only; this review did not run browser account flows, current database settlement acceptance, edge controls, or production-origin checks.

### Known Data State

The dated CLI dumps under `cli/settlement/previous-day-results/` currently hold **572 tip records across 21 files: 419 wins, 37 losses, and 116 pending**. Dump and database outcomes still need reconciliation; metrics change as records are settled and synced. See [`../roadmap.md`](../roadmap.md) for the project status.

The outcome totals above are a dated development snapshot only. Later scrapes and settlements change both the local dumps and database; reconcile their outcomes before treating either record as authoritative.

## Access Token Rules

Access tokens are minted only by an admin and always belong to one registered account:

- `POST /api/admin/subscription-tokens` and the bulk variant require both a product and an `assignedUserId`. The API rejects a missing user, an unknown user id, or a user whose status is not `ACTIVE`. Bulk creation is capped at 100 tokens and any supplied `expiresAt` must fall between 1 and 365 days from now.
- `POST /api/subscriptions/redeem` requires authentication. Only the account a token was issued to can redeem it; a token assigned to someone else returns 403, and an unassigned token is rejected.
- `PATCH /api/admin/subscription-tokens/:id` refuses to change `assignedUserId`, so access cannot be transferred after a token is created.
- The raw token code is returned only in the create response; only a hash is stored.
- `POST /api/admin/subscription-tokens/:id/revoke` disables a token but keeps the row for audit. `DELETE /api/admin/subscription-tokens/:id` permanently removes it (404 when the id does not exist).

Because redemption is account-bound, the anonymous redemption path described in earlier revisions no longer exists.

## Tip and Archive Day Selection

`/api/tips` and its tier variants are pinned to the current Nairobi business day. If today's scrape has not been published, the live list is empty; it does not silently substitute an earlier day. Historical records are served through the public `/api/tips/archive`, which includes published tips across active tiers, excludes today and future dates, and defaults to the previous Nairobi day when no date range is supplied. Responses include the served `day` value. Edge bot controls at deployment should deter automated extraction while leaving these routes available to website visitors.

Admins can read every live tier through `/api/tips/vip` and `/api/tips/maxbet`. The public `/api/tips` list intentionally exposes only public (Free) products. Product performance endpoints for VIP and MaxBet are also public to support transparent results. API requests and responses are routed through the existing protected admin endpoint for single-tip settlement.

## Account validation rules

Registration, login, and profile updates share one set of rules in `backend/middleware/validation.js`. Registration and login payloads are validated by Joi before the controller runs; failures return `400` with a `details` array of per-field messages.

| Field | Rule |
|---|---|
| `email` | Must be a valid email address. Trimmed and lowercased before the uniqueness check and before storage, so `User@Example.com` and `user@example.com` are the same account. |
| `username` | Required, trimmed, 3–30 characters. Letters, numbers, dots, hyphens, and underscores are accepted. |
| `password` | Required, at least 8 characters. Stored as a bcrypt hash; never returned by the API. |
| `firstName`, `lastName` | Optional, trimmed, up to 50 characters. Empty strings are accepted and stored as provided. |

The username rule previously rejected any non-alphanumeric character, which made names such as `expert_tipster` fail even though the registration form suggests that format. The rule now matches what the form offers. A duplicate email or username returns `409`; an invalid payload returns `400`.

## Request validation and authorization guards

Every protected route is validated and authorized before its controller runs.

- **Router-level auth/RBAC**: `/api/admin` mounts `authenticate` + `requireRole("admin")` at the router level. `authenticate` (in `backend/middleware/authorize.js`) runs passport and then guarantees `req.user` exists and is active; a request that resolves no user is answered 401 by the guard itself, never handed to a handler. `/api/subscriptions` uses router-level `authenticate`; `/api/tips/vip`, `/api/tips/maxbet`, and authenticated routes on products/stats use it per route. User management, role changes and settlement also re-verify the actor inside the service, so direct service calls cannot bypass the route guard.
- **Strict body schemas (no mass assignment)**: Admin and token bodies are parsed by strict zod schemas in `backend/schemas/`. Unknown keys are rejected with a 400, so `role`, `status`, `assignedUserId`, `createdById`, or a client-chosen `tokenHash` cannot be smuggled into a service. The controllers read the parsed value, and the services apply a second field allowlist before writing.
- **Object-level checks (IDOR)**: Route ids are validated against the cuid format by `validateParams` and again in the service. A malformed id returns 400 before any Prisma call. Customer token routes are scoped by `assignedUserId`, so another user's access id resolves to 404. Admin users cannot delete their own account, and the last active admin cannot be deleted, demoted, or suspended.
- **Bounded bulk operations**: Bulk tip routes accept at most 100 ids per request (duplicates removed, each id format-checked), and bulk token creation is capped at 100. Bulk settlement runs in one `$transaction` over that bounded set.
- **Settlement state machine and idempotency**: `outcome` is a required enum. A tip may move to `SETTLED` only from a live state; an already-settled tip can only be replayed with the identical outcome, and a cancelled tip is final (settling, cancelling, or deleting it again is a 409 before any write). `POST /api/admin/tips/:id/settle` and `/tips/bulk/settle` accept an optional `Idempotency-Key` header (8–128 characters); a replay with the same key returns the original response instead of settling twice. Keys are held in memory with a 24-hour TTL and a bounded size.
- **Token lifecycle**: Token creation accepts an expiry only inside a 1–365 day window, and extend/renew days are clamped to 1–365. Revoked or expired tokens can never be reactivated or extended; a new token must be issued.
- **Query allowlists and pagination**: Admin list queries are validated by strict schemas with `limit` capped at 100 and only documented filters accepted (`page`, `limit`, `status`, `role`, and so on); unknown query parameters are rejected rather than forwarded to a where clause. Stats services read only the `period`/`product` filters through `pickStatsQuery`.
- **Sanitized errors**: `backend/middleware/errorHandler.js` is the single failure path. Errors with an explicit 4xx status keep their client-facing message; Prisma `P2002`/`P2025`/validation errors map to a generic 409/404/400 without query or field meta; malformed JSON is a 400; everything else is logged server-side and returned as a generic 500. Stack traces, Prisma meta, SQL, and connection details never reach the client.

## Mutation and authorization rules
- The public `/api/tips` router is read-only. Tip mutations are available only under `/api/admin/tips` and require an active admin JWT; AdminService independently verifies the actor before each mutation. The routine source-of-truth workflow is CLI dump → review → sync.
- Every `/api/admin` route is protected by JWT authentication and the active-admin guard. AdminService mutation methods also require an actor id and independently verify the actor is an active `ADMIN`, so direct service calls cannot bypass the route guard.
- The JWT strategy reloads the current user and rejects missing or non-active accounts. The admin guard separately requires `role === ADMIN` and an active status.
- Public and protected read visibility continues to be enforced by publication and product entitlements. Paid tips require a current user entitlement (admins may inspect them).
- Tip/source-of-truth operating workflow: edit/scrape/settle CLI dump files, review output, then sync into Docker PostgreSQL. The frontend admin page also includes protected tip curation controls; access-token and product controls remain active-admin-only.
- Token revoke preserves history. `DELETE /api/admin/subscription-tokens/:id` permanently removes a token and is deliberately distinct from revoke.
- User deletion is permanent and distinct from suspension. `DELETE /api/admin/users/:id` requires an active admin, returns `404` for an unknown id, and returns `400` for the actor's own account. Before deleting, the service detaches the user's access tokens (`assignedUserId` set to null), usage events (`userId` set to null), and tips they created or published, all inside one transaction, so FK constraints cannot block the delete. Token, usage, and tip records are retained.

## Backend logic tests
Run the backend service-logic checks in Docker with `docker compose run --rm --no-deps app npm run --prefix backend test`. These tests exercise service validation and decisions with mocked Prisma persistence; they do not require PostgreSQL and do not test Prisma itself. They cover active-admin authorization, tip mutation and settlement invariants, token ownership/hash behavior, revocation versus permanent deletion, invalid/missing inputs, router-level auth/RBAC wiring, strict schema rejection of unknown keys, id format checks and bounded bulk input, the settlement state machine and idempotency keys, token lifecycle bounds, query allowlists, and the sanitized error handler. They are an MVP logic baseline, not full HTTP/database integration coverage.

## Docker Database Setup

The Compose database is the supported local database. From the repository root, create both application env files and start the stack:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
docker compose up -d db
```

The database is available on the host at `localhost:5432` for optional local CLI sync. The API container connects to `db:5432`. Initialize the schema and verify the seed data inside Docker:

```powershell
docker compose run --rm app npm run --prefix backend prisma:generate
docker compose run --rm app npm run --prefix backend prisma:migrate -- --name init
docker compose run --rm app npm run --prefix backend seed:check
docker compose run --rm app npm run sync
docker compose up -d app
```

### Environment Variables

`backend/.env` is gitignored. `.env.example` contains local Docker database defaults; replace the JWT secret and admin credentials before use. The backend container overrides the database hostname to `db`, while host-run CLI sync uses `localhost`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL (`localhost:5432` for host-run sync; Compose uses `db:5432` for the API) |
| `JWT_SECRET` | Required signing key for issued JWTs; at least 32 random characters. The API rejects a missing or shorter value. |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `PORT` | API port (`3000` in the container and on the host) |
| `CORS_ORIGIN` | Comma-separated list of allowed browser origins |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials the seed promotes or creates as an admin |

### Seeding

Before running `seed`, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`. Register that email through `/api/auth/register` first if you want the normal signup flow; `seed` then promotes the existing account **without changing its password**. If no account exists for that email, `seed` creates an active admin using `ADMIN_PASSWORD`. Passwords are stored as bcrypt hashes.

The seed imports tips from `cli/settlement/previous-day-results/`, ensures the default Free, VIP, and MaxBet products exist, and creates published product assignments: non-featured football goes to Free, featured tips go to MaxBet, and other sports go to VIP. Only the Free product is public for current-day feeds; current premium lists remain access-controlled, while published historical results and performance summaries are public.

Tip ids are derived from the dump filename and the tip's position within it, so re-running the seed updates the same rows instead of duplicating them, and a tip that appears in several daily dumps stays one row per day. When refreshing an already-settled tip, the seed preserves its saved outcome, result, status, and settlement timestamp. A dump that carries a real settlement result (`win`/`lose`) is recorded as that result rather than being rewritten to `WON`.

> Prefer `docker compose run --rm app npm run sync` over calling the seed directly: it validates the dumps first and checks the database credentials before writing.

> The current dumps hold 572 tip records across 21 files (419 wins, 37 losses, 116 pending). Counts change as dumps are added or updated; run `seed:check` or `sync:dry` against the current data before writing.

## Syncing the Database

The CLI ships a single sync script that pushes the local dumps into any PostgreSQL database. It works the same for local development and production; only the env file differs.

```powershell
docker compose run --rm app npm run sync  # local Compose database
docker compose run --rm app npm run sync:prod  # production database (.env.production)
docker compose run --rm app npm run sync:dry   # validate without writing
```

The Docker command is the standard path and does not need host-installed backend dependencies. The script refuses to run when the env file is missing or when `DATABASE_URL` is absent. For production, copy `.env.production.example` to `.env.production` (gitignored) and set the real connection string. The password is masked in all output.

Sync is idempotent: it upserts tips, creates only missing publications, and never duplicates or deletes settled history.

## Running the Backend API

The API runs with the frontend in the Docker app service:

```bash
docker compose up -d app
docker compose logs -f app
```

The health endpoint is `GET /`, returning `{"status":200,"message":"The Expertise Wins API — under active testing and validation."}`.

## Regenerating the Prisma Client

`schema.prisma` defines models that the generated client must match. **After any schema change, regenerate the client:**

```powershell
docker compose run --rm app npm run --prefix backend prisma:generate
```

A stale client silently omits newly added models. Code that references a model missing from the generated client throws at runtime (for example `Cannot read properties of undefined (reading 'create')`), which surfaces as 500 errors on every affected route. The usage tracker in `backend/app.js` is written to tolerate this so analytics can never take down the process.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Every API route returns 500 | Check that `backend/.env` exists, then inspect `docker compose logs app` for the startup error. |
| `PrismaClientInitializationError: Environment variable not found: DATABASE_URL` | The backend env file is missing or Compose was started before it was created. Run `docker compose config --quiet` and recreate the app service. |
| `Authentication failed against database server` | Wrong username/password/database in `DATABASE_URL`. Confirm the credentials match your running PostgreSQL instance. |
| `Cannot read properties of undefined (reading 'create')` | The Prisma client is stale or missing a model. Run `npm run --prefix backend prisma:generate`. |
| API works but the frontend shows no data | `NEXT_PUBLIC_API_URL` in `frontend/.env` should be `http://localhost:3000/api`; recreate the frontend with `docker compose up -d app` after changing it. |
| Frontend requests blocked by CORS | Ensure `http://localhost:3001` appears in `CORS_ORIGIN` in `backend/.env`. |
| Tips or archive pages are empty | `/api/tips` is limited to today, so check whether today's scrape was synced and published. `/api/tips/archive` covers earlier Nairobi days and defaults to yesterday; check the request's `day` field and matching dated dump. |
| Win rate and ROI show `0` | Run `npm run settlement` to record results, then `docker compose run --rm app npm run sync` to publish them. |
