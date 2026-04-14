Vysledky benchmarku z nástroje K6, terminálový výstup:

## Pouze Core

**Graficky:** core_only.html

  █ TOTAL RESULTS

    CUSTOM
    action_browse_duration_ms.........: avg=200.399149 min=1.696061  med=238.973579 max=581.850691  p(90)=274.125187 p(95)=312.054321
    action_cart_duration_ms...........: avg=246.418177 min=3.707466  med=258.785383 max=716.48605   p(90)=366.710516 p(95)=411.125121
    action_merchant_ops_duration_ms...: avg=215.112878 min=4.848987  med=251.302621 max=550.546143  p(90)=294.809461 p(95)=335.680527
    action_order_duration_ms..........: avg=540.256211 min=10.797541 med=636.628532 max=1061.459678 p(90)=754.018681 p(95)=813.289787
    action_stock_quota_duration_ms....: avg=447.42427  min=7.734598  med=529.886601 max=942.841628  p(90)=630.036428 p(95)=665.916236
    action_success....................: 100.00% 247134 out of 247134
    browse_success....................: 100.00% 172120 out of 172120
    cart_success......................: 100.00% 147160 out of 147160
    merchant_ops_success..............: 100.00% 1234 out of 1234
    order_success.....................: 100.00% 49310 out of 49310
    scarcity_decision_latency_ms......: avg=67.864736  min=0         med=81         max=411         p(90)=97         p(95)=104
    scarcity_decision_success.........: 100.00% 36950 out of 36950
    seed_success......................: 100.00% 4101 out of 4101
    stock_quota_success...............: 100.00% 36950 out of 36950

    HTTP
    http_req_duration.................: avg=76.26ms    min=299.14µs  med=82.58ms    max=484.39ms    p(90)=116.36ms   p(95)=147.93ms
      { expected_response:true }......: avg=76.13ms    min=299.14µs  med=82.55ms    max=484.39ms    p(90)=115.83ms   p(95)=147.07ms
    http_req_failed...................: 0.26%   2758 out of 1033496
    http_reqs.........................: 1033496 2096.069655/s

    EXECUTION
    iteration_duration................: avg=369.16ms   min=52.4ms    med=309.57ms   max=1.11s       p(90)=695.18ms   p(95)=730.36ms
    iterations........................: 247134  501.221174/s
    vus...............................: 4       min=0                max=300
    vus_max...........................: 300     min=300              max=300

    NETWORK
    data_received.....................: 3.1 GB  6.3 MB/s
    data_sent.........................: 183 MB  370 kB/s

## Distribuovany edge-core
**Graficky:** distributed-results.html

  █ TOTAL RESULTS

    CUSTOM
    action_browse_duration_ms.........: avg=108.302346 min=2.185199  med=101.087627 max=2298.427292 p(90)=186.843319 p(95)=211.652381
    action_cart_duration_ms...........: avg=152.583741 min=3.903247  med=152.097351 max=2099.215752 p(90)=256.998117 p(95)=288.964891
    action_merchant_ops_duration_ms...: avg=12.204624  min=4.973375  med=9.914449   max=370.862502  p(90)=18.88657   p(95)=22.79826
    action_order_duration_ms..........: avg=322.120086 min=11.445582 med=337.50927  max=2007.813111 p(90)=482.848822 p(95)=518.03825
    action_stock_quota_duration_ms....: avg=395.776914 min=23.011647 med=399.097011 max=2006.819426 p(90)=556.269673 p(95)=592.950464
    action_success....................: 99.75%  354072 out of 354953
    browse_success....................: 99.85%  246564 out of 246924
    cart_success......................: 99.88%  211184 out of 211418
    merchant_ops_success..............: 100.00% 1762 out of 1762
    order_success.....................: 99.76%  70848 out of 71017
    scarcity_decision_latency_ms......: avg=162.149687 min=1         med=149        max=709         p(90)=257        p(95)=289
    scarcity_decision_success.........: 100.00% 52650 out of 52650
    seed_success......................: 100.00% 3281 out of 3281
    stock_quota_success...............: 99.77%  52650 out of 52768

    HTTP
    http_req_duration.................: avg=44.15ms    min=32.38µs   med=38.21ms    max=2.1s        p(90)=85.31ms    p(95)=102.93ms
      { expected_response:true }......: avg=42.96ms    min=32.38µs   med=38.13ms    max=581.46ms    p(90)=85.06ms    p(95)=102.34ms
    http_req_failed...................: 0.31%   4887 out of 1534502
    http_reqs.........................: 1534502 3122.235992/s

    EXECUTION
    iteration_duration................: avg=257.01ms   min=52.91ms   med=215.71ms   max=2.34s       p(90)=486.98ms   p(95)=547ms
    iterations........................: 354953  722.219347/s
    vus...............................: 2       min=0                max=300
    vus_max...........................: 300     min=300              max=300

    NETWORK
    data_received.....................: 4.5 GB  9.3 MB/s
    data_sent.........................: 260 MB  530 kB/s