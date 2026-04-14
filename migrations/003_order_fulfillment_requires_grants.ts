import type { Pool } from 'pg';

type MigrationContext = {
  db: Pool;
  dbName: string;
};

export async function up(context: MigrationContext): Promise<void> {
  const { db } = context;

  await db.query(`
    CREATE OR REPLACE FUNCTION trg_edge_orders_require_grants_before_fulfillment()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status IS DISTINCT FROM OLD.status
        AND NEW.status IN ('SHIPPED', 'DELIVERED')
        AND EXISTS (
          SELECT 1
          FROM public.edge_order_items oi
          JOIN public.core_products p ON p.id = oi.product_id
          WHERE oi.order_id = NEW.id
            AND p.is_scarcity_mode = TRUE
            AND COALESCE(
              (
                SELECT SUM(g.granted_qty)
                FROM public.edge_stock_requests r
                JOIN public.core_stock_grants g ON g.request_id = r.id
                WHERE r.order_id = oi.order_id
                  AND r.product_id = oi.product_id
              ),
              0
            ) < oi.quantity
        )
      THEN
        RAISE EXCEPTION 'Cannot mark order % as % before scarcity stock grants are approved', NEW.id, NEW.status;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`
    CREATE TRIGGER trg_edge_orders_require_grants_before_fulfillment
    BEFORE UPDATE ON edge_orders
    FOR EACH ROW
    EXECUTE FUNCTION trg_edge_orders_require_grants_before_fulfillment();
  `);
}

export async function down(context: MigrationContext): Promise<void> {
  const { db } = context;

  await db.query(`
    DROP TRIGGER IF EXISTS trg_edge_orders_require_grants_before_fulfillment ON edge_orders;
    DROP FUNCTION IF EXISTS trg_edge_orders_require_grants_before_fulfillment();
  `);
}
