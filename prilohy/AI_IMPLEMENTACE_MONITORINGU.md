## Plan: Basic PostgreSQL Monitoring Stack

Doporučený přístup je přidat minimální observability vrstvu přímo do existujícího Docker Compose stacku: Prometheus pro sběr metrik, PostgreSQL exporter pro metriky z každého DB uzlu a Grafanu pro vizualizaci. Záměr je udělat co nejmenší zásah bez změn aplikace nebo replikace.

**Steps**
1. Fáze 1: Přidání monitoringu do orchestrace
2. V souboru compose přidat služby Prometheus, Grafana a 4 samostatné PostgreSQL exportery (core, edge1, edge2, edge3), včetně restart policy, depends_on a per-service DSN. Toto je základní nosná změna.  
*blokuje kroky 2-4*
3. Doplnit nové persistentní volumes pro Prometheus a Grafanu a ověřit, že nedojde ke kolizi portů (Prometheus 9090, Grafana 3010).  
*závisí na 1*
4. Fáze 2: Konfigurační soubory monitoringu
5. Vytvořit Prometheus config se scrape joby pro všechny exportery (a volitelně i self-scrape Promethea). Nastavit bezpečné scrape intervaly pro základní režim.  
*závisí na 1*
6. Přidat Grafana provisioning pro datasource (Prometheus), aby po startu nebyla nutná ruční konfigurace připojení.  
*parallel with step 5; závisí na 1*
7. Fáze 3: Dashboard a dokumentace
8. Přidat předpřipravený dashboard pro PostgreSQL monitoring (doporučeno community dashboard ID 9628 nebo novější oficiální postgres_exporter mixin JSON) do dashboard provisioning složky Grafany.  
*závisí na 6*
9. Do dokumentace přidat rychlý postup spuštění, přihlášení do Grafany a import/aktivaci dashboardu, plus krátký seznam klíčových panelů (connections, transactions, WAL/replication lag).  
*závisí na 8*
10. Fáze 4: Ověření funkčnosti
11. Ověřit, že všechny monitoring kontejnery běží, Prometheus vidí exporter targety jako UP a Grafana datasource je healthy.  
*závisí na 1-9*
12. Ověřit, že dashboard zobrazuje metriky pro core i všechny edge uzly a že metriky reagují na zátěž (např. při benchmarku/K6).  
*závisí na 11*

**Relevant files**
- /home/lukas/projects/uhk/distributed-postgres-experiments/compose.yml — přidání služeb prometheus, grafana, postgres exporterů a volumes
- /home/lukas/projects/uhk/distributed-postgres-experiments/monitoring/prometheus.yml — scrape konfigurace pro exportery
- /home/lukas/projects/uhk/distributed-postgres-experiments/monitoring/grafana/provisioning/datasources/prometheus.yml — auto-provisioned datasource
- /home/lukas/projects/uhk/distributed-postgres-experiments/monitoring/grafana/provisioning/dashboards/dashboards.yml — dashboard provisioning provider
- /home/lukas/projects/uhk/distributed-postgres-experiments/monitoring/grafana/dashboards/postgres-overview.json — importovaný připravený dashboard
- /home/lukas/projects/uhk/distributed-postgres-experiments/README.md — stručný návod pro monitoring stack
- /home/lukas/projects/uhk/distributed-postgres-experiments/BENCHMARKING_IMPLEMENTATION.md — doplnění o monitoring kroky při bench běhu

**Verification**
1. Spustit monitoring služby přes Docker Compose a potvrdit running stav kontejnerů.
2. V Prometheu otevřít Targets a potvrdit, že každý postgres exporter (core, edge1, edge2, edge3) je UP.
3. V Grafaně potvrdit, že datasource Prometheus je dostupný bez ruční konfigurace.
4. Otevřít PostgreSQL dashboard a ověřit data minimálně pro panely: active connections, transactions/s, cache hit ratio, replication lag/WAL.
5. Spustit krátkou zátěž (existující benchmark) a ověřit změnu metrik v čase.

**Decisions**
- Schváleno: Grafana poběží na portu 3010.
- Schváleno: Scope je čistě PostgreSQL monitoring (bez node exporteru a bez Nginx exporteru).
- In scope: Základní Prometheus + Grafana + PostgreSQL exporter konfigurace a jeden připravený dashboard.
- Out of scope: Alerting pravidla, dlouhodobá retention tuning, SSO/bezpečnost hardening Grafany, tracing stack.

**Further Considerations**
1. Dashboard doporučení: PostgreSQL Dashboard (Grafana community ID 9628) jako rychlý start; pokud budeš chtít detailnější replikaci, naváže se postgres_exporter mixin dashboard.
2. Pokud bude potřeba sledovat i load balancer, další iterace může přidat Nginx/OpenResty exporter a navazující dashboard (mimo aktuální scope).