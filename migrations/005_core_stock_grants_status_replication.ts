import type { Pool } from 'pg';

type MigrationContext = {
  db: Pool;
  dbName: string;
};

export async function up(context: MigrationContext): Promise<void> {
  const { db } = context;

  await db.query(`
    ALTER TABLE core_stock_grants
    ADD COLUMN IF NOT EXISTS status edge_stock_request_status;
  `);

  await db.query(`
    UPDATE core_stock_grants
    SET status = 'APPROVED'
    WHERE status IS NULL;
  `);

  await db.query(`
    ALTER TABLE core_stock_grants
    ALTER COLUMN status SET NOT NULL;
  `);

  await db.query(`
    ALTER TABLE core_stock_grants
    ALTER COLUMN status SET DEFAULT 'APPROVED';
  `);
}

export async function down(context: MigrationContext): Promise<void> {
  const { db } = context;

  await db.query(`
    ALTER TABLE core_stock_grants
    DROP COLUMN IF EXISTS status;
  `);
}
