import { Pool } from 'pg';
import { Umzug } from 'umzug';
import path from 'path';
import { PostgresStorage } from './storage';

const connections: Record<string, string> = {
  core: 'postgres://admin:admin@db_core:5432/core_db',
  edge1: 'postgres://admin:admin@db_edge1:5432/edge1_db',
  edge2: 'postgres://admin:admin@db_edge2:5432/edge2_db',
  edge3: 'postgres://admin:admin@db_edge3:5432/edge3_db',
};

const dbName = (process.argv[2] || 'core') as keyof typeof connections;
const cmd = (process.argv[3] || 'up') as 'up' | 'down';

if (!connections[dbName]) {
  console.error('❌ Usage: bun run src/index.ts <core|edge1|edge2|edge3> [up|down]');
  console.error('Available databases:', Object.keys(connections).join(', '));
  process.exit(1);
}

const db = new Pool({
  connectionString: connections[dbName],
  connectionTimeoutMillis: 30000,
});

async function waitForDatabase(pool: Pool, maxRetries = 10, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Attempting to connect to database (attempt ${attempt}/${maxRetries})...`);
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('✅ Database connection established');
      return;
    } catch (error) {
      console.log(`⚠️ Connection failed: ${(error as Error).message}`);
      if (attempt === maxRetries) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
      }
      console.log(`⏳ Waiting ${delayMs / 1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

const migrationsDir = path.join(import.meta.dir, '../migrations');

const umzug = new Umzug({
  migrations: {
    glob: `${migrationsDir}/*.ts`,
    resolve: ({ name, path: filePath, context }) => {
      // Dynamic import for TypeScript files
      const migration = require(filePath!);
      return {
        name,
        up: async (params) => migration.up(params.context),
        down: async (params) => migration.down(params.context),
      };
    },
  },
  context: { db, dbName },
  storage: new PostgresStorage(db),
  logger: console,
});

(async () => {
  try {
    // Wait for database to be ready
    await waitForDatabase(db);

    console.log(`🚀 Running migrations ${cmd.toUpperCase()} on [${dbName}]...`);

    if (cmd === 'up') {
      const result = await umzug.up();
      console.log(`✅ ${result.length} migration(s) executed`);
    } else if (cmd === 'down') {
      const result = await umzug.down();
      console.log(`✅ ${result.length} migration(s) rolled back`);
    } else {
      console.error(`❌ Invalid command: ${cmd}`);
      process.exit(1);
    }

    console.log('✓ Done');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
