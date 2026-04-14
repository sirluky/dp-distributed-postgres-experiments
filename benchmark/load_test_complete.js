import http from 'k6/http';
import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://lb:80';
const SEED_MERCHANTS = Number(__ENV.SEED_MERCHANTS || 8);
const SEED_PRODUCTS_PER_MERCHANT = Number(__ENV.SEED_PRODUCTS_PER_MERCHANT || 4);
const SCARCITY_ENABLED = false;

const actionSuccess = new Rate('action_success');
const seedSuccess = new Rate('seed_success');
const browseSuccess = new Rate('browse_success');
const cartSuccess = new Rate('cart_success');
const orderSuccess = new Rate('order_success');
const stockQuotaSuccess = new Rate('stock_quota_success');
const merchantOpsSuccess = new Rate('merchant_ops_success');

const browseDuration = new Trend('action_browse_duration_ms');
const cartDuration = new Trend('action_cart_duration_ms');
const orderDuration = new Trend('action_order_duration_ms');
const stockQuotaDuration = new Trend('action_stock_quota_duration_ms');
const merchantOpsDuration = new Trend('action_merchant_ops_duration_ms');
const scarcityDecisionLatency = new Trend('scarcity_decision_latency_ms');
const scarcityDecisionSuccess = new Rate('scarcity_decision_success');

const MERCHANT_OPS_RATIO = 0.005;
const SCARCITY_POLL_INTERVAL_MS = 100;
const SCARCITY_POLL_TIMEOUT_MS = 10000;

const jsonHeaders = { 'Content-Type': 'application/json' };

