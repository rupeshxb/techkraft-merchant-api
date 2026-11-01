# Merchant Onboarding and Risk Assessment API

## Overview

A NestJS backend for onboarding merchants onto a payments platform.

- **SALES** users submit merchant applications and can edit them while they are open.
- Each new application is queued for an **asynchronous risk check** (a simulated KYB
  call) handled by a BullMQ worker.
- An **ADMIN** assigns a **REVIEWER**, who approves, rejects or asks for more information.
- Every state-changing action is written to an **audit trail** that only ADMINs can read.
- Access is enforced by role (who may call an endpoint) and by object (SALES users
  only ever see their own applications; only the assigned reviewer may decide).

## Architecture

```
                         ┌──────────────────────────────┐
   HTTP  ───────────────▶│  Global guards               │
                         │  JwtAuthGuard → RolesGuard   │
                         └──────────────┬───────────────┘
                                        │
   ┌───────────┐   ┌───────────┐   ┌────▼──────────────────┐   ┌─────────────┐
   │ AuthModule│──▶│UsersModule│◀──│ MerchantApplications  │──▶│ AuditModule │
   └───────────┘   └───────────┘   │ Module (+ policy guard)│   └──────▲──────┘
                                   └────┬──────────────▲───┘          │
                                enqueue │              │ findEntity / │
                                        │              │ applyRisk    │
                                   ┌────▼──────────────┴───┐          │
                                   │ RiskReviewModule      │──────────┘
                                   │ producer + processor  │
                                   └────┬──────────────────┘
                                        │
                                   Redis (BullMQ)        PostgreSQL (TypeORM)
```

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `AuthModule` | `POST /auth/login`, JWT strategy, `@Public()`, `@CurrentUser()` | `UsersModule` |
| `UsersModule` | `User` entity, `Role` enum, lookups | – |
| `MerchantApplicationsModule` | Applications, state machine, object-level policy guard | `AuditModule`, `RiskReviewModule` (circular, `forwardRef`) |
| `RiskReviewModule` | BullMQ queue `risk-review`: producer and worker | `AuditModule`, `MerchantApplicationsModule` (circular, `forwardRef`) |
| `AuditModule` | `audit_logs` table, `GET /audit/logs` | – |
| `common/` | `RolesGuard`, `@Roles()`, global exception filter | – |

Key points:

- `JwtAuthGuard` and `RolesGuard` are registered globally (`APP_GUARD`) in that order,
  so every route needs a valid JWT unless marked `@Public()`.
- Errors always have the shape `{ statusCode, message, error, timestamp, path }`.
- Migrations are hand-written and run automatically on startup (`migrationsRun`);
  `synchronize` is off.

## Tech Stack

NestJS 10 · TypeScript (strict) · PostgreSQL 15 + TypeORM 0.3 · Redis 7 + BullMQ ·
Passport JWT + bcrypt · class-validator / class-transformer · Swagger (OpenAPI) ·
Jest + Supertest · Docker / Docker Compose

## Setup & Running

1. **Prerequisites:** Node 20+, Docker (with Compose).
2. **Clone** the repository and `cd` into it, then `npm install`.
3. `cp .env.example .env`
4. `docker compose up -d postgres redis`
5. `npm run migration:run`
6. `npm run seed`
7. `npm run start:dev`
8. Open <http://localhost:3000/api> (Swagger). Use **Authorize** with the `accessToken`
   from `POST /auth/login`.

`docker compose up --build` runs the whole stack, app included. The app applies pending
migrations on startup; `npm run seed` still needs to be run once against the database.

Migration scripts take a path, e.g.
`npm run migration:generate -- src/database/migrations/Name`.

## Seeded Users

| Email | Password | Role |
| --- | --- | --- |
| admin@techkraft.com | Admin@123 | ADMIN |
| reviewer@techkraft.com | Reviewer@123 | REVIEWER |
| sales@techkraft.com | Sales@123 | SALES |
| sales2@techkraft.com | Sales@123 | SALES |

Two SALES users exist so object-level access can be tested. These are development
credentials only.

