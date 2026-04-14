import { UmzugStorage } from 'umzug';
import { Pool } from 'pg';

export class PostgresStorage implements UmzugStorage {
  constructor(private readonly db: Pool) { }

  async ensureTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS "public"."migrations" (
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (name)
      );
    `);
  }

  async logMigration({ name }: { name: string }): Promise<void> {
    await this.ensureTable();
    await this.db.query('INSERT INTO "public"."migrations" (name) VALUES ($1)', [name]);
  }

  async unlogMigration({ name }: { name: string }): Promise<void> {
    await this.ensureTable();
    await this.db.query('DELETE FROM "public"."migrations" WHERE name = $1', [name]);
  }

  async executed(): Promise<string[]> {
    await this.ensureTable();
    const { rows } = await this.db.query('SELECT name FROM "public"."migrations" ORDER BY name');
    return rows.map((row: { name: string }) => row.name);
  }
}
