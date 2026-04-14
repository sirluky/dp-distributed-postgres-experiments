import type { Pool } from 'pg';

type MigrationContext = {
  db: Pool;
  dbName: string;
};

export async function up(context: MigrationContext): Promise<void> {
  const { db, dbName } = context;

  console.log('📝 Running: 001_create_schema on database:', dbName);

  // === CORE TABLES ===
  await db.query(`
    CREATE TABLE IF NOT EXISTS core_merchants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      commission_rate DECIMAL(5,2)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS core_products (
      id SERIAL PRIMARY KEY,
      merchant_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      is_scarcity_mode BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (merchant_id, name)
    );
  `);

  await db.query(`
    ALTER TABLE core_products 
    DROP CONSTRAINT IF EXISTS core_products_merchant_id_fkey;
  `);

  await db.query(`
    ALTER TABLE core_products 
    ADD CONSTRAINT core_products_merchant_id_fkey 
    FOREIGN KEY (merchant_id) REFERENCES core_merchants(id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS core_inventory_ledger (
      product_id INTEGER PRIMARY KEY,
      total_physical_stock INTEGER NOT NULL,
      leased_to_edges INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.query(`
    ALTER TABLE core_inventory_ledger 
    DROP CONSTRAINT IF EXISTS core_inventory_ledger_product_id_fkey;
  `);

  await db.query(`
    ALTER TABLE core_inventory_ledger 
    ADD CONSTRAINT core_inventory_ledger_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES core_products(id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS core_stock_grants (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      request_id UUID UNIQUE,
      replication_identity VARCHAR(50) NOT NULL,
      product_id INTEGER NOT NULL,
      granted_qty INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE core_stock_grants 
    DROP CONSTRAINT IF EXISTS core_stock_grants_product_id_fkey;
  `);
  await db.query(`
    ALTER TABLE core_stock_grants 
    ADD CONSTRAINT core_stock_grants_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES core_products(id);
  `);

  // === EDGE TABLES ===
  await db.query(`
    CREATE TABLE IF NOT EXISTS edge_orders (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      user_id INTEGER NOT NULL,
      replication_identity VARCHAR(50) NOT NULL,
      total_price DECIMAL(12,2) NOT NULL,
      shipping_address TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE edge_orders
    DROP CONSTRAINT IF EXISTS edge_orders_status_check;
  `);

  await db.query(`
    ALTER TABLE edge_orders
    ADD CONSTRAINT edge_orders_status_check
    CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'));
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS edge_order_items (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      order_id UUID NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      UNIQUE (order_id, product_id)
    );
  `);

  await db.query(`
    ALTER TABLE edge_order_items 
    DROP CONSTRAINT IF EXISTS edge_order_items_order_id_fkey;
  `);
  await db.query(`
    ALTER TABLE edge_order_items 
    ADD CONSTRAINT edge_order_items_order_id_fkey 
    FOREIGN KEY (order_id) REFERENCES edge_orders(id);
  `);

  await db.query(`
    ALTER TABLE edge_order_items 
    DROP CONSTRAINT IF EXISTS edge_order_items_product_id_fkey;
  `);
  await db.query(`
    ALTER TABLE edge_order_items 
    ADD CONSTRAINT edge_order_items_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES core_products(id);
  `);

  await db.query(`
    CREATE TYPE public.edge_stock_request_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED_SCARCITY'
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS edge_stock_requests (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      order_id UUID,
      replication_identity VARCHAR(50) NOT NULL,
      product_id INTEGER NOT NULL,
      requested_qty INTEGER NOT NULL,
      status edge_stock_request_status NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE edge_stock_requests 
    ADD CONSTRAINT edge_stock_requests_order_id_fkey 
    FOREIGN KEY (order_id) REFERENCES edge_orders(id);
  `);

  await db.query(`
    ALTER TABLE edge_stock_requests 
    ADD CONSTRAINT edge_stock_requests_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES core_products(id);
  `);


  await db.query(`
    ALTER TABLE core_stock_grants
    ADD CONSTRAINT core_stock_grants_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES edge_stock_requests(id);
  `);

  // Indexy pro edge_stock_requests
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_edge_stock_requests_product_id ON edge_stock_requests(product_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_edge_stock_requests_status ON edge_stock_requests(status);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_edge_stock_requests_order_id ON edge_stock_requests(order_id);
  `);

  // === LOCAL TABLES ===
  await db.query(`
    CREATE TABLE IF NOT EXISTS local_carts (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      session_id VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS local_cart_items (
      id SERIAL PRIMARY KEY,
      cart_id UUID NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE (cart_id, product_id)
    );
  `);


  await db.query(`
    ALTER TABLE local_cart_items 
    ADD CONSTRAINT local_cart_items_cart_id_fkey 
    FOREIGN KEY (cart_id) REFERENCES local_carts(id) ON DELETE CASCADE;
  `);

  await db.query(`
    ALTER TABLE local_cart_items 
    ADD CONSTRAINT local_cart_items_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES core_products(id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS local_inventory_quota (
      product_id INTEGER PRIMARY KEY,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE local_inventory_quota 
    ADD CONSTRAINT local_inventory_quota_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES core_products(id);
  `);

  if (dbName === 'core') {
    await db.query(`
    CREATE TABLE IF NOT EXISTS core_payouts (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      merchant_id INTEGER NOT NULL REFERENCES core_merchants(id),
      settlement_period DATE NOT NULL,
      order_count INTEGER NOT NULL,
      total_amount NUMERIC(12, 2) NOT NULL,
      platform_fee NUMERIC(12, 2) NOT NULL,
      merchant_payout NUMERIC(12, 2) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ready_for_payout',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, settlement_period)
    );
  `);
  }
}

export async function down(context: MigrationContext): Promise<void> {
  const { db, dbName } = context;

  console.log('📝 Rolling back: 001_create_schema on database:', dbName);

  // Drop constraints first
  await db.query('ALTER TABLE core_products DROP CONSTRAINT IF EXISTS core_products_merchant_id_fkey;');
  await db.query('ALTER TABLE edge_order_items DROP CONSTRAINT IF EXISTS edge_order_items_order_id_fkey;');
  await db.query('ALTER TABLE edge_order_items DROP CONSTRAINT IF EXISTS edge_order_items_product_id_fkey;');
  await db.query('ALTER TABLE local_cart_items DROP CONSTRAINT IF EXISTS local_cart_items_cart_id_fkey;');
  await db.query('ALTER TABLE local_cart_items DROP CONSTRAINT IF EXISTS local_cart_items_product_id_fkey;');
  await db.query('ALTER TABLE core_inventory_ledger DROP CONSTRAINT IF EXISTS core_inventory_ledger_product_id_fkey;');
  await db.query('ALTER TABLE core_stock_grants DROP CONSTRAINT IF EXISTS core_stock_grants_product_id_fkey;');
  await db.query('ALTER TABLE core_stock_grants DROP CONSTRAINT IF EXISTS core_stock_grants_request_id_fkey;');
  await db.query('ALTER TABLE edge_stock_requests DROP CONSTRAINT IF EXISTS edge_stock_requests_order_id_fkey;');
  await db.query('ALTER TABLE edge_stock_requests DROP CONSTRAINT IF EXISTS edge_stock_requests_product_id_fkey;');
  await db.query('ALTER TABLE local_inventory_quota DROP CONSTRAINT IF EXISTS local_inventory_quota_product_id_fkey;');

  // Drop local tables
  await db.query('DROP TABLE IF EXISTS local_inventory_quota CASCADE;');
  await db.query('DROP TABLE IF EXISTS local_cart_items CASCADE;');
  await db.query('DROP TABLE IF EXISTS local_carts CASCADE;');

  // Drop edge tables
  await db.query('DROP TABLE IF EXISTS edge_stock_requests CASCADE;');
  await db.query('DROP TABLE IF EXISTS edge_order_items CASCADE;');
  await db.query('DROP TABLE IF EXISTS edge_orders CASCADE;');

  await db.query('DROP TYPE IF EXISTS public.edge_stock_request_status;');

  // Drop core tables
  await db.query('DROP TABLE IF EXISTS core_stock_grants CASCADE;');
  await db.query('DROP TABLE IF EXISTS core_inventory_ledger CASCADE;');
  await db.query('DROP TABLE IF EXISTS core_products CASCADE;');
  await db.query('DROP TABLE IF EXISTS core_merchants CASCADE;');

  await db.query(`DROP TABLE IF EXISTS core_payouts;`);
}
