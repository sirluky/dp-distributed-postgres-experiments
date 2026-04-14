
# Benchmark

Pred zapnutim benchmarku je treba pripravit prostredi a zapnout monitoring, aby bylo mozne koukat na prubeh v Grafane.
```
# Inicializace
make setup
make monitoring-up
```

Benchmark, pred jejich spoustenim je vhodne provest reset pres znovu Inicializaci aby byly zajistene stejne podminky.

```
# 10min benchmark - core-only
TS=$(date +%Y%m%d-%H%M%S); docker compose run --rm --user root \
  -e BASE_URL=http://app_core:3000 \
  -e SLEEP_SECONDS=0.05 \
  -e SEED_MERCHANTS=100 \
  -e SEED_PRODUCTS_PER_MERCHANT=40 \
  k6 run \
  --out json=/benchmark-results/load-complete-coreonly-$TS.json \
  /benchmark/load_test_complete.js

# 10min benchmark - distributed přes LB
TS=$(date +%Y%m%d-%H%M%S); docker compose run --rm --user root \
  -e BASE_URL=http://lb:80 \
  -e SLEEP_SECONDS=0.05 \
  -e SEED_MERCHANTS=80 \
  -e SEED_PRODUCTS_PER_MERCHANT=40 \
  k6 run \
  --out json=/benchmark-results/load-complete-distributed-$TS.json \
  /benchmark/load_test_complete.js

```
