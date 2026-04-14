import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

const connections = {
  core: 'postgres://admin:admin@db_core:5432/core_db',
  edge1: 'postgres://admin:admin@db_edge1:5432/edge1_db',
  edge2: 'postgres://admin:admin@db_edge2:5432/edge2_db',
  edge3: 'postgres://admin:admin@db_edge3:5432/edge3_db',
};

const pools: Record<string, Pool> = {};

async function cleanupTestData() {
  // Clean in correct order due to foreign keys
  // First clean edge order tables on all nodes
  for (const poolName of ['core', 'edge1', 'edge2', 'edge3']) {
    await pools[poolName]
      .query(
        "DELETE FROM edge_order_items WHERE order_id IN (SELECT id FROM edge_orders WHERE replication_identity LIKE 'TEST_%')",
      )
      .catch((error) => {
        console.error(`Failed to clean edge_order_items for pool "${poolName}"`, error);
      });
    await pools[poolName]
      .query("DELETE FROM edge_orders WHERE replication_identity LIKE 'TEST_%'")
      .catch((error) => {
        console.error(`Failed to clean edge_orders for pool "${poolName}"`, error);
      });
  }

  // Clean local tables on edges
  for (const edge of ['edge1', 'edge2', 'edge3']) {
    await pools[edge]
      .query(
        "DELETE FROM local_cart_items WHERE cart_id IN (SELECT id FROM local_carts WHERE session_id LIKE 'TEST_%')",
      )
      .catch((error) => {
        console.error(`Failed to clean local_cart_items for edge "${edge}"`, error);
      });
    await pools[edge]
      .query("DELETE FROM local_carts WHERE session_id LIKE 'TEST_%'")
      .catch((error) => {
        console.error(`Failed to clean local_carts for edge "${edge}"`, error);
      });
    await pools[edge]
      .query(
        "DELETE FROM local_inventory_quota WHERE product_id IN (SELECT id FROM core_products WHERE name LIKE 'TEST_%')",
      )
      .catch((error) => {
        console.error(`Failed to clean local_inventory_quota for edge "${edge}"`, error);
      });
  }

  // core_stock_grants references edge_stock_requests and core_products
  await pools.core
    .query(
      "DELETE FROM core_stock_grants WHERE replication_identity LIKE 'TEST_%' OR request_id IN (SELECT id FROM edge_stock_requests WHERE replication_identity LIKE 'TEST_%')",
    )
    .catch((error) => {
      console.error('Failed to clean core_stock_grants on core pool', error);
    });

  // Now stock requests can be safely removed
  for (const poolName of ['core', 'edge1', 'edge2', 'edge3']) {
    await pools[poolName]
      .query("DELETE FROM edge_stock_requests WHERE replication_identity LIKE 'TEST_%'")
      .catch((error) => {
        console.error(`Failed to clean edge_stock_requests for pool "${poolName}"`, error);
      });
  }

  // core_inventory_ledger references core_products
  await pools.core
    .query("DELETE FROM core_inventory_ledger WHERE product_id IN (SELECT id FROM core_products WHERE name LIKE 'TEST_%')")
    .catch((error) => {
      console.error('Failed to clean core_inventory_ledger on core pool', error);
    });

  // Clean core tables (only on core, they replicate to edges)
  await pools.core
    .query("DELETE FROM core_products WHERE name LIKE 'TEST_%'")
    .catch((error) => {
      console.error('Failed to clean core_products on core pool', error);
    });
  await pools.core
    .query("DELETE FROM core_merchants WHERE name LIKE 'TEST_%'")
    .catch((error) => {
      console.error('Failed to clean core_merchants on core pool', error);
    });

  // Wait for cleanup to replicate
  await Bun.sleep(2000);
}

beforeAll(async () => {
  for (const [name, connString] of Object.entries(connections)) {
    pools[name] = new Pool({ connectionString: connString, connectionTimeoutMillis: 10000 });
  }

  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();

  for (const pool of Object.values(pools)) {
    await pool.end();
  }
});

/**
 * Wait for replication with retry logic.
 * Polls every 100ms for up to 5 seconds.
 */
async function waitForReplication<T = any>(
  pool: Pool,
  query: string,
  params: any[] = [],
  expectedCount = 1
): Promise<T[]> {
  const timeout = 5000;
  const interval = 100;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { rows } = await pool.query(query, params);
    if (rows.length >= expectedCount) {
      return rows as T[];
    }
    await Bun.sleep(interval);
  }

  // Return whatever we have (may be empty, test will fail with clear assertion)
  const { rows } = await pool.query(query, params);
  return rows as T[];
}