export const options = {
    scenarios: {
        ramped_mixed_workload: {
            executor: 'ramping-vus',
            stages: [
                { duration: '1m', target: 10 },
                { duration: '1m', target: 10 },
                { duration: '1m', target: 300 },
                { duration: '4m', target: 300 },
                { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        action_success: ['rate>0.90'],
        seed_success: ['rate>0.95'],
        browse_success: ['rate>0.95'],
        cart_success: ['rate>0.90'],
        order_success: ['rate>0.90'],
        stock_quota_success: ['rate>0.85'],
        merchant_ops_success: ['rate>0.90'],
        action_browse_duration_ms: ['p(95)<800'],
        action_cart_duration_ms: ['p(95)<1000'],
        action_order_duration_ms: ['p(95)<1500'],
        action_stock_quota_duration_ms: ['p(95)<3000'],
        action_merchant_ops_duration_ms: ['p(95)<5000'],
        scarcity_decision_latency_ms: ['p(95)<5000'],
        scarcity_decision_success: ['rate>0.80'],
    },
};

function safeJson(res) {
    try {
        return res.json();
    } catch (_e) {
        return null;
    }
}

function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return null;
    }
    return list[Math.floor(Math.random() * list.length)];
}

function pickRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueName(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function getOrderIdFromHeader(res) {
    if (!res || !res.headers) {
        return null;
    }
    return res.headers['X-Order-Id'] || res.headers['x-order-id'] || null;
}

function addHttpDuration(total, res) {
    if (!res || !res.timings || typeof res.timings.duration !== 'number') {
        return total;
    }
    return total + res.timings.duration;
}

function ensureMerchantProductPool() {
    const merchantsRes = http.get(`${BASE_URL}/merchants/`, { headers: jsonHeaders, tags: { name: 'seed_get_merchants' } });
    const merchants = safeJson(merchantsRes);

    if (merchantsRes.status !== 200 || !Array.isArray(merchants)) {
        seedSuccess.add(false);
        return { merchantIds: [], productIds: [] };
    }

    const merchantIds = merchants.map((m) => m.id).filter((id) => typeof id === 'number');

    const needed = Math.max(0, SEED_MERCHANTS - merchantIds.length);
    for (let i = 0; i < needed; i += 1) {
        const createRes = http.post(
            `${BASE_URL}/merchants/`,
            JSON.stringify({
                name: uniqueName('SEED_MERCHANT'),
                commissionRate: pickRandomInt(5, 25),
            }),
            { headers: jsonHeaders, tags: { name: 'seed_create_merchant' } },
        );
        const merchant = safeJson(createRes);
        const ok = createRes.status === 200 && merchant && typeof merchant.id === 'number';
        seedSuccess.add(ok);
        if (ok) {
            merchantIds.push(merchant.id);
        }
    }

    const seededMerchantIds = merchantIds.slice(0, SEED_MERCHANTS);

    for (const merchantId of seededMerchantIds) {
        for (let i = 0; i < SEED_PRODUCTS_PER_MERCHANT; i += 1) {
            const productRes = http.post(
                `${BASE_URL}/merchants/${merchantId}/products`,
                JSON.stringify({
                    name: uniqueName('SEED_PRODUCT'),
                    price: Number((10 + Math.random() * 1500).toFixed(2)),
                    isScarcityMode: SCARCITY_ENABLED,
                }),
                { headers: jsonHeaders, tags: { name: 'seed_create_product' } },
            );
            seedSuccess.add(productRes.status === 200);
        }
    }

    const productsRes = http.get(`${BASE_URL}/products/`, { headers: jsonHeaders, tags: { name: 'seed_get_products' } });
    const products = safeJson(productsRes);
    const productIds = Array.isArray(products)
        ? products.map((p) => p.id).filter((id) => typeof id === 'number')
        : [];

    seedSuccess.add(productsRes.status === 200 && productIds.length > 0);

    // Nastavíme fyzický stock pro produkty — bez toho trigger na core vždy zamítne žádosti (REJECTED_SCARCITY)
    for (const productId of productIds.slice(0, 20)) {
        http.put(
            `${BASE_URL}/merchants/products/${productId}/stock`,
            JSON.stringify({ totalPhysicalStock: 10000 }),
            { headers: jsonHeaders, tags: { name: 'seed_set_stock' } },
        );
    }

    return { merchantIds, productIds };
}

export function setup() {
    const pool = ensureMerchantProductPool();
    return {
        merchantIds: pool.merchantIds,
        productIds: pool.productIds,
    };
}

function actionBrowse(data) {
    let durationMs = 0;
    const productsRes = http.get(`${BASE_URL}/products/`, { headers: jsonHeaders, tags: { name: 'browse_products' } });
    durationMs = addHttpDuration(durationMs, productsRes);
    const products = safeJson(productsRes);
    const okProducts = productsRes.status === 200 && Array.isArray(products) && products.length > 0;
    browseSuccess.add(okProducts);
    if (!okProducts) {
        browseDuration.add(durationMs);
        return false;
    }

    const randomProduct = pickRandom(products);
    const detailRes = http.get(`${BASE_URL}/products/${randomProduct.id}`, { headers: jsonHeaders, tags: { name: 'browse_product_detail' } });
    durationMs = addHttpDuration(durationMs, detailRes);
    const batchIds = [randomProduct.id, ...(data.productIds || []).slice(0, 3)].join(',');
    const quotaBatchRes = http.get(`${BASE_URL}/inventory-quota/batch/products?productIds=${batchIds}`, {
        headers: jsonHeaders,
        tags: { name: 'browse_quota_batch' },
    });
    durationMs = addHttpDuration(durationMs, quotaBatchRes);

    const ok = detailRes.status === 200 && quotaBatchRes.status === 200;
    browseSuccess.add(ok);
    browseDuration.add(durationMs);
    return ok;
}

function actionCart(data) {
    let durationMs = 0;
    const productId = pickRandom(data.productIds);
    if (!productId) {
        cartSuccess.add(false);
        cartDuration.add(durationMs);
        return false;
    }

    const cartRes = http.post(`${BASE_URL}/cart/`, null, { headers: jsonHeaders, tags: { name: 'cart_create' } });
    durationMs = addHttpDuration(durationMs, cartRes);
    const orderId = getOrderIdFromHeader(cartRes);
    const okCart = cartRes.status === 200 && !!orderId;
    cartSuccess.add(okCart);
    if (!okCart) {
        cartDuration.add(durationMs);
        return false;
    }

    const headers = { ...jsonHeaders, 'X-Order-Id': String(orderId) };

    const addRes = http.post(
        `${BASE_URL}/cart/items`,
        JSON.stringify({ productId, quantity: pickRandomInt(1, 4) }),
        { headers, tags: { name: 'cart_add_item' } },
    );
    durationMs = addHttpDuration(durationMs, addRes);

    const itemsRes = http.get(`${BASE_URL}/cart/${orderId}/items`, { headers, tags: { name: 'cart_get_items' } });
    durationMs = addHttpDuration(durationMs, itemsRes);
    const items = safeJson(itemsRes);

    let ok = addRes.status === 200 && itemsRes.status === 200;

    if (Array.isArray(items) && items.length > 0 && Math.random() < 0.4) {
        const item = pickRandom(items);
        const delRes = http.del(`${BASE_URL}/cart/${orderId}/items/${item.id}`, null, {
            headers,
            tags: { name: 'cart_delete_item' },
        });
        durationMs = addHttpDuration(durationMs, delRes);
        ok = ok && delRes.status === 200;
    }

    cartSuccess.add(ok);
    cartDuration.add(durationMs);
    return ok;
}

function actionOrderFlow(data) {
    let durationMs = 0;
    const productId = pickRandom(data.productIds);
    if (!productId) {
        orderSuccess.add(false);
        orderDuration.add(durationMs);
        return false;
    }

    const cartRes = http.post(`${BASE_URL}/cart/`, null, { headers: jsonHeaders, tags: { name: 'order_cart_create' } });
    durationMs = addHttpDuration(durationMs, cartRes);
    const orderId = getOrderIdFromHeader(cartRes);
    if (cartRes.status !== 200 || !orderId) {
        orderSuccess.add(false);
        orderDuration.add(durationMs);
        return false;
    }

    const headers = { ...jsonHeaders, 'X-Order-Id': String(orderId) };

    const addRes = http.post(
        `${BASE_URL}/cart/items`,
        JSON.stringify({ productId, quantity: pickRandomInt(1, 3) }),
        { headers, tags: { name: 'order_cart_add_item' } },
    );
    durationMs = addHttpDuration(durationMs, addRes);

    if (addRes.status !== 200) {
        orderSuccess.add(false);
        orderDuration.add(durationMs);
        return false;
    }

    const createOrderRes = http.post(
        `${BASE_URL}/orders`,
        JSON.stringify({
            userId: pickRandomInt(1, 10_000_000),
            shippingAddress: `Load test address ${Math.floor(Math.random() * 1000)}`,
        }),
        { headers, tags: { name: 'order_create' } },
    );
    durationMs = addHttpDuration(durationMs, createOrderRes);

    const order = safeJson(createOrderRes);
    const okCreate = createOrderRes.status === 200 && order && order.id;
    if (!okCreate) {
        orderSuccess.add(false);
        orderDuration.add(durationMs);
        return false;
    }

    const orderHeaders = { ...jsonHeaders, 'X-Order-Id': String(order.id) };

    const statusRes = http.get(`${BASE_URL}/orders/${order.id}`, { headers: orderHeaders, tags: { name: 'order_status' } });
    durationMs = addHttpDuration(durationMs, statusRes);
    const patchRes = http.patch(
        `${BASE_URL}/orders/${order.id}/address`,
        JSON.stringify({ shippingAddress: `Edited address ${Math.floor(Math.random() * 1000)}` }),
        { headers: orderHeaders, tags: { name: 'order_patch_address' } },
    );
    durationMs = addHttpDuration(durationMs, patchRes);

    const payRes = http.post(`${BASE_URL}/webhooks/payment`, JSON.stringify({}), {
        headers: orderHeaders,
        tags: { name: 'order_payment_webhook' },
    });
    durationMs = addHttpDuration(durationMs, payRes);

    const ok = statusRes.status === 200 && (patchRes.status === 200 || patchRes.status === 400) && payRes.status === 200;
    orderSuccess.add(ok);
    orderDuration.add(durationMs);
    return ok;
}

// Polluje /stock-requests/:id/decision na EDGE (přes sticky routing) dokud grant nedorazí přes replikaci.
// Měří skutečný roundtrip: edge→core (replikace) → trigger → grant → core→edge (replikace).
// Vrací { decided, status, latencyMs }.
function pollStockDecision(requestId, orderId) {
    const start = Date.now();
    const deadline = start + SCARCITY_POLL_TIMEOUT_MS;
    const headers = orderId
        ? { ...jsonHeaders, 'X-Order-Id': String(orderId) }
        : jsonHeaders;

    while (Date.now() < deadline) {
        const res = http.get(
            `${BASE_URL}/stock-requests/${requestId}/decision`,
            { headers, tags: { name: 'sq_decision_poll' } },
        );

        if (res.status === 200) {
            const body = safeJson(res);
            if (body && body.decided) {
                const latencyMs = Date.now() - start;
                return { decided: true, status: body.status, latencyMs };
            }
        }

        sleep(SCARCITY_POLL_INTERVAL_MS / 1000);
    }

    return { decided: false, status: 'TIMEOUT', latencyMs: Date.now() - start };
}

function actionStockAndQuota(data) {
    let durationMs = 0;

    const cartRes = http.post(`${BASE_URL}/cart/`, null, { headers: jsonHeaders, tags: { name: 'sq_cart_create' } });
    durationMs = addHttpDuration(durationMs, cartRes);
    const orderId = getOrderIdFromHeader(cartRes);
    if (cartRes.status !== 200 || !orderId) {
        stockQuotaSuccess.add(false);
        stockQuotaDuration.add(durationMs);
        return false;
    }

    const headers = { ...jsonHeaders, 'X-Order-Id': String(orderId) };

    const productId = pickRandom(data.productIds);
    if (!productId) {
        stockQuotaSuccess.add(false);
        stockQuotaDuration.add(durationMs);
        return false;
    }

    const putQuotaRes = http.put(
        `${BASE_URL}/inventory-quota/`,
        JSON.stringify({ productId, quantity: pickRandomInt(0, 20) }),
        { headers, tags: { name: 'sq_quota_put' } },
    );
    durationMs = addHttpDuration(durationMs, putQuotaRes);

    const getQuotaRes = http.get(`${BASE_URL}/inventory-quota/${productId}`, { headers, tags: { name: 'sq_quota_get' } });
    durationMs = addHttpDuration(durationMs, getQuotaRes);
    const consumeRes = http.post(
        `${BASE_URL}/inventory-quota/consume`,
        JSON.stringify({ productId, amount: pickRandomInt(1, 2) }),
        { headers, tags: { name: 'sq_quota_consume' } },
    );
    durationMs = addHttpDuration(durationMs, consumeRes);

    // Edge vytvoří žádost lokálně (202 Accepted) — core trigger rozhodne asynchronně po replikaci
    const stockReqRes = http.post(
        `${BASE_URL}/stock-requests/`,
        JSON.stringify({ productId, requestedQty: pickRandomInt(1, 2) }),
        { headers, tags: { name: 'sq_stock_request_create' } },
    );
    durationMs = addHttpDuration(durationMs, stockReqRes);

    const ok = (putQuotaRes.status === 200 || putQuotaRes.status === 404)
        && getQuotaRes.status === 200
        && (consumeRes.status === 200 || consumeRes.status === 400)
        && stockReqRes.status === 202;

    // Pokud stock request vznikl, pollujeme EDGE na rozhodnutí (měření replikační latence H3)
    if (stockReqRes.status === 202) {
        const reqBody = safeJson(stockReqRes);
        const requestId = reqBody && reqBody.stockRequest && reqBody.stockRequest.id;
        if (requestId) {
            const decision = pollStockDecision(requestId, orderId);
            scarcityDecisionLatency.add(decision.latencyMs);
            scarcityDecisionSuccess.add(decision.decided);
            durationMs += decision.latencyMs;
        }
    }

    stockQuotaSuccess.add(ok);
    stockQuotaDuration.add(durationMs);
    return ok;
}

function actionMerchantOps(data) {
    let durationMs = 0;
    const merchantId = pickRandom(data.merchantIds);
    if (!merchantId) {
        merchantOpsSuccess.add(false);
        merchantOpsDuration.add(durationMs);
        return false;
    }

    const listRes = http.get(`${BASE_URL}/merchants/`, { headers: jsonHeaders, tags: { name: 'merchant_list' } });
    durationMs = addHttpDuration(durationMs, listRes);
    const feeRes = http.patch(
        `${BASE_URL}/merchants/${merchantId}/fee`,
        JSON.stringify({ commissionRate: pickRandomInt(1, 30) }),
        { headers: jsonHeaders, tags: { name: 'merchant_patch_fee' } },
    );
    durationMs = addHttpDuration(durationMs, feeRes);

    const productRes = http.post(
        `${BASE_URL}/merchants/${merchantId}/products`,
        JSON.stringify({
            name: uniqueName('VU_PRODUCT'),
            price: Number((5 + Math.random() * 2500).toFixed(2)),
            isScarcityMode: SCARCITY_ENABLED,
        }),
        { headers: jsonHeaders, tags: { name: 'merchant_add_product' } },
    );
    durationMs = addHttpDuration(durationMs, productRes);

    const productBody = safeJson(productRes);
    if (productRes.status === 200 && productBody && typeof productBody.id === 'number') {
        data.productIds.push(productBody.id);
    }

    // Light merchant ops mode: skip heavy aggregated /orders endpoint to avoid core latency spikes.
    const ok = listRes.status === 200 && feeRes.status === 200 && productRes.status === 200;
    merchantOpsSuccess.add(ok);
    merchantOpsDuration.add(durationMs);
    return ok;
}

function pickWorkloadAction(runtimeData) {
    if (Math.random() < MERCHANT_OPS_RATIO) {
        return () => actionMerchantOps(runtimeData);
    }

    const customerRoll = Math.random();
    if (customerRoll < 0.35) {
        return () => actionBrowse(runtimeData);
    }
    if (customerRoll < 0.65) {
        return () => actionCart(runtimeData);
    }
    if (customerRoll < 0.85) {
        return () => actionOrderFlow(runtimeData);
    }
    return () => actionStockAndQuota(runtimeData);
}

export default function (seedData) {
    const runtimeData = {
        merchantIds: [...(seedData.merchantIds || [])],
        productIds: [...(seedData.productIds || [])],
    };

    if (runtimeData.productIds.length === 0 || runtimeData.merchantIds.length === 0) {
        actionSuccess.add(false);
        sleep(0.1);
        return;
    }

    const action = pickWorkloadAction(runtimeData);
    const ok = action ? action() : false;
    actionSuccess.add(ok);

    sleep(Number(__ENV.SLEEP_SECONDS || 0.05));
}
