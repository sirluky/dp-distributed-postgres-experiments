import { Pool } from 'pg';

const connections = {
    core: 'postgres://admin:admin@db_core:5432/core_db',
    edge1: 'postgres://admin:admin@db_edge1:5432/edge1_db',
    edge2: 'postgres://admin:admin@db_edge2:5432/edge2_db',
    edge3: 'postgres://admin:admin@db_edge3:5432/edge3_db',
} as const;

const edges = ['edge1', 'edge2', 'edge3'] as const;

// Jedina konfigurace, kterou je treba drzet: tabulky v obou smerech.
const tablesCoreToEdges = [
    'core_merchants',
    'core_products',
    'core_inventory_ledger',
    'core_stock_grants',
];

const tablesEdgesToCore = [
    'edge_orders',
    'edge_order_items',
    'edge_stock_requests',
];

async function getPool(name: keyof typeof connections): Promise<Pool> {
    return new Pool({
        connectionString: connections[name],
        connectionTimeoutMillis: 10000,
    });
}

async function createCorePublication(coreDb: Pool): Promise<void> {
    await coreDb.query('DROP PUBLICATION IF EXISTS pub_core_to_edges;');
    await coreDb.query(`
    CREATE PUBLICATION pub_core_to_edges
    FOR TABLE ${tablesCoreToEdges.join(', ')};
  `);
}

async function createEdgePublication(edgeDb: Pool): Promise<void> {
    await edgeDb.query('DROP PUBLICATION IF EXISTS pub_edge_to_core;');
    await edgeDb.query(`
    CREATE PUBLICATION pub_edge_to_core
    FOR TABLE ${tablesEdgesToCore.join(', ')};
  `);
}

async function createEdgeSubscription(edgeDb: Pool, edgeName: string): Promise<void> {
    const subName = `sub_core_to_${edgeName}`;

    await edgeDb.query(`DROP SUBSCRIPTION IF EXISTS ${subName};`);
    await edgeDb.query(`
    CREATE SUBSCRIPTION ${subName}
    CONNECTION '${connections.core}'
    PUBLICATION pub_core_to_edges
        WITH (
            copy_data = true,
            create_slot = true,
            slot_name = '${subName}',
            failover = true
        );
  `);
}

async function createCoreSubscription(coreDb: Pool, edgeName: typeof edges[number]): Promise<void> {
    const subName = `sub_${edgeName}_to_core`;

    await coreDb.query(`DROP SUBSCRIPTION IF EXISTS ${subName};`);
    await coreDb.query(`
    CREATE SUBSCRIPTION ${subName}
    CONNECTION '${connections[edgeName]}'
    PUBLICATION pub_edge_to_core
        WITH (
            copy_data = false,
            create_slot = true,
            slot_name = '${subName}',
            failover = true
        );
  `);
}

async function setCoreTablesReadOnly(edgeDb: Pool): Promise<void> {
    for (const table of tablesCoreToEdges) {
        await edgeDb.query(`
            CREATE OR REPLACE FUNCTION prevent_${table}_modification()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION '${table} je read-only na edge uzlu';
            END;
            $$ LANGUAGE plpgsql;
        `);

        await edgeDb.query(`
            DROP TRIGGER IF EXISTS ${table}_readonly_insert ON ${table};
            DROP TRIGGER IF EXISTS ${table}_readonly_update ON ${table};
            DROP TRIGGER IF EXISTS ${table}_readonly_delete ON ${table};
        `);

        await edgeDb.query(`
            CREATE TRIGGER ${table}_readonly_insert
            BEFORE INSERT ON ${table}
            FOR EACH ROW
            WHEN (current_setting('session_replication_role', true) IS DISTINCT FROM 'replica')
            EXECUTE FUNCTION prevent_${table}_modification();
        `);

        await edgeDb.query(`
            CREATE TRIGGER ${table}_readonly_update
            BEFORE UPDATE ON ${table}
            FOR EACH ROW
            WHEN (current_setting('session_replication_role', true) IS DISTINCT FROM 'replica')
            EXECUTE FUNCTION prevent_${table}_modification();
        `);

        await edgeDb.query(`
            CREATE TRIGGER ${table}_readonly_delete
            BEFORE DELETE ON ${table}
            FOR EACH ROW
            WHEN (current_setting('session_replication_role', true) IS DISTINCT FROM 'replica')
            EXECUTE FUNCTION prevent_${table}_modification();
        `);
    }
}

