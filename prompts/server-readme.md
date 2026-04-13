# btc-yield

Minimal v1 backend scaffold for Sundial Bitcoin yield coordination.

## Prerequisites

- Node.js 24+ (recommended)
- npm 10+

## Environment

Create local env files before running the services:

```bash
cp .env.api.example .env.api
cp .env.indexer.example .env.indexer
```

API runtime env (`.env.api`) must define:

- `NODE_ENV` (`development` for local Docker usage, `production` disables Swagger)
- `PORT` NestJS port
- `BTC_NETWORK` (`mainnet` or `testnet`)
- `NODE_AUTH_TOKEN` (GitHub Packages token for `@sundial-protocol/*` private packages)
- `READINESS_DB_TIMEOUT_MS` (database readiness timeout in ms)
- `DATABASE_HOST` (for Docker Compose use `postgres`)
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `DATABASE_URL` (for Docker Compose use `postgresql://...@postgres:5432/...`)

Indexer runtime env (`.env.indexer`) must define:

- all DB/readiness/network variables above except `PORT`
- `MIN_CONFIRMATIONS_REQUIRED`
- `BITCOIN_RPC_URL`
- either `BITCOIN_RPC_AUTH` or both `BITCOIN_RPC_USER` and `BITCOIN_RPC_PASSWORD`
- `BITCOIN_ZMQ_HASHBLOCK_ENDPOINT`
- `BITCOIN_ZMQ_HASHBLOCK_TOPIC`
- `SUNDIAL_START_HEIGHT`
- `INDEXER_POLL_INTERVAL_MS`

Runtime config is fail-closed: production code does not silently default missing env vars. Missing or malformed values throw at startup.

## Install

```bash
npm install
```

> Note: this environment may block npm registry access. If you see `403 Forbidden`, run install in a network-enabled dev/CI environment.

## Generate Prisma client:

```bash
npm run prisma:generate
```

## Build

```bash
npm run build
```

## Swagger (OpenAPI)

Swagger UI is enabled only when `NODE_ENV !== production`.

Run the API with Docker (includes Postgres):

```bash
npm run docker:up
```

Then open:

- `http://localhost:8080/docs`

Stop the stack when done:

```bash
npm run docker:down
```

Notes:

- `npm run start` is not enough in this project unless a database is already available and configured.
- `docker-compose.yml` reads API/Postgres runtime values from `.env.api` (`--env-file .env.api`, no compose defaults).
- If `NODE_ENV=production`, Swagger is intentionally disabled.

Swagger configuration:

- title: `API`
- description: `API documentation`
- version: `1.0`
- bearer auth: enabled (use the `Authorize` button in Swagger UI)

## Prisma

Generate Prisma client (for Prisma 7, provide a datasource URL while generating):

```bash
export DATABASE_URL="memory://" npm run prisma:generate
```

Apply versioned migrations (CI/prod path):

```bash
npm run prisma:migrate:deploy
```

## Tests

API unit tests:

```bash
npm run test:api:unit
```

API integration tests (Vitest + PGlite, no Docker):

```bash
npm run test:api:integration
```

Run both API unit + integration:

```bash
npm run test:api
```

Run API unit + integration + Dockerized live E2E:

```bash
npm run test:api:all
```

API unit coverage:

```bash
npm run test:api:cov
```

### Dockerized live E2E (NestJS + Postgres)

The E2E flow runs against a **live API** on `http://localhost:8080` with Postgres in Docker.

Required tools:

- Docker Engine + Docker Compose plugin (`docker compose`)
- `curl`

Before running Dockerized E2E, ensure `NODE_AUTH_TOKEN` is set in `.env.api`; it is passed as a Docker build arg so `npm ci` can install private GitHub Packages dependencies during image build.

Useful npm commands:

```bash
# Bring up api + postgres in the background
npm run e2e:up

# Run only the live E2E spec against localhost:8080
npm run e2e:spec

# Full E2E flow (up -> wait for /health/live + /health/ready -> run tests -> teardown)
npm run test:api:e2e

# Bring up the no-node system stack (api + postgres + indexer) against a fake Bitcoin node harness
npm run e2e:system:e2e-no-node:up

# Run the aggregated no-node system scenarios against localhost:8080
npm run e2e:system:e2e-no-node:spec

# Full no-node system flow (build -> run api/postgres/indexer -> run tests -> teardown)
npm run test:system:e2e-no-node

# Run all system tests
npm run test:system

# Tear down containers/volumes manually
npm run e2e:down

# Tear down the no-node system containers/volumes manually
npm run e2e:system:e2e-no-node:down
```

What `npm run test:api:e2e` does:

1. `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build`
2. polls `GET /health/live` and `GET /health/ready` until ready
3. runs `apps/api/test/e2e/live-server.e2e.test.ts`
4. tears down with `docker compose -f docker-compose.yml -f docker-compose.e2e.yml down -v`

E2E-only deterministic seed data (provider/program UUIDs) is mounted from `apps/api/test/e2e/postgres-init/02_seed.sql` through `docker-compose.e2e.yml`, so default `docker compose up` does not seed test fixtures.

`npm run test:system:e2e-no-node` is a system-level no-node E2E. It runs the real API, Prisma/Postgres repositories, and the real indexer in Docker, but replaces the Bitcoin node with a host-side fake node harness. The test process acts as the tester: it appends Bitcoin-like blocks to the fake node, the harness serves them over JSON-RPC, and publishes `hashblock` notifications over ZMQ so the Dockerized indexer receives them through its normal plumbing. No API or indexer methods are mocked in this flow. The executable test entrypoint is the scenario aggregator at `apps/api/test/e2e/scenarios/index.test.ts`.

Other useful top-level commands:

```bash
# Full API + indexer unit/integration/coverage/system test bundle
npm run tests:all

# Full quality + security + tests gate
npm run test:all

# Format / lint / type / static hygiene
npm run quality:all
```

## Project layout

- `apps/api/src/` – NestJS app runtime modules/services/controllers
- `apps/indexer/src/` – Indexer
- `packages/db/prisma/schema.prisma` – Prisma schema
- `packages/db/prisma/migrations/` – versioned SQL migrations
- `apps/api/test/unit/` – Vitest unit tests (repository-mocked service tests + DTO validation)
- `apps/api/test/integration/` – integration tests against in-memory PGlite via Prisma adapter

## Indexer (v1)

The indexer treats Bitcoin Core ZMQ `hashblock` as a wakeup signal and keeps correctness via JSON-RPC + a durable DB cursor (`chain_cursor`).

Environment variables:

- `BITCOIN_RPC_URL` (example: `http://127.0.0.1:8332`)
- `BITCOIN_RPC_USER` / `BITCOIN_RPC_PASSWORD` or `BITCOIN_RPC_AUTH` (`user:password`)
- `BITCOIN_ZMQ_HASHBLOCK_ENDPOINT` (example: `tcp://127.0.0.1:28333`)
- `BITCOIN_ZMQ_HASHBLOCK_TOPIC`
- `SUNDIAL_START_HEIGHT`
- `INDEXER_POLL_INTERVAL_MS`
- `MIN_CONFIRMATIONS_REQUIRED` (promotes `DEPOSIT_SEEN` -> `DEPOSIT_CONFIRMED`)
- `BTC_NETWORK` (`mainnet` or `testnet`)

Notes:

- `BITCOIN_RPC_AUTH` is optional only if both `BITCOIN_RPC_USER` and `BITCOIN_RPC_PASSWORD` are provided.
- Missing or malformed indexer env values throw during startup; there are no production fallbacks.

Run locally after build:

```bash
npm run build
npm run start:indexer
```

Run indexer test suite:

```bash
npm run test:indexer
```

Run indexer unit tests only:

```bash
npm run test:indexer:unit
```

Run indexer integration tests only:

```bash
npm run test:indexer:integration
```

Run indexer coverage (unit + integration):

```bash
npm run test:indexer:cov
```

## Current API surface (v1)

- `POST /v1/users/deposits/intent`
- `POST /v1/users/deposits/intent-psbt`
- `GET /v1/users/deposits/intent/:deposit_id`
- `GET /v1/users/deposits/intents/:user_beneficiary_address`
- `GET /v1/users/:beneficiary_address/claimable`
- `GET /health/live`
- `GET /health/ready`
- `GET /v1/providers`
- `GET /v1/providers/:providerId/claimable`
- `POST /v1/providers/deposits/intent`
- `POST /v1/providers/deposits/intent-psbt`
- `GET /v1/providers/:providerId/distributions/due?within_days=X`

Route semantics:

- `GET /v1/providers/:providerId/claimable` returns provider claimable deposits in `DEPOSIT_CONFIRMED`.
- `GET /v1/providers/:providerId/distributions/due?within_days=X` returns deposits eligible to be included in FINAL distribution registration, not existing `Distribution` records.
- `POST /v1/providers/deposits/intent` registers a FINAL distribution intent and creates both the `Distribution` and its `DistributionAllocation` rows in `INTENT_CREATED`.
- `POST /v1/providers/deposits/intent-psbt` follows the same intent registration flow and additionally validates `psbt_base64` in the request payload.
- `GET /v1/users/:beneficiary_address/claimable` returns user claimable deposits in `DISTRIBUTION_CONFIRMED`.

Current product scope:

- v1 supports `DistributionType.FINAL` only.
- Periodic distributions are not part of the current runtime API surface.
