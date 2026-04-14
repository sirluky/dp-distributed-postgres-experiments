/**
 * Integrační testy e-commerce POC.
 *
 * Vyžaduje běžící cluster s replikací: `make setup`
 *
 * Spuštění:
 *   cd server && bun test
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { createApp } from "./app";

// ---------------------------------------------------------------------------
// DB Pools — přímé připojení na localhost (host-exposed porty z compose.yml)
// ---------------------------------------------------------------------------

const corePool = new Pool({
  host: "localhost",
  port: 35432,
  database: "core_db",
  user: "admin",
  password: "admin",
});

const edge1Pool = new Pool({
  host: "localhost",
  port: 35433,
  database: "edge1_db",
  user: "admin",
  password: "admin",
});

// ---------------------------------------------------------------------------
// Elysia app instance — edge1 pro zákaznické operace, core pro obchodní
// ---------------------------------------------------------------------------

const edgeApp = createApp(edge1Pool, { edgeId: "TEST_edge1" });
const coreApp = createApp(corePool, { edgeId: "TEST_core" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function req(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
) {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...(extraHeaders ?? {}) },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.handle(new Request(`http://localhost${path}`, init));
}

async function waitForReplication<T = any>(
  pool: Pool,
  query: string,
  params: any[] = [],
  expectedCount = 1,
): Promise<T[]> {
  const timeout = 5_000;
  const interval = 200;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { rows } = await pool.query(query, params);
    if (rows.length >= expectedCount) return rows as T[];
    await Bun.sleep(interval);
  }
  const { rows } = await pool.query(query, params);
  return rows as T[];
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  // Clean edge tables on edge1 only (they replicate to core automatically)
  await edge1Pool
    .query(
      "DELETE FROM edge_order_items WHERE product_id IN (SELECT id FROM core_products WHERE name LIKE 'TEST_%')",
    )
    .catch(() => { });
  await edge1Pool
    .query(
      "DELETE FROM edge_order_items WHERE order_id IN (SELECT id FROM edge_orders WHERE replication_identity LIKE 'TEST_%')",
    )
    .catch(() => { });
  await edge1Pool
    .query("DELETE FROM edge_orders WHERE replication_identity LIKE 'TEST_%'")
    .catch(() => { });
  await edge1Pool
    .query("DELETE FROM edge_stock_requests WHERE replication_identity LIKE 'TEST_%'")
    .catch(() => { });
  await edge1Pool
    .query(
      "DELETE FROM local_cart_items WHERE cart_id IN (SELECT id FROM local_carts WHERE session_id LIKE 'TEST_%')",
    )
    .catch(() => { });
  await edge1Pool
    .query("DELETE FROM local_carts WHERE session_id LIKE 'TEST_%'")
    .catch(() => { });
  await edge1Pool
    .query(
      "DELETE FROM local_inventory_quota WHERE product_id IN (SELECT id FROM core_products WHERE name LIKE 'TEST_%')",
    )
    .catch(() => { });

  // Wait for edge deletes to replicate to core before touching core tables
  await Bun.sleep(2000);

  // Clean core tables (only on core, they replicate to edges)
  await corePool
    .query(
      "DELETE FROM core_payouts WHERE merchant_id IN (SELECT id FROM core_merchants WHERE name LIKE 'TEST_%')",
    )
    .catch(() => { });
  await corePool
    .query("DELETE FROM core_products WHERE name LIKE 'TEST_%'")
    .catch(() => { });
  await corePool
    .query("DELETE FROM core_merchants WHERE name LIKE 'TEST_%'")
    .catch(() => { });
  await Bun.sleep(2000);
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await corePool.end();
  await edge1Pool.end();
});

// ---------------------------------------------------------------------------
// Testy — end-to-end flow přes API
// ---------------------------------------------------------------------------

describe("NODE_ROLE — edge/core mode", () => {
  test("edge mode: merchants endpoint is not available", async () => {
    const edgeOnly = createApp(edge1Pool, {
      edgeId: "TEST_edge1",
      role: "edge",
    });
    const res = await edgeOnly.handle(
      new Request("http://localhost/merchants"),
    );
    expect(res.status).toBe(404);
  });

  test("core mode: cart endpoint is available", async () => {
    const coreOnly = createApp(corePool, {
      edgeId: "TEST_core",
      role: "core",
    });
    const res = await coreOnly.handle(
      new Request("http://localhost/cart", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  test("products available in both edge and core mode", async () => {
    const edgeOnly = createApp(edge1Pool, {
      edgeId: "TEST_edge1",
      role: "edge",
    });
    const coreOnly = createApp(corePool, {
      edgeId: "TEST_core",
      role: "core",
    });
    const resEdge = await edgeOnly.handle(
      new Request("http://localhost/products"),
    );
    const resCore = await coreOnly.handle(
      new Request("http://localhost/products"),
    );
    expect(resEdge.status).toBe(200);
    expect(resCore.status).toBe(200);
  });
});

describe("Health — db load endpoint", () => {
  test("/health/db-load uses pg_stat_activity with state='active' and returns count", async () => {
    let capturedQuery = "";
    const mockPool = {
      query: async (sql: string) => {
        capturedQuery = sql;
        return { rows: [{ active_count: 3 }] };
      },
    } as unknown as Pool;

    const app = createApp(mockPool, { edgeId: "TEST_health" });
    const res = await app.handle(new Request("http://localhost/health/db-load"));

    expect(res.status).toBe(200);
    expect(capturedQuery).toContain("FROM pg_stat_activity");
    expect(capturedQuery).toContain("state = 'active'");

    const payload = await res.json();
    expect(payload.status).toBe("ok");
    expect(payload.dbActiveConnections).toBe(3);
  });

  test("/health/db-load returns 9999 when DB query fails", async () => {
    const mockPool = {
      query: async () => {
        throw new Error("db down");
      },
    } as unknown as Pool;

    const app = createApp(mockPool, { edgeId: "TEST_health" });
    const res = await app.handle(new Request("http://localhost/health/db-load"));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.status).toBe("db_unavailable");
    expect(payload.dbActiveConnections).toBe(9999);
  });
});

describe("E-commerce POC — full flow", () => {
  let merchantId: number;
  let productId: number;
  let cartId: string;
  let orderId: string;

  // --- Obchodní operace (core) -------------------------------------------

  test("O1: create merchant on core", async () => {
    const res = await req(coreApp, "POST", "/merchants", {
      name: "TEST_E2E_Shop",
      commissionRate: 5.0,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    merchantId = data.id;
    expect(data.name).toBe("TEST_E2E_Shop");
  });

  test("O2: add product on core", async () => {
    const res = await req(coreApp, "POST", `/merchants/${merchantId}/products`, {
      name: "TEST_Widget",
      price: 29.99,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    productId = data.id;
    expect(data.name).toBe("TEST_Widget");
  });

  test("products replicate core → edge", async () => {
    const rows = await waitForReplication(
      edge1Pool,
      "SELECT * FROM core_products WHERE id = $1",
      [productId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("TEST_Widget");
  });

  // --- Zákaznické operace (edge) -----------------------------------------

  test("Z1: browse products on edge", async () => {
    const res = await req(edgeApp, "GET", "/products");
    expect(res.status).toBe(200);
    const products = (await res.json()) as any[];
    expect(products.some((p) => p.name === "TEST_Widget")).toBe(true);
  });

  test("Z2: create cart on edge", async () => {
    const res = await req(edgeApp, "POST", "/cart");
    expect(res.status).toBe(200);
    const cart = await res.json();
    cartId = cart.id;
    expect(cart.orderId).toBe(cart.id);
    expect(cart.session_id).toBeDefined();
  });

  test("Z2: add item to cart on edge", async () => {
    const res = await req(edgeApp, "POST", `/cart/${cartId}/items`, {
      productId,
      quantity: 2,
    });
    expect(res.status).toBe(200);
    const item = await res.json();
    expect(item.quantity).toBe(2);
  });

  test("Z3: create order from cart on edge", async () => {
    const res = await req(
      edgeApp,
      "POST",
      "/orders",
      {
        userId: 42,
        shippingAddress: "Testovací 123, Praha",
      },
      { "X-Order-Id": cartId },
    );
    expect(res.status).toBe(200);
    const order = await res.json();
    orderId = order.id;
    expect(order.status).toBe("CREATED");
    expect(parseFloat(order.total_price)).toBeCloseTo(59.98, 1);
    expect(order.shipping_address).toBe("Testovací 123, Praha");
  });

  test("Z4: get order detail on edge", async () => {
    const res = await req(edgeApp, "GET", `/orders/${orderId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].product_name).toBe("TEST_Widget");
  });

  test("Z5: update address on edge", async () => {
    const res = await req(edgeApp, "PATCH", `/orders/${orderId}/address`, {
      shippingAddress: "Nová 456, Brno",
    });
    expect(res.status).toBe(200);
    const order = await res.json();
    expect(order.shipping_address).toBe("Nová 456, Brno");
  });

  test("Z7: payment webhook on edge", async () => {
    const res = await req(edgeApp, "POST", "/webhooks/payment", {
      orderId,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.status).toBe("PAID");
  });

  // --- Replikace edge → core ---------------------------------------------

  test("order replicates edge → core", async () => {
    const rows = await waitForReplication(
      corePool,
      "SELECT * FROM edge_orders WHERE id = $1",
      [orderId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].replication_identity).toBe("TEST_edge1");
  });

  test("order status (paid) replicates edge → core", async () => {
    const rows = await waitForReplication(
      corePool,
      "SELECT * FROM edge_orders WHERE id = $1 AND status = 'PAID'",
      [orderId],
    );
    expect(rows.length).toBe(1);
  });

  test("status machine: PENDING -> CANCELLED is allowed, CANCELLED -> PENDING is blocked", async () => {
    const { rows: insertedRows } = await edge1Pool.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price, status) VALUES (9991, 'TEST_STATE_MACHINE', 100.00, 'CREATED') RETURNING id",
    );
    const testOrderId = insertedRows[0].id as string;

    await edge1Pool.query(
      "UPDATE edge_orders SET status = 'PENDING' WHERE id = $1",
      [testOrderId],
    );

    await edge1Pool.query(
      "UPDATE edge_orders SET status = 'CANCELLED' WHERE id = $1",
      [testOrderId],
    );

    await expect(
      edge1Pool.query(
        "UPDATE edge_orders SET status = 'PENDING' WHERE id = $1",
        [testOrderId],
      ),
    ).rejects.toThrow(/terminal state|Invalid edge_orders status transition/i);
  });

  test("status machine: DELIVERED vs CANCELLED conflict is blocked after terminal state", async () => {
    const { rows: insertedRows } = await edge1Pool.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price, status) VALUES (9992, 'TEST_STATE_MACHINE', 100.00, 'CREATED') RETURNING id",
    );
    const testOrderId = insertedRows[0].id as string;

    await edge1Pool.query(
      "UPDATE edge_orders SET status = 'PAID' WHERE id = $1",
      [testOrderId],
    );
    await edge1Pool.query(
      "UPDATE edge_orders SET status = 'SHIPPED' WHERE id = $1",
      [testOrderId],
    );
    await edge1Pool.query(
      "UPDATE edge_orders SET status = 'DELIVERED' WHERE id = $1",
      [testOrderId],
    );

    await expect(
      edge1Pool.query(
        "UPDATE edge_orders SET status = 'CANCELLED' WHERE id = $1",
        [testOrderId],
      ),
    ).rejects.toThrow(/terminal state|Invalid edge_orders status transition/i);
  });

  // --- Obchodní operace na core ------------------------------------------

  test("O3: merchant sees orders on core", async () => {
    const res = await req(coreApp, "GET", `/merchants/${merchantId}/orders`);
    expect(res.status).toBe(200);
    const orders = (await res.json()) as any[];
    expect(orders.length).toBeGreaterThanOrEqual(1);
    const ourOrder = orders.find((o: any) => o.id === orderId);
    expect(ourOrder).toBeDefined();
  });

  test("P1: update merchant fee on core", async () => {
    const res = await req(coreApp, "PATCH", `/merchants/${merchantId}/fee`, {
      commissionRate: 7.5,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(parseFloat(data.commission_rate)).toBe(7.5);
  });

  test("A1: analytics on core", async () => {
    const res = await req(coreApp, "GET", "/analytics/orders?granularity=day");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  // --- Batch settlement (core) -------------------------------------------

  test("S1: settlement creates payouts on core", async () => {
    const today = new Date().toISOString().split("T")[0];
    const res = await req(coreApp, "POST", "/settlements", { date: today });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.payouts.length).toBeGreaterThanOrEqual(1);
    expect(data.totals.orderCount).toBeGreaterThanOrEqual(1);
    expect(data.totals.platformFee).toBeGreaterThan(0);
    expect(data.totals.merchantPayout).toBeGreaterThan(0);
    // Ověříme, že provize odpovídá nastavené sazbě (7.5 % po update výše)
    const payout = data.payouts.find((p: any) => p.merchant_id === merchantId);
    expect(payout).toBeDefined();
    expect(payout.status).toBe("ready_for_payout");
  });

  test("S1: settlement is idempotent (repeat returns same data)", async () => {
    const today = new Date().toISOString().split("T")[0];
    const res = await req(coreApp, "POST", "/settlements", { date: today });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.payouts.length).toBeGreaterThanOrEqual(1);
  });

  test("S1: settlement detail returns payouts with merchant names", async () => {
    const today = new Date().toISOString().split("T")[0];
    const res = await req(coreApp, "GET", `/settlements/${today}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThanOrEqual(1);
    const payout = data.find((p: any) => p.merchant_id === merchantId);
    expect(payout.merchant_name).toBe("TEST_E2E_Shop");
  });

  test("S1: settlement for empty date returns zero", async () => {
    const res = await req(coreApp, "POST", "/settlements", {
      date: "2000-01-01",
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.payouts.length).toBe(0);
    expect(data.totals.orderCount).toBe(0);
  });

  // --- Read-only ochrana -------------------------------------------------

  test("merchant creation fails on edge (read-only)", async () => {
    const res = await req(edgeApp, "POST", "/merchants", {
      name: "TEST_ShouldFail",
      commissionRate: 1.0,
    });
    // Trigger zabrání insertu do core_merchants na edge
    expect(res.status).toBe(400);
  });

  // --- Edge case: address change blocked after shipping ---

  test("Z5: address change rejected for shipped order", async () => {
    // Nastavíme stav na shipped přímo v DB
    await edge1Pool.query(
      "UPDATE edge_orders SET status = 'SHIPPED' WHERE id = $1",
      [orderId],
    );
    const res = await req(edgeApp, "PATCH", `/orders/${orderId}/address`, {
      shippingAddress: "Should Fail",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Testy — Stock Requests a Inventory Quota
// ---------------------------------------------------------------------------

describe("Stock Requests a Inventory Quota", () => {
  let merchantId: number;
  let productId: number;
  let scarcityProductId: number;
  let quotaProductAId: number;
  let quotaProductBId: number;
  let quotaProductCId: number;

  beforeAll(async () => {
    // Vytvořit testovacího obchodníka a produkty na core
    const merchRes = await req(coreApp, "POST", "/merchants", {
      name: "TEST_StockRequest_Shop",
      commissionRate: 5.0,
    });
    expect(merchRes.status).toBe(200);
    merchantId = (await merchRes.json()).id;

    // Běžný produkt
    const prodRes = await req(coreApp, "POST", `/merchants/${merchantId}/products`, {
      name: "TEST_Widget_Available",
      price: 29.99,
      isScarcityMode: false,
    });
    expect(prodRes.status).toBe(200);
    productId = (await prodRes.json()).id;

    // Scarcity produkt
    const scarcityRes = await req(coreApp, "POST", `/merchants/${merchantId}/products`, {
      name: "TEST_Widget_Scarcity",
      price: 99.99,
      isScarcityMode: true,
    });
    expect(scarcityRes.status).toBe(200);
    scarcityProductId = (await scarcityRes.json()).id;

    // Produkty pro testy inventory quota
    const quotaARes = await req(coreApp, "POST", `/merchants/${merchantId}/products`, {
      name: "TEST_Quota_Product_A",
      price: 19.99,
      isScarcityMode: false,
    });
    expect(quotaARes.status).toBe(200);
    quotaProductAId = (await quotaARes.json()).id;

    const quotaBRes = await req(coreApp, "POST", `/merchants/${merchantId}/products`, {
      name: "TEST_Quota_Product_B",
      price: 24.99,
      isScarcityMode: false,
    });
    expect(quotaBRes.status).toBe(200);
    quotaProductBId = (await quotaBRes.json()).id;

    const quotaCRes = await req(coreApp, "POST", `/merchants/${merchantId}/products`, {
      name: "TEST_Quota_Product_C",
      price: 29.99,
      isScarcityMode: false,
    });
    expect(quotaCRes.status).toBe(200);
    quotaProductCId = (await quotaCRes.json()).id;

    // Nastavit inventory ledger na core
    await corePool.query(
      "INSERT INTO core_inventory_ledger (product_id, total_physical_stock, leased_to_edges) VALUES ($1, 100, 0) ON CONFLICT (product_id) DO UPDATE SET total_physical_stock = 100, leased_to_edges = 0",
      [productId],
    );
    await corePool.query(
      "INSERT INTO core_inventory_ledger (product_id, total_physical_stock, leased_to_edges) VALUES ($1, 10, 5) ON CONFLICT (product_id) DO UPDATE SET total_physical_stock = 10, leased_to_edges = 5",
      [scarcityProductId],
    );

    // Počkat na replikaci produktů na edge
    await Bun.sleep(1000);
  });

  test("SQ1: stock request pro dostupný produkt → PENDING na edge", async () => {
    const res = await req(edgeApp, "POST", "/stock-requests", {
      productId,
      requestedQty: 5,
    });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.status).toBe("PENDING");
    expect(data.stockRequest.product_id).toBe(productId);
  });

  test("SQ2: stock request pro scarcity produkt → PENDING", async () => {
    const res = await req(edgeApp, "POST", "/stock-requests", {
      productId: scarcityProductId,
      requestedQty: 10,
    });
    expect(res.status).toBe(202); // Accepted, pending
    const data = await res.json();
    expect(data.status).toBe("PENDING");
    expect(data.availableStock).toBe(5); // 10 - 5 leased
    expect(data.requestedQty).toBe(10);
  });

  test("SQ2b: rejected scarcity request resolves on edge decision endpoint", async () => {
    const createRes = await req(edgeApp, "POST", "/stock-requests", {
      productId: scarcityProductId,
      requestedQty: 10,
    });
    expect(createRes.status).toBe(202);
    const { stockRequest } = await createRes.json();

    await waitForReplication(
      edge1Pool,
      "SELECT * FROM core_stock_grants WHERE request_id = $1 AND status = 'REJECTED_SCARCITY'",
      [stockRequest.id],
    );

    const decisionRes = await req(edgeApp, "GET", `/stock-requests/${stockRequest.id}/decision`);
    expect(decisionRes.status).toBe(200);
    const decision = await decisionRes.json();
    expect(decision.decided).toBe(true);
    expect(decision.status).toBe("REJECTED_SCARCITY");
  });

  test("SQ3: GET /stock-requests/:id vrací detail s aktuálním stavem", async () => {
    // Vytvořit novou žádost
    const createRes = await req(edgeApp, "POST", "/stock-requests", {
      productId,
      requestedQty: 3,
    });
    expect(createRes.status).toBe(202);
    const { stockRequest } = await createRes.json();

    const getRes = await req(edgeApp, "GET", `/stock-requests/${stockRequest.id}`);
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.id).toBe(stockRequest.id);
    expect(data.status).toBe("PENDING");
  });

  test("SQ4: inventory quota — nastavení a čtení", async () => {
    // Nastavit kvótu
    const putRes = await req(edgeApp, "PUT", "/inventory-quota", {
      productId: quotaProductAId,
      quantity: 50,
    });
    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    expect(putData.quantity).toBe(50);

    // Přečíst kvótu
    const getRes = await req(edgeApp, "GET", `/inventory-quota/${quotaProductAId}`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.productId).toBe(quotaProductAId);
    expect(getData.quantity).toBe(50);
    expect(getData.isUnlimited).toBe(false);
  });

  test("SQ5: inventory quota pro nenastavený produkt → neomezeně", async () => {
    const getRes = await req(edgeApp, "GET", `/inventory-quota/${quotaProductCId}`);
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.productId).toBe(quotaProductCId);
    expect(data.isUnlimited).toBe(true);
    expect(data.quantity).toBe(null);
  });

  test("SQ6: consume inventory quota — úspěch", async () => {
    // Nejprve nastavit kvótu
    await req(edgeApp, "PUT", "/inventory-quota", {
      productId: quotaProductAId,
      quantity: 20,
    });

    // Spotřebovat část
    const consumeRes = await req(edgeApp, "POST", "/inventory-quota/consume", {
      productId: quotaProductAId,
      amount: 5,
    });
    expect(consumeRes.status).toBe(200);
    const data = await consumeRes.json();
    expect(data.success).toBe(true);
    expect(data.remaining).toBe(15);
  });

  test("SQ7: consume inventory quota — nedostatek", async () => {
    // Nastavit malou kvótu
    await req(edgeApp, "PUT", "/inventory-quota", {
      productId: quotaProductBId,
      quantity: 3,
    });

    // Pokusit se spotřebovat více
    const consumeRes = await req(edgeApp, "POST", "/inventory-quota/consume", {
      productId: quotaProductBId,
      amount: 10,
    });
    expect(consumeRes.status).toBe(400);
    const data = await consumeRes.json();
    expect(data.error).toBe("Insufficient quota");
    expect(data.available).toBe(3);
    expect(data.requested).toBe(10);
  });

  test("SQ8: batch kvóty pro více produktů", async () => {
    // Nastavit kvóty pro test
    await req(edgeApp, "PUT", "/inventory-quota", {
      productId: quotaProductAId,
      quantity: 10,
    });
    await req(edgeApp, "PUT", "/inventory-quota", {
      productId: quotaProductBId,
      quantity: 20,
    });

    const getRes = await req(
      edgeApp,
      "GET",
      `/inventory-quota/batch/products?productIds=${quotaProductAId},${quotaProductBId},${quotaProductCId}`,
    );
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.length).toBe(3);
    expect(data[0].productId).toBe(quotaProductAId);
    expect(data[0].quantity).toBe(10);
    expect(data[1].productId).toBe(quotaProductBId);
    expect(data[1].quantity).toBe(20);
    expect(data[2].productId).toBe(quotaProductCId);
    expect(data[2].isUnlimited).toBe(true);
  });

  test("SQ9: scarcity order can be paid but cannot be shipped without grant", async () => {
    const cartRes = await req(edgeApp, "POST", "/cart");
    expect(cartRes.status).toBe(200);
    const cart = await cartRes.json();
    const orderId = cart.id as string;

    const addItemRes = await req(
      edgeApp,
      "POST",
      "/cart/items",
      {
        productId: scarcityProductId,
        quantity: 6,
      },
      { "X-Order-Id": orderId },
    );
    expect(addItemRes.status).toBe(200);

    const createOrderRes = await req(
      edgeApp,
      "POST",
      "/orders",
      {
        userId: 777,
        shippingAddress: "TEST Scarcity Street 9",
      },
      { "X-Order-Id": orderId },
    );
    expect(createOrderRes.status).toBe(200);
    const order = await createOrderRes.json();
    expect(order.status).toBe("CREATED");

    const paymentRes = await req(
      edgeApp,
      "POST",
      "/webhooks/payment",
      {},
      { "X-Order-Id": order.id },
    );
    expect(paymentRes.status).toBe(200);

    await expect(
      edge1Pool.query(
        "UPDATE edge_orders SET status = 'SHIPPED' WHERE id = $1",
        [order.id],
      ),
    ).rejects.toThrow(/Cannot mark order/i);
  });
});
