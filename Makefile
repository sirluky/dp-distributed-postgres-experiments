
# Co budu chtit za prikazy


# kompletni rozbehnuti vseho
setup: down up-with-replica migrate-all replication-setup

up:
	docker compose up -d db_core db_core_replica db_edge1 db_edge2 db_edge3
	sleep 5

up-with-replica:
	docker compose up -d db_core
	sleep 5
	docker compose up -d db_core_replica db_edge1 db_edge2 db_edge3
	sleep 5

down:
	docker compose down -v

build:
	docker compose build migrator

migrate-all: migrate-core migrate-edge1 migrate-edge2 migrate-edge3

migrate-core:
	docker compose run --rm migrator bun run src/index.ts core up

migrate-edge1:
	docker compose run --rm migrator bun run src/index.ts edge1 up

migrate-edge2:
	docker compose run --rm migrator bun run src/index.ts edge2 up

migrate-edge3:
	docker compose run --rm migrator bun run src/index.ts edge3 up

replication-setup:
	docker compose run --rm migrator bun run src/replication.ts setup

replication-teardown:
	docker compose run --rm migrator bun run src/replication.ts teardown

# ============================================================================
# Failover / Failback příkazy (PG17/18 native)
# ============================================================================

# Kontrola stavu clusteru (uzly, sloty, subscriptions)
failover-status:
	docker compose run --rm migrator bun run src/failover.ts status

# Příprava failoveru - synchronizace slotů na standby
failover-prepare:
	docker compose run --rm migrator bun run src/failover.ts prepare

# Provedení failoveru - promoce db_core_replica na primary
failover:
	docker compose run --rm --no-deps migrator bun run src/failover.ts failover

# Vynucený failover (i když je primary stále dostupný)
failover-force:
	docker compose run --rm --no-deps migrator bun run src/failover.ts failover --force

# Failback - návrat na původní db_core jako primary
failback:
	docker compose run --rm --no-deps migrator bun run src/failover.ts failback

# Vynucený failback
failback-force:
	docker compose run --rm --no-deps migrator bun run src/failover.ts failback --force

# ============================================================================
# Simulace a demo
# ============================================================================

# Simulace výpadku core
simulate-core-failure:
	docker compose stop db_core
	@echo "Core stopped. Run 'make failover' to promote replica."

# Simulace výpadku repliky (pro testování failback)
simulate-replica-failure:
	docker compose stop db_core_replica
	@echo "Replica stopped. Run 'make failback' to return to core."

# Kompletní demo failoveru
demo-failover: simulate-core-failure
	@sleep 2
	docker compose run --rm --no-deps migrator bun run src/failover.ts failover

# Kompletní demo failbacku (předpokládá že je aktivní replica)
demo-failback: simulate-replica-failure
	@sleep 2
	docker compose run --rm --no-deps migrator bun run src/failover.ts failback

test:
	docker compose run --rm migrator bun test

# založení replikačního slotu
# připojení se na replikační slot a výpis do konzole  
# založení slotu přes SQL a WATCH
logical-core-watch:
	PGPASSWORD=admin psql -h localhost -p 35432 -U admin -d core_db -v ON_ERROR_STOP=1 -c "SELECT pg_drop_replication_slot('test') WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'test');"
	PGPASSWORD=admin psql -h localhost -p 35432 -U admin -d core_db -v ON_ERROR_STOP=1 -c "SELECT pg_create_logical_replication_slot('test', 'test_decoding');"
	PGPASSWORD=admin pg_recvlogical -d core_db -h localhost -p 35432 -U admin --slot=test --start -f -

# alternativou muze byt prepared s parametrem  --two-phase

# =============================================================================
# Application Servers & Load Balancer
# =============================================================================

# Start all application servers and load balancer
app-up:
	docker compose up -d app_core app_edge1 app_edge2 app_edge3 lb

# Stop all application servers and load balancer
app-down:
	docker compose down -v --remove-orphans lb app_core app_edge1 app_edge2 app_edge3

# Start full stack (DB + apps + LB)
full-up: up-with-replica migrate-all replication-setup app-up
	@echo "Full stack is running: DB cluster + apps + load balancer"

# Start full stack with setup
full-setup: down app-up

# =============================================================================
# K6 Benchmarks
# =============================================================================