/**
 * Wait for a record to be deleted via replication.
 */
async function waitForDeletion(
  pool: Pool,
  query: string,
  params: any[] = []
): Promise<void> {
  const timeout = 5000;
  const interval = 100;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { rows } = await pool.query(query, params);
    if (rows.length === 0) {
      return;
    }
    await Bun.sleep(interval);
  }
}

describe('Core → Edge Replication', () => {
  test('core_merchants replicates from core to all edges', async () => {
    // Insert on core
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Merchant_1', 10.5) RETURNING *"
    );

    // Check all edges have the data (with retry)
    for (const edge of ['edge1', 'edge2', 'edge3']) {
      const rows = await waitForReplication(
        pools[edge],
        "SELECT * FROM core_merchants WHERE id = $1",
        [merchant.id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('TEST_Merchant_1');
      expect(parseFloat(rows[0].commission_rate)).toBe(10.5);
    }
  });

  test('core_products replicates from core to all edges', async () => {
    // First ensure we have a merchant
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Merchant_Products', 5.0) RETURNING *"
    );

    // Insert product on core
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price, is_scarcity_mode) VALUES ($1, 'TEST_Product_1', 99.99, false) RETURNING *",
      [merchant.id]
    );

    // Check all edges have the product (with retry)
    for (const edge of ['edge1', 'edge2', 'edge3']) {
      const rows = await waitForReplication(
        pools[edge],
        "SELECT * FROM core_products WHERE id = $1",
        [product.id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('TEST_Product_1');
      expect(parseFloat(rows[0].price)).toBe(99.99);
    }
  });

  test('updates on core replicate to edges', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Update_Merchant', 5.0) RETURNING *"
    );

    // Wait for initial insert to replicate
    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_merchants WHERE id = $1",
      [merchant.id]
    );

    // Update on core
    await pools.core.query(
      "UPDATE core_merchants SET commission_rate = 15.0 WHERE id = $1",
      [merchant.id]
    );

    // Verify update replicated (poll until we see 15.0)
    for (const edge of ['edge1', 'edge2', 'edge3']) {
      const rows = await waitForReplication(
        pools[edge],
        "SELECT * FROM core_merchants WHERE id = $1 AND commission_rate = 15.0",
        [merchant.id]
      );
      expect(parseFloat(rows[0].commission_rate)).toBe(15.0);
    }
  });

  test('deletes on core replicate to edges', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Delete_Merchant', 5.0) RETURNING *"
    );

    // Wait for insert to replicate
    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_merchants WHERE id = $1",
      [merchant.id]
    );

    // Verify exists on edge
    const { rows: before } = await pools.edge1.query(
      "SELECT * FROM core_merchants WHERE id = $1",
      [merchant.id]
    );
    expect(before.length).toBe(1);

    // Delete on core
    await pools.core.query("DELETE FROM core_merchants WHERE id = $1", [merchant.id]);

    // Verify deleted on all edges (with retry)
    for (const edge of ['edge1', 'edge2', 'edge3']) {
      await waitForDeletion(
        pools[edge],
        "SELECT * FROM core_merchants WHERE id = $1",
        [merchant.id]
      );
      const { rows } = await pools[edge].query(
        "SELECT * FROM core_merchants WHERE id = $1",
        [merchant.id]
      );
      expect(rows.length).toBe(0);
    }
  });
});

describe('Edge → Core Replication', () => {
  test('edge_orders replicates from edge1 to core', async () => {
    const { rows: [order] } = await pools.edge1.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price, status) VALUES (100, 'TEST_edge1', 150.00, 'CREATED') RETURNING *"
    );

    const rows = await waitForReplication(
      pools.core,
      "SELECT * FROM edge_orders WHERE id = $1",
      [order.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].replication_identity).toBe('TEST_edge1');
    expect(parseFloat(rows[0].total_price)).toBe(150.0);
  });

  test('edge_orders replicates from edge2 to core', async () => {
    const { rows: [order] } = await pools.edge2.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price, status) VALUES (200, 'TEST_edge2', 250.00, 'PENDING') RETURNING *"
    );

    const rows = await waitForReplication(
      pools.core,
      "SELECT * FROM edge_orders WHERE id = $1",
      [order.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].replication_identity).toBe('TEST_edge2');
  });

  test('edge_orders replicates from edge3 to core', async () => {
    const { rows: [order] } = await pools.edge3.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price, status) VALUES (300, 'TEST_edge3', 350.00, 'SHIPPED') RETURNING *"
    );

    const rows = await waitForReplication(
      pools.core,
      "SELECT * FROM edge_orders WHERE id = $1",
      [order.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].replication_identity).toBe('TEST_edge3');
  });

  test('edge_stock_requests replicates from edge to core', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_EdgeStockReq_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_EdgeStockReq_Product', 25.0) RETURNING *",
      [merchant.id]
    );

    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_products WHERE id = $1",
      [product.id]
    );

    const { rows: [request] } = await pools.edge1.query(
      "INSERT INTO edge_stock_requests (replication_identity, product_id, requested_qty, status) VALUES ('TEST_edge1', $1, 50, 'PENDING') RETURNING *",
      [product.id]
    );

    const rows = await waitForReplication(
      pools.core,
      "SELECT * FROM edge_stock_requests WHERE id = $1",
      [request.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].requested_qty).toBe(50);
  });
});

