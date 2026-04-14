import { Umzug } from 'umzug';
import { getDb } from './db';
import path from 'path';
import { PostgresStorage } from './storage';

const connections = {
  core: 'postgres://admin:admin@db_core:5432/core_db',
  edge1: 'postgres://admin:admin@db_edge1:5433/edge1_db',
  edge2: 'postgres://admin:admin@db_edge2:5434/edge2_db',
  edge3: 'postgres://admin:admin@db_edge3:5435/edge3_db',
};

const dbName = process.argv[2] as keyof typeof connections;

if (!dbName || !connections[dbName]) {
  console.error('Usage: bun src/migrate.ts <core|edge1|edge2|edge3> [up|down]');
  process.exit(1);
}

const db = getDb(connections[dbName]!);

const umzug = new Umzug({
  migrations: { glob: path.join(__dirname, '../migrations/*.ts'), resolve: ({ name, path, context }) => {
    const migration = require(path!)
    return {
      name,
      up: async (params) => migration.up(params.context),
      down: async (params) => migration.down(params.context),
    }
  } },
  context: { db, dbName },
  storage: new PostgresStorage(db),
  logger: console,
});

export type Migration = typeof umzug._types.migration;

(async () => {
  const cmd = process.argv[3] || 'up';
  switch (cmd) {
    case 'up':
      await umzug.up();
      break;
    case 'down':
      await umzug.down();
      break;
    default:
      console.log(`Invalid command: ${cmd}`);
      process.exit(1);
  }
  console.log('Done');
  process.exit(0)
})();