async function dropCoreReadOnlyProtection(edgeDb: Pool): Promise<void> {
    for (const table of tablesCoreToEdges) {
        await edgeDb.query(`
            DROP TRIGGER IF EXISTS ${table}_readonly_insert ON ${table};
            DROP TRIGGER IF EXISTS ${table}_readonly_update ON ${table};
            DROP TRIGGER IF EXISTS ${table}_readonly_delete ON ${table};
            DROP FUNCTION IF EXISTS prevent_${table}_modification();
        `);
    }
}

async function setupReplication(): Promise<void> {
    console.log('Nastavuji logickou replikaci...');

    const coreDb = await getPool('core');
    const edgePools = {
        edge1: await getPool('edge1'),
        edge2: await getPool('edge2'),
        edge3: await getPool('edge3'),
    } as const;

    try {
        await createCorePublication(coreDb);
        for (const edge of edges) {
            await createEdgePublication(edgePools[edge]);
        }

        for (const edge of edges) {
            await createEdgeSubscription(edgePools[edge], edge);
        }

        for (const edge of edges) {
            await createCoreSubscription(coreDb, edge);
        }

        for (const edge of edges) {
            await setCoreTablesReadOnly(edgePools[edge]);
        }

        console.log('Hotovo.');
        console.log(`Core -> Edges: ${tablesCoreToEdges.join(', ')}`);
        console.log(`Edges -> Core: ${tablesEdgesToCore.join(', ')}`);
        console.log('core_* tabulky jsou na edge read-only.');
    } catch (error) {
        console.error('Nastaveni replikace selhalo:', error);
        process.exit(1);
    } finally {
        await coreDb.end();
        await edgePools.edge1.end();
        await edgePools.edge2.end();
        await edgePools.edge3.end();
    }
}

async function teardownReplication(): Promise<void> {
    console.log('Odstranuji logickou replikaci...');

    const coreDb = await getPool('core');
    const edgePools = {
        edge1: await getPool('edge1'),
        edge2: await getPool('edge2'),
        edge3: await getPool('edge3'),
    } as const;

    try {
        for (const edge of edges) {
            await dropCoreReadOnlyProtection(edgePools[edge]);
        }

        for (const edge of edges) {
            await coreDb.query(`DROP SUBSCRIPTION IF EXISTS sub_${edge}_to_core;`);
            await edgePools[edge].query(`DROP SUBSCRIPTION IF EXISTS sub_core_to_${edge};`);
        }

        await coreDb.query('DROP PUBLICATION IF EXISTS pub_core_to_edges;');
        for (const edge of edges) {
            await edgePools[edge].query('DROP PUBLICATION IF EXISTS pub_edge_to_core;');
        }

        console.log('Hotovo.');
    } catch (error) {
        console.error('Odstraneni replikace selhalo:', error);
        process.exit(1);
    } finally {
        await coreDb.end();
        await edgePools.edge1.end();
        await edgePools.edge2.end();
        await edgePools.edge3.end();
    }
}

// bere argument `bun run src/replication.ts setup/teardown`
const cmd = process.argv[2] || 'setup';


(async () => {
    if (cmd === 'setup') {
        await setupReplication();
        return;
    }

    if (cmd === 'teardown') {
        await teardownReplication();
        return;
    }

    console.log('Pouziti: bun run src/replication.ts [setup|teardown]');
    process.exit(1);
})();