## API Endpoints

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | Exchange email and password for a JWT (24h) |
| GET | `/auth/me` | any authenticated | Identity from the JWT |
| POST | `/applications` | SALES | Create an application; queues the risk check |
| GET | `/applications` | ADMIN, REVIEWER, SALES | Paginated list (`status`, `page`, `limit`); SALES see only their own |
| GET | `/applications/:id` | ADMIN, REVIEWER, SALES | One application; SALES only their own |
| PUT | `/applications/:id` | SALES (owner) | Edit while `PENDING` or `INFO_REQUESTED` |
| POST | `/applications/:id/assign` | ADMIN | Assign a REVIEWER |
| POST | `/applications/:id/decision` | REVIEWER (assigned) | `APPROVED`, `REJECTED` or `INFO_REQUESTED` |
| GET | `/audit/logs` | ADMIN | Paginated audit trail, optional `entityId` filter |

List responses are `{ data, total, page, limit }` (`limit` max 50).

### Application state machine

```
PENDING ──(risk check done, or reviewer assigned)──▶ UNDER_REVIEW ──▶ APPROVED
                                                          │  ▲    └──▶ REJECTED
                                          INFO_REQUESTED ◀┘  │
                                                │            │
                                                └─ SALES edits (resubmits)
```

Anything else returns `422`. `APPROVED` and `REJECTED` are final.

## Key Design Decisions & Trade-offs

**Audit logs in PostgreSQL, not MongoDB.** This was a time-box decision: Postgres is
already in the stack, and an audit row can be written next to the business change with
no second datastore to run, secure and keep consistent. `metadata` is `jsonb`, so
event-specific context is still schemaless, and an index on `entityId` covers the
only query we need. Audit writes never throw, so a logging failure cannot break a
request. Trade-off: no append-only guarantee, and high volumes would eventually
want a dedicated store.

**Object-level authorization (OLA).** Two layers:
1. `RolesGuard` (global) checks the role from the JWT.
2. `ApplicationPolicyGuard` on `/applications/:id` loads the application and checks
   ownership (SALES) or assignment (the decision route, marked with
   `@RequireAssignedReviewer`). ADMIN always passes.

The service repeats the ownership and assignment checks, so the rules hold even if a
route forgets the guard. `findAll` filters by `createdBy` in the query, so SALES users
cannot list other people's applications. Not-found is checked before ownership, so a
SALES user can tell "does not exist" from "not yours". The guard reads the request from
the `ExecutionContext` rather than injecting `REQUEST`, which would make it
request-scoped.

**BullMQ idempotency.** Three layers:
1. The job id is `risk-check-<applicationId>`, so enqueueing the same application twice
   is a no-op.
2. The worker checks `riskProcessedAt` before doing any work and exits if it is set.
3. The result is written with one conditional `UPDATE ... WHERE riskProcessedAt IS NULL`,
   so two racing jobs cannot both win. The same statement only moves `PENDING` to
   `UNDER_REVIEW`, so a late result never reverts a decision.

Jobs retry 3 times with exponential backoff (2s). Failed jobs are kept for inspection;
completed jobs are removed. If Redis is down when an application is created, the
application is still saved and the error is logged, but nothing re-queues it later.

**State machine.** Transitions are checked in the service, not the controller, and
invalid ones throw `422`. Resubmitting after `INFO_REQUESTED` moves the application
back to `UNDER_REVIEW`.

**Known limitations.** Because the risk check moves an application to `UNDER_REVIEW`
within seconds of creation, the window in which SALES can edit a `PENDING` application
is short. The decision endpoint does not lock the row, so two simultaneous decisions
from the same reviewer could both pass the status check.

### What would be added with more time

- Field-level encryption for sensitive data (owner contact details)
- MongoDB (or another append-only store) for audit logs
- Webhook integration to notify merchants or downstream systems of decisions
- Refresh tokens and token revocation
- Rate limiting (especially on `/auth/login`)
- A scheduler to re-queue applications whose risk check never ran
- Row-level locking or optimistic versioning on decisions

## AI Tool Disclosure

Claude (Anthropic's AI assistant) was used as a coding assistant while building this
project. All generated code was reviewed and is understood by the candidate, who is
responsible for it.

## Testing

```bash
npm test            # unit tests (service and risk-review processor, no I/O)
npm run test:e2e    # integration tests with Supertest
```

The e2e suite runs against the real services, so first run
`docker compose up -d postgres redis`, `npm run migration:run` and `npm run seed`.
It starts the app in-process, including the BullMQ worker, so the risk-processing
tests wait a few seconds for the worker. It cleans up the applications and audit rows it
creates.
