# Škálování e-commerce platformy pomocí logické replikace v PostgreSQL

Tento repozitář obsahuje praktickou implementaci k diplomové práci obhájené na **Univerzitě Hradec Králové (UHK), Fakultě informatiky a managementu**.

**Autor:** Bc. Lukáš Kovář  
**Téma práce:** Škálování e-commerce platformy pomocí logické replikace v PostgreSQL

Projekt demonstruje a testuje *edge-core* architekturu databázového klastru s využitím **PostgreSQL 18** a logické replikace. Architektura je navržena pro vysokou dostupnost a rozložení zátěže (škálování) v prostředí e-commerce systémů.

## Architektura a Technologie

Topologie klastru se skládá z:
* **db_core** (Primární uzel) + **db_core_replica** (Streaming fyzická replika pro High Availability).
* **db_edge1, db_edge2, db_edge3** (Okrajové uzly pro distribuci zátěže geograficky či logicky blíže aplikaci).
* Logická replikace probíhá obousměrně mezi `core` a `edge` uzly s využitím publikací a subskripcí (včetně nativní synchronizace replikačních slotů pro případy failoveru klastru).

Technologický stack:
* **PostgreSQL 18** (s nastavením `wal_level=logical` a podporou failover slotů).
* **Migrace a správa databáze:** Nástroj `migrator` napsaný v TypeScriptu využívající **Bun** a **Umzug**.
* **Aplikační vrstva:** Ukázkové REST API server (tzv. Aplikační vrstva) napsané ve frameworku **Elysia (Bun)** s typově bezpečným SQL přes **pgtyped**.
* **Load Balancer:** **OpenResty** pro efektivní směrování dotazů mezi edge servery.

## Rychlý start (Quickstart)

Veškerá infrastruktura je kontejnerizována pomocí Docker Compose. K ovládání a správě kompletního životního cyklu slouží příkazy v `Makefile`.

```bash
# Kompletní sestavení klastru (spustí databáze, provede migrace a nastaví obousměrnou logickou replikaci)
make setup

# Zastavení a a smazání všech kontejnerů a volumes
make down
```

Spuštění automatizovaných E2E a replikačních testů napříč logickým klastrem (vyžaduje dříve spuštěný `make setup`):
```bash
make test
```

Příkazy pro práci s logickou replikací:
```bash
make replication-setup     # Vytvoření publikací a subskripcí
make replication-teardown  # Odstranění replikačního nastavení na všech uzlech
make logical-core-watch    # Sledování (streamování) WAL logů z master databáze v reálném čase
```

## High Availability a Failover (HA)

Projekt podporuje přepnutí primárních uzlů (failover) na záložní `db_core_replica` při výpadku hlavní databáze bez ztráty datových proudů pro okrajové (edge) servery.

```bash
make failover-status       # Kontrola stavu clusteru (uzly, sloty, subskripce)
make simulate-core-failure # Zastavení kontejneru primárního uzlu (db_core)
make failover              # Promoční skript (povýší repliku na primární uzel a přesměruje subscription okrajových serverů)
make failback              # Vrácení systému bezpečně zpět na původní core uzel
make demo-failover         # Rychlá celková ukázka výpadku a promačního přepnutí uzlů
```

## Monitoring (Grafana + Prometheus)

Projekt obsahuje základní monitorovací stack pro PostgreSQL uzly využívající postgres_exporter:
* **Prometheus (sběr metrik):** http://localhost:9090
* **Grafana (vizualizace):** http://localhost:3010

Zapnutí monitoringu:
```bash
make monitoring-up
```

*Výchozí login do Grafany:* `admin` / `admin`
*V Grafaně doporučuji naimportovat PostgreSQL komunitní dashboard s ID `9628`.*
