import type { Pool } from 'pg';

type MigrationContext = {
  db: Pool;
  dbName: string;
};

export async function up(context: MigrationContext): Promise<void> {
  const { db } = context;

  await db.query(`
    CREATE OR REPLACE FUNCTION trg_edge_orders_enforce_status_state_machine()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
      END IF;

      IF OLD.status IN ('DELIVERED', 'CANCELLED') THEN
        -- vypnuti by zpusobilo zaseknuti replikace, proto jen warning
        RAISE WARNING
          'Order % is already in terminal state % and cannot transition to %',
          NEW.id, OLD.status, NEW.status;
      END IF;

      IF (OLD.status = 'CREATED' AND NEW.status IN ('PENDING', 'PAID', 'CANCELLED'))
         OR (OLD.status = 'PENDING' AND NEW.status IN ('PAID', 'CANCELLED'))
         OR (OLD.status = 'PAID' AND NEW.status IN ('SHIPPED', 'CANCELLED'))
         OR (OLD.status = 'SHIPPED' AND NEW.status IN ('DELIVERED', 'CANCELLED'))
      THEN
        RETURN NEW;
      END IF;

      RAISE WARNING
        'Invalid edge_orders status transition for order %: % -> %',
        NEW.id, OLD.status, NEW.status;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`
    CREATE TRIGGER trg_edge_orders_enforce_status_state_machine
    BEFORE UPDATE ON edge_orders
    FOR EACH ROW
    EXECUTE FUNCTION trg_edge_orders_enforce_status_state_machine();
  `);
}

export async function down(context: MigrationContext): Promise<void> {
  const { db } = context;

  await db.query(`
    DROP TRIGGER IF EXISTS trg_edge_orders_enforce_status_state_machine ON edge_orders;
    DROP FUNCTION IF EXISTS trg_edge_orders_enforce_status_state_machine();
  `);
}