describe('Read-Only Protection on Edges', () => {
  test('INSERT on core_merchants fails on edge1', async () => {
    await expect(
      pools.edge1.query(
        "INSERT INTO core_merchants (name, commission_rate) VALUES ($1, 1.0)",
        [`TEST_Should_Fail_${Date.now()}_edge1`]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('INSERT on core_merchants fails on edge2', async () => {
    await expect(
      pools.edge2.query(
        "INSERT INTO core_merchants (name, commission_rate) VALUES ($1, 1.0)",
        [`TEST_Should_Fail_${Date.now()}_edge2`]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('INSERT on core_merchants fails on edge3', async () => {
    await expect(
      pools.edge3.query(
        "INSERT INTO core_merchants (name, commission_rate) VALUES ($1, 1.0)",
        [`TEST_Should_Fail_${Date.now()}_edge3`]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('UPDATE on core_merchants fails on edge', async () => {
    // First insert on core
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_NoUpdate', 5.0) RETURNING *"
    );

    // Wait for replication to edge
    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_merchants WHERE id = $1",
      [merchant.id]
    );

    // Try to update on edge
    await expect(
      pools.edge1.query(
        "UPDATE core_merchants SET commission_rate = 99.0 WHERE id = $1",
        [merchant.id]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('DELETE on core_merchants fails on edge', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_NoDelete', 5.0) RETURNING *"
    );

    // Wait for replication to edge
    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_merchants WHERE id = $1",
      [merchant.id]
    );

    await expect(
      pools.edge1.query(
        "DELETE FROM core_merchants WHERE id = $1",
        [merchant.id]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('INSERT on core_products fails on edge', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_ReadOnly_Product_Merchant', 5.0) RETURNING *"
    );

    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_merchants WHERE id = $1",
      [merchant.id]
    );

    await expect(
      pools.edge1.query(
        "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_ReadOnly_Product', 10.0)",
        [merchant.id]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('INSERT on core_inventory_ledger fails on edge', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_ReadOnly_Ledger_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_ReadOnly_Ledger_Product', 50.0) RETURNING *",
      [merchant.id]
    );

    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_products WHERE id = $1",
      [product.id]
    );

    await expect(
      pools.edge1.query(
        "INSERT INTO core_inventory_ledger (product_id, total_physical_stock) VALUES ($1, 100)",
        [product.id]
      )
    ).rejects.toThrow(/read-only/i);
  });

  test('INSERT on core_stock_grants fails on edge', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_ReadOnly_Grant_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_ReadOnly_Grant_Product', 40.0) RETURNING *",
      [merchant.id]
    );

    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_products WHERE id = $1",
      [product.id]
    );

    await expect(
      pools.edge1.query(
        "INSERT INTO core_stock_grants (replication_identity, product_id, granted_qty) VALUES ('TEST_edge1', $1, 10)",
        [product.id]
      )
    ).rejects.toThrow(/read-only/i);
  });
});

describe('Edge Tables are Writable on Edges', () => {
  test('edge_orders can be inserted on edge1', async () => {
    const { rows } = await pools.edge1.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price) VALUES (1, 'TEST_writable', 10.0) RETURNING *"
    );
    expect(rows.length).toBe(1);
  });

  test('edge_orders can be updated on edge1', async () => {
    const { rows: [order] } = await pools.edge1.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price, status) VALUES (1, 'TEST_update', 10.0, 'CREATED') RETURNING *"
    );

    const { rows } = await pools.edge1.query(
      "UPDATE edge_orders SET status = 'DELIVERED' WHERE id = $1 RETURNING *",
      [order.id]
    );
    expect(rows[0].status).toBe('DELIVERED');
  });

  test('edge_orders can be deleted on edge', async () => {
    const { rows: [order] } = await pools.edge1.query(
      "INSERT INTO edge_orders (user_id, replication_identity, total_price) VALUES (1, 'TEST_delete', 10.0) RETURNING *"
    );

    await pools.edge1.query("DELETE FROM edge_orders WHERE id = $1", [order.id]);

    const { rows } = await pools.edge1.query(
      "SELECT * FROM edge_orders WHERE id = $1",
      [order.id]
    );
    expect(rows.length).toBe(0);
  });
});

describe('Local Tables (local_*)', () => {
  test('local_carts can be created and modified on edge', async () => {
    // First create a merchant and product on core
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Cart_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_Cart_Product', 10.0) RETURNING *",
      [merchant.id]
    );

    // Wait for product to replicate to edge
    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_products WHERE id = $1",
      [product.id]
    );

    const { rows: [cart] } = await pools.edge1.query(
      "INSERT INTO local_carts (session_id) VALUES ('TEST_session_123') RETURNING *"
    );
    expect(cart.session_id).toBe('TEST_session_123');

    // Add item to cart using real product_id
    const { rows: [item] } = await pools.edge1.query(
      "INSERT INTO local_cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 5) RETURNING *",
      [cart.id, product.id]
    );
    expect(item.quantity).toBe(5);

    // Update quantity
    await pools.edge1.query(
      "UPDATE local_cart_items SET quantity = 10 WHERE id = $1",
      [item.id]
    );

    const { rows } = await pools.edge1.query(
      "SELECT quantity FROM local_cart_items WHERE id = $1",
      [item.id]
    );
    expect(rows[0].quantity).toBe(10);
  });

  test('local_inventory_quota can be managed on edge', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Quota_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_Quota_Product', 30.0) RETURNING *",
      [merchant.id]
    );

    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_products WHERE id = $1",
      [product.id]
    );

    await pools.edge1.query(
      "INSERT INTO local_inventory_quota (product_id, quantity) VALUES ($1, 100) ON CONFLICT (product_id) DO UPDATE SET quantity = 100",
      [product.id]
    );

    const { rows } = await pools.edge1.query(
      "SELECT quantity FROM local_inventory_quota WHERE product_id = $1",
      [product.id]
    );
    expect(rows[0].quantity).toBe(100);
  });

  test('edge_stock_requests replicates from edge to core with full details', async () => {
    // First ensure we have a product on core
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_StockReq_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_StockReq_Product', 50.0) RETURNING *",
      [merchant.id]
    );

    // Wait for product to replicate
    await waitForReplication(
      pools.edge1,
      "SELECT * FROM core_products WHERE id = $1",
      [product.id]
    );

    // Create stock request on edge
    const { rows: [request] } = await pools.edge1.query(
      "INSERT INTO edge_stock_requests (replication_identity, product_id, requested_qty, status) VALUES ('TEST_edge1', $1, 25, 'APPROVED') RETURNING *",
      [product.id]
    );

    // Verify it replicates to core
    const rows = await waitForReplication(
      pools.core,
      "SELECT * FROM edge_stock_requests WHERE id = $1",
      [request.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].requested_qty).toBe(25);
    expect(rows[0].status).toBe('APPROVED');
  });

  test('core_stock_grants replicates from core to edges', async () => {
    const { rows: [merchant] } = await pools.core.query(
      "INSERT INTO core_merchants (name, commission_rate) VALUES ('TEST_Grant_Merchant', 5.0) RETURNING *"
    );
    const { rows: [product] } = await pools.core.query(
      "INSERT INTO core_products (merchant_id, name, price) VALUES ($1, 'TEST_Grant_Product', 45.0) RETURNING *",
      [merchant.id]
    );

    // Create a stock grant on core
    const { rows: [grant] } = await pools.core.query(
      "INSERT INTO core_stock_grants (replication_identity, product_id, granted_qty) VALUES ('TEST_core', $1, 100) RETURNING *",
      [product.id]
    );

    // Verify it replicates to edges
    for (const edge of ['edge1', 'edge2', 'edge3']) {
      const rows = await waitForReplication(
        pools[edge],
        "SELECT * FROM core_stock_grants WHERE id = $1",
        [grant.id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].granted_qty).toBe(100);
    }
  });
});