# Simple lifecycle benchmark via LB (99% order lifecycle, 1% core shop changes)
bench-lifecycle-simple:
	@echo "Running simple lifecycle benchmark via load balancer..."
	@BENCH_TS=$$(date +%Y%m%d-%H%M%S); \
	docker compose run --rm --user root \
		-e BASE_URL=$${BASE_URL:-http://lb:80} \
		-e CORE_CHANGE_RATIO=$${CORE_CHANGE_RATIO:-0.01} \
		-e VUS=$${VUS:-250} \
		-e DURATION=$${DURATION:-2m} \
		-e WRITE_SUMMARY_FILES=1 \
		-e BENCH_TS=$$BENCH_TS \
		-e OUTPUT_DIR=/benchmark-results \
		k6 run /benchmark/lifecycle-lb-simple.js

# Complete randomized benchmark with setup seeding for existing merchant/product edits
bench-load-complete:
	@echo "Running complete randomized load test via load balancer..."
	@BENCH_TS=$$(date +%Y%m%d-%H%M%S); \
	docker compose run --rm --user root \
		-e BASE_URL=$${BASE_URL:-http://lb:80} \
		-e VUS=$${VUS:-60} \
		-e DURATION=$${DURATION:-30s} \
		-e SEED_MERCHANTS=$${SEED_MERCHANTS:-8} \
		-e SEED_PRODUCTS_PER_MERCHANT=$${SEED_PRODUCTS_PER_MERCHANT:-4} \
		-e BENCH_TS=$$BENCH_TS \
		-e OUTPUT_DIR=/benchmark-results \
		-e K6_WEB_DASHBOARD=true \
		-e K6_WEB_DASHBOARD_EXPORT=/benchmark-results/k6-web-dashboard-report.html \
		k6 run /benchmark/load_test_complete.js

# A/B benchmark: distributed mode (through load balancer + edges)
bench-load-complete-distributed:
	@echo "Running load_test_complete in DISTRIBUTED mode (via LB)..."
	@BENCH_TS=$$(date +%Y%m%d-%H%M%S); \
	docker compose run --rm --service-ports --user root \
		-e BASE_URL=http://lb:80 \
		-e VUS=$${VUS:-120} \
		-e DURATION=$${DURATION:-2m} \
		-e SLEEP_SECONDS=$${SLEEP_SECONDS:-0.05} \
		-e SEED_MERCHANTS=$${SEED_MERCHANTS:-8} \
		-e SEED_PRODUCTS_PER_MERCHANT=$${SEED_PRODUCTS_PER_MERCHANT:-4} \
		-e K6_WEB_DASHBOARD=true \
		-e K6_WEB_DASHBOARD_HOST=0.0.0.0 \
		-e K6_WEB_DASHBOARD_PORT=5665 \
		-e K6_WEB_DASHBOARD_EXPORT=/benchmark-results/load-complete-distributed-$$BENCH_TS.html \
		k6 run --out json=/benchmark-results/load-complete-distributed-$$BENCH_TS.json /benchmark/load_test_complete.js

# A/B benchmark: core-only mode (directly to app_core)
bench-load-complete-core:
	@echo "Running load_test_complete in CORE-ONLY mode (app_core)..."
	@BENCH_TS=$$(date +%Y%m%d-%H%M%S); \
	docker compose run --rm --service-ports --user root \
		-e BASE_URL=http://app_core:3000 \
		-e VUS=$${VUS:-120} \
		-e DURATION=$${DURATION:-2m} \
		-e SLEEP_SECONDS=$${SLEEP_SECONDS:-0.05} \
		-e SEED_MERCHANTS=$${SEED_MERCHANTS:-8} \
		-e SEED_PRODUCTS_PER_MERCHANT=$${SEED_PRODUCTS_PER_MERCHANT:-4} \
		-e K6_WEB_DASHBOARD=true \
		-e K6_WEB_DASHBOARD_HOST=0.0.0.0 \
		-e K6_WEB_DASHBOARD_PORT=5665 \
		-e K6_WEB_DASHBOARD_EXPORT=/benchmark-results/load-complete-coreonly-$$BENCH_TS.html \
		k6 run --out json=/benchmark-results/load-complete-coreonly-$$BENCH_TS.json /benchmark/load_test_complete.js

# A/B matrix helper: run both modes sequentially
bench-load-complete-compare: bench-load-complete-distributed bench-load-complete-core
	@echo "A/B benchmark finished. Compare JSON files in benchmark/results/."

# Distributed benchmark via LB (99% order flow, 1% core mutations) - unregulated
bench-dist-unregulated:
	@echo "Running distributed unregulated benchmark (LB + edges)..."
	@BENCH_TS=$$(date +%Y%m%d-%H%M%S); \
	docker compose run --rm --user root \
		-e BENCH_MODE=unregulated \
		-e UNREGULATED_PRE_VUS=$${UNREGULATED_PRE_VUS:-250} \
		-e UNREGULATED_MAX_VUS=$${UNREGULATED_MAX_VUS:-2400} \
		-e WRITE_SUMMARY_FILES=1 \
		-e BENCH_TS=$$BENCH_TS \
		-e OUTPUT_DIR=/benchmark-results \
		k6 run /benchmark/distributed-orders-heavy.js

# Core-only benchmark (same workload, no LB) - unregulated
bench-core-unregulated:
	@echo "Running core-only unregulated benchmark..."
	@BENCH_TS=$$(date +%Y%m%d-%H%M%S); \
	docker compose run --rm --user root \
		-e BENCH_MODE=unregulated \
		-e CORE_BENCH_URL=http://app_core:3000 \
		-e UNREGULATED_PRE_VUS=$${UNREGULATED_PRE_VUS:-250} \
		-e UNREGULATED_MAX_VUS=$${UNREGULATED_MAX_VUS:-2400} \
		-e WRITE_SUMMARY_FILES=1 \
		-e BENCH_TS=$$BENCH_TS \
		-e OUTPUT_DIR=/benchmark-results \
		k6 run /benchmark/core-only-orders-heavy.js

# Full heavy benchmark matrix
bench-heavy-all: bench-dist-unregulated bench-core-unregulated
	@echo "Heavy benchmark matrix completed."

# Full edge-core comparison benchmark (comprehensive test)
bench-full:
	@echo "Running full edge-core comparison benchmark..."
	docker compose run --rm k6 run /scripts/edge-core-bench.js

# Core-only benchmark (direct to core, bypass LB)
bench-core-only:
	@echo "Running core-only benchmark..."
	docker compose run --rm -e CORE_ONLY_URL=http://app_core:3000 k6 run /scripts/quick-bench.js

# Edge-distributed benchmark (via load balancer)
bench-edge-distributed:
	@echo "Running edge-distributed benchmark..."
	docker compose run --rm -e BASE_URL=http://lb:80 k6 run /scripts/quick-bench.js

# Benchmark with results saved to file
bench-save:
	@echo "Running benchmark and saving results..."
	docker compose run --rm k6 run --out json=/results/benchmark-$$(date +%Y%m%d-%H%M%S).json /scripts/quick-bench.js

# View latest benchmark results
bench-results:
	@cat experiments/k6/results/benchmark-results.json 2>/dev/null || echo "No results found. Run a benchmark first."

# =============================================================================
# Health Checks & Status
# =============================================================================

# Check health of all services
status:
	@echo "=== Database Nodes ==="
	@docker compose ps db_core db_core_replica db_edge1 db_edge2 db_edge3
	@echo ""
	@echo "=== Application Servers ==="
	@docker compose ps app_core app_core app_edge1 app_edge2 app_edge3
	@echo ""
	@echo "=== Load Balancer ==="
	@docker compose ps lb
	@echo ""
	@echo "=== Quick Health Check ==="
	@curl -s http://localhost:8080/health || echo "LB not responding"
	@echo ""

# Health check for individual nodes
health-core:
	@curl -s http://localhost:3001/health | jq .

health-edges:
	@echo "Checking edge nodes in parallel..."
	@docker compose exec app_edge1 wget -qO- http://localhost:3000/health 2>/dev/null && echo "Edge 1: OK" || echo "Edge 1: Not responding" & \
	docker compose exec app_edge2 wget -qO- http://localhost:3000/health 2>/dev/null && echo "Edge 2: OK" || echo "Edge 2: Not responding" & \
	docker compose exec app_edge3 wget -qO- http://localhost:3000/health 2>/dev/null && echo "Edge 3: OK" || echo "Edge 3: Not responding" & \
	wait

# =============================================================================
# DB-Aware Load Balancer (pg_stat_activity-based routing)
# =============================================================================

# Check DB load balancer health (shows pg_stat_activity connection counts)
health-db-lb:
	@echo "=== DB Load Balancer Status ==="
	@curl -s http://localhost:8080/health/db | jq .

# Check LB routing decision (which backend was selected)
health-lb-routing:
	@echo "=== LB Routing Test ==="
	@curl -s -i http://localhost:8080/health 2>&1 | grep -E "(HTTP|X-DB-Backend|upstream)"

# Run connection-aware benchmark (tests pg_stat_activity-based routing)
bench-connection-aware:
	@echo "Running connection-aware load balancing benchmark..."
	@echo "This test verifies LB routes to edge with fewest active DB connections"
	docker compose run --rm k6 run /scripts/connection-aware-bench.js

# Full benchmark suite (all benchmarks including connection-aware)
bench-all: bench-quick bench-connection-aware bench-full
	@echo "All benchmarks completed!"

# View connection-aware benchmark results
bench-connection-results:
	@cat experiments/k6/results/connection-aware-results.json 2>/dev/null || echo "No results found. Run 'make bench-connection-aware' first."

# Test DB load balancer Lua script directly (via curl to health endpoint)
test-lb-lua:
	@echo "Testing Lua script via /health/db endpoint..."
	@curl -s http://localhost:8080/health/db | jq .

# =============================================================================
# Monitoring (Prometheus + Grafana + PostgreSQL Exporters)
# =============================================================================

monitoring-up:
	docker compose up -d --wait postgres_exporter_core postgres_exporter_edge1 postgres_exporter_edge2 postgres_exporter_edge3 prometheus grafana
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana:    http://localhost:3010 (admin/admin)"

monitoring-down:
	docker compose stop prometheus grafana postgres_exporter_core postgres_exporter_edge1 postgres_exporter_edge2 postgres_exporter_edge3

monitoring-status:
	@echo "=== Monitoring Services ==="
	@docker compose ps prometheus grafana postgres_exporter_core postgres_exporter_edge1 postgres_exporter_edge2 postgres_exporter_edge3

monitoring-targets:
	@echo "=== Prometheus Targets ==="
	@curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health: .health}'




