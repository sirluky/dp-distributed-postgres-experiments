# Copilot Instructions

## Project Overview

University thesis project (UHK) experimenting with **PostgreSQL 18 logical replication** in a distributed edge/core architecture. All infrastructure runs in Docker Compose.

## Commands

```bash
# Full cluster setup (destroy → start → migrate → configure replication)
make setup

# Start all DB nodes (core comes up first, then replica + edges)
make up-with-replica

# Run migrations on a specific node
make migrate-core
make migrate-edge1   # also edge2, edge3

# Set up / tear down logical replication between all nodes
make replication-setup
make replication-teardown

# Run tests (requires running cluster)
make test

# Stream WAL changes from core in real time
make logical-core-watch

# Failover / failback
make failover-status
make failover          # promote db_core_replica to primary
make failback          # return to db_core as primary
make failover-force    # force even if primary is reachable (risk: split-brain)

# Simulate failure scenarios
make simulate-core-failure

# Destroy everything including volumes
make down
```

### Running a single test

Tests live in `migrator/src/replication.test.ts` and run inside the migrator container:

```bash
docker compose run --rm migrator bun test --testPathPattern replication
```

The test suite requires a fully running cluster with replication configured (`make setup`).

## Architecture

```
db_core (PRIMARY, port 35432)
  └── db_core_replica (STANDBY, port 35436)   ← physical streaming replication
         ↕ logical replication
  ├── db_edge1 (port 35433, CPU 0.5 / 512MB)
  ├── db_edge2 (port 35434)
  └── db_edge3 (port 35435)
```

- All nodes run **PostgreSQL 18** with `wal_level=logical`.
- `db_core_replica` uses `pg_basebackup` on first start, then `sync_replication_slots=on` for PG18 HA slot sync.
- The `migrator` Docker service runs TypeScript migrations (Umzug + Bun) against any node on demand.
- `server/` is an Elysia (Bun) REST API that talks to `core_db` on port 35432. It is experimental and not tied to the replication setup.

## Database Names & Credentials

| Node           | Database    | Port  |
|----------------|-------------|-------|
| db_core        | core_db     | 35432 |
| db_core_replica| core_db     | 35436 |
| db_edge1       | edge1_db    | 35433 |
| db_edge2       | edge2_db    | 35434 |
| db_edge3       | edge3_db    | 35435 |

Credentials everywhere: `admin` / `admin`.

## Replication Topology

**Core → Edges** (publication `pub_core_to_edges`): master/reference data, read-only on edges.
- Tables: `core_merchants`, `core_products`, `core_inventory_ledger`, `core_stock_grants`

**Edges → Core** (publication `pub_edge_to_core`): transactional data written locally on each edge.
- Tables: `edge_orders`, `edge_order_items`, `edge_stock_requests`

All subscriptions are created with `failover=true` for PG17/18 slot synchronisation. Slots for Core→Edges are synced to `db_core_replica`; slots for Edges→Core **cannot** be synced (edges have no standby), so they are recreated after failover.

## Table Naming Convention

| Prefix  | Written on | Replicated to | Notes                             |
|---------|-----------|---------------|-----------------------------------|
| `core_` | core only  | all edges     | READ-ONLY on edges (trigger guard)|
| `edge_` | each edge  | core only     | aggregated on core                |
| `local_`| each edge  | nowhere       | edge-local state (carts, quotas)  |

## Key Conventions

- **UUIDs use `uuidv7()`** (custom PG function enabled via init SQL, not standard `uuid-ossp`). IDs are time-sortable.
- **Migrations** are `.ts` files in `migrations/` resolved by Umzug. Each file exports `up(db: Pool)` and `down(db: Pool)`. Migration state is tracked in a `migrations` table per database.
- **Migrator CLI**: `bun run src/index.ts <core|edge1|edge2|edge3> [up|down]`
- **Replication scripts**: `bun run src/replication.ts setup|teardown` and `bun run src/failover.ts status|prepare|failover|failback [--force]`
- **Read-only enforcement** on edges is done via `BEFORE INSERT/UPDATE/DELETE` triggers that check `current_setting('session_replication_role')` — triggers fire for user writes but are skipped during replication (`replica` role).
- **Test data cleanup**: test records use `replication_identity LIKE 'TEST_%'` or `name LIKE 'TEST_%'` as the cleanup key in `beforeAll`/`afterAll`.
- **Replication wait in tests**: use the `waitForReplication(pool, query, params, expectedCount)` helper (polls every 100 ms, timeout 1 s) rather than fixed sleeps.
- Comments and console output in the codebase are primarily in **Czech** (thesis project).
- The `server/` app uses **pgtyped** for type-safe SQL: SQL queries live in `*.sql` files next to `*.queries.ts` generated files. Run `bun run pgtyped` to regenerate.
