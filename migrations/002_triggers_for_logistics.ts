import type { Pool } from 'pg';

type MigrationContext = {
  db: Pool;
  dbName: string;
};

export async function up(context: MigrationContext): Promise<void> {
  const { db, dbName } = context;

  if (dbName === 'core') {
    await db.query(`
    ALTER TABLE public.core_stock_grants
    ADD COLUMN IF NOT EXISTS status edge_stock_request_status;

    UPDATE public.core_stock_grants
    SET status = 'APPROVED'
    WHERE status IS NULL;

    ALTER TABLE public.core_stock_grants
    ALTER COLUMN status SET NOT NULL;

    ALTER TABLE public.core_stock_grants
    ALTER COLUMN status SET DEFAULT 'APPROVED';
  `);

    await db.query(`
    CREATE OR REPLACE FUNCTION trg_core_products_create_inventory_ledger()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.core_inventory_ledger (
        product_id,
        total_physical_stock,
        leased_to_edges
      )
      VALUES (
        NEW.id,
        0,
        0
      )
      ON CONFLICT (product_id) DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

    await db.query(`
    DROP TRIGGER IF EXISTS trg_core_products_create_inventory_ledger ON core_products;
    CREATE TRIGGER trg_core_products_create_inventory_ledger
    AFTER INSERT ON core_products
    FOR EACH ROW
    EXECUTE FUNCTION trg_core_products_create_inventory_ledger();
  `);

    await db.query(`
    INSERT INTO public.core_inventory_ledger (
      product_id,
      total_physical_stock,
      leased_to_edges
    )
    SELECT
      p.id,
      0,
      0
    FROM public.core_products p
    LEFT JOIN public.core_inventory_ledger l ON l.product_id = p.id
    WHERE l.product_id IS NULL;
  `);

    await db.query(`
    CREATE OR REPLACE FUNCTION trg_edge_stock_requests()
    RETURNS TRIGGER AS $$
    DECLARE
      v_updated BOOLEAN;
      v_granted_qty INTEGER;
      v_status public.edge_stock_request_status;
    BEGIN
      IF NEW.status IS DISTINCT FROM 'PENDING' THEN
        RETURN NEW;
      END IF;

      -- Atomicky: zkontroluj dostupnost a alokuj v jednom UPDATE (bez FOR UPDATE locku)
      UPDATE public.core_inventory_ledger
      SET leased_to_edges = leased_to_edges + NEW.requested_qty
      WHERE product_id = NEW.product_id
        AND (total_physical_stock - leased_to_edges) >= NEW.requested_qty;

      v_updated := FOUND;

      IF v_updated THEN
        NEW.status := 'APPROVED';
        v_granted_qty := NEW.requested_qty;
        v_status := 'APPROVED';
      ELSE
        NEW.status := 'REJECTED_SCARCITY';
        v_granted_qty := 0;
        v_status := 'REJECTED_SCARCITY';
      END IF;

      -- Primy INSERT do core_stock_grants — replikuje se pres pub_core_to_edges
      INSERT INTO public.core_stock_grants (
        request_id, replication_identity, product_id, granted_qty, status
      ) VALUES (
        NEW.id, NEW.replication_identity, NEW.product_id, v_granted_qty, v_status
      )
      ON CONFLICT (request_id) DO UPDATE
      SET granted_qty = EXCLUDED.granted_qty,
          status = EXCLUDED.status,
          replication_identity = EXCLUDED.replication_identity,
          product_id = EXCLUDED.product_id;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

    await db.query(`
    CREATE TRIGGER trg_edge_stock_requests
    BEFORE INSERT ON edge_stock_requests
    FOR EACH ROW
    EXECUTE FUNCTION trg_edge_stock_requests();
    ALTER TABLE edge_stock_requests ENABLE ALWAYS TRIGGER trg_edge_stock_requests;
  `);

    // FK core_stock_grants.request_id → edge_stock_requests.id neni kompatibilni
    // s dblink pristupem (dblink bezi v samostatne transakci pred commitem edge_stock_requests).
    // Trigger logika zajistuje spravnost — FK neni potreba.
    await db.query(`
    ALTER TABLE core_stock_grants DROP CONSTRAINT IF EXISTS core_stock_grants_request_id_fkey;
  `);
  }

}

export async function down(context: MigrationContext): Promise<void> {
  const { db, dbName } = context;

  if (dbName === 'core') {
    await db.query(`
      DROP TRIGGER IF EXISTS trg_core_products_create_inventory_ledger ON core_products;
      DROP FUNCTION IF EXISTS trg_core_products_create_inventory_ledger();

      DROP TRIGGER IF EXISTS trg_edge_stock_requests ON edge_stock_requests;
      DROP FUNCTION IF EXISTS trg_edge_stock_requests();
    `);
  }

}
