import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function sanitizeName(rawName: string): string {
    return rawName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

async function main(): Promise<void> {
    const rawName = process.argv[2];

    if (!rawName) {
        console.error('❌ Usage: bun run src/create-migration.ts <migration_name>');
        process.exit(1);
    }

    const migrationName = sanitizeName(rawName);

    if (!migrationName) {
        console.error('❌ Invalid migration name. Use letters, numbers, spaces, or underscore.');
        process.exit(1);
    }

    const timestamp = formatTimestamp(new Date());
    const fileName = `${timestamp}_${migrationName}.ts`;
    const migrationsDir = path.resolve(import.meta.dir, '../../migrations');
    const filePath = path.join(migrationsDir, fileName);

    if (existsSync(filePath)) {
        console.error(`❌ Migration already exists: ${fileName}`);
        process.exit(1);
    }

    await mkdir(migrationsDir, { recursive: true });

    const template = `import type { Pool } from 'pg';

type MigrationContext = {
  db: Pool;
  dbName: string;
};

export async function up(context: MigrationContext): Promise<void> {
  const { db, dbName } = context;

  console.log('📝 Running: ${fileName} on database:', dbName);

  await db.query(\`
    -- TODO: Add migration SQL
  \`);
}

export async function down(context: MigrationContext): Promise<void> {
  const { db, dbName } = context;

  console.log('📝 Rolling back: ${fileName} on database:', dbName);

  await db.query(\`
    -- TODO: Add rollback SQL
  \`);
}
`;

    await writeFile(filePath, template, 'utf8');

    console.log(`✅ Created migration: ${fileName}`);
    console.log(`📁 Path: ${filePath}`);
}

void main();