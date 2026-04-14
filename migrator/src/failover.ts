/**
 * ============================================================================
 * PostgreSQL 17/18 Native Failover Manager
 * ============================================================================
 * 
 * Tento modul implementuje failover a failback pro PostgreSQL cluster
 * s využitím nativních funkcí PostgreSQL 17/18:
 * 
 * KLÍČOVÉ FUNKCE PG17/18:
 * ─────────────────────────────────────────────────────────────────────────────
 * • pg_promote(wait, wait_seconds)
 *   - Promuje standby na primary s možností čekání na dokončení
 *   - wait=true, wait_seconds=60 zajistí synchronní promoci
 * 
 * • pg_sync_replication_slots()
 *   - Manuální synchronizace failover slotů na standby
 *   - S sync_replication_slots=on běží automaticky na pozadí
 * 
 * • CREATE SUBSCRIPTION ... WITH (failover = true)
 *   - Označuje slot jako "failover slot"
 *   - Slot je automaticky synchronizován na standby
 *   - Po failoveru může nový primary okamžitě používat slot
 * 
 * • pg_replication_slots.synced column
 *   - Indikuje, že slot byl synchronizován z primary
 *   - Synced sloty jsou po failoveru ready k použití
 * 
 * ARCHITEKTURA REPLIKACE:
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 *                    ┌─────────────────┐
 *                    │   db_core       │ ◄── Primary (wal_level=logical)
 *                    │   (PRIMARY)     │
 *                    └────────┬────────┘
 *                             │ streaming replication
 *                             ▼
 *                    ┌─────────────────┐
 *                    │ db_core_replica │ ◄── Standby (slot sync enabled)
 *                    │   (STANDBY)     │
 *                    └─────────────────┘
 *                             │
 *       ┌─────────────────────┼─────────────────────┐
 *       │ logical replication │                     │
 *       ▼                     ▼                     ▼
 * ┌───────────┐         ┌───────────┐         ┌───────────┐
 * │ db_edge1  │         │ db_edge2  │         │ db_edge3  │
 * └───────────┘         └───────────┘         └───────────┘
 * 
 * SMĚRY REPLIKACE:
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 *   Core → Edges (readonly data):
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ • Publikace: pub_core_to_edges                                         │
 *   │ • Tabulky: core_merchants, core_products, core_inventory_ledger,       │
 *   │            core_stock_grants                                           │
 *   │ • Sloty: sub_core_to_edge1, sub_core_to_edge2, sub_core_to_edge3      │
 *   │ • ✅ Sloty jsou synchronizovány na standby (failover=true funguje)    │
 *   └────────────────────────────────────────────────────────────────────────┘
 * 
 *   Edges → Core (kritická data - objednávky):
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ • Publikace: pub_edge_to_core (na každém edge)                         │
 *   │ • Tabulky: edge_orders, edge_order_items, edge_stock_requests          │
 *   │ • Sloty: sub_edge1_to_core, sub_edge2_to_core, sub_edge3_to_core      │
 *   │ • ⚠️ Sloty NELZE synchronizovat - edges nemají standby!              │
 *   │ • ⚠️ Po failoveru se musí sloty vytvořit znovu                        │
 *   └────────────────────────────────────────────────────────────────────────┘
 * 
 * OMEZENÍ (dokumentace PostgreSQL):
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * PostgreSQL 17/18 failover sloty fungují pouze pro:
 *   Publisher (s physical standby) → Subscriber
 * 
 * V naší architektuře:
 *   ✅ core → edges: sloty jsou synchronizovány na core_replica
 *   ❌ edges → core: sloty žijí na edges, které nemají standby
 * 
 * DŮSLEDKY PRO FAILOVER:
 *   • Edges dostanou data z nového primary okamžitě (synced sloty)
 *   • Core/Core_replica musí vytvořit NOVÉ sloty na edges
 *   • Změny na edges během failoveru se přenesou až po vytvoření nových slotů
 * 
 * FAILOVER PROCES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Kontrola stavu clusteru (primary down?)
 * 2. Ověření synchronizace slotů na standby
 * 3. Promoce standby pomocí pg_promote()
 * 4. Vytvoření publikací na novém primary
 * 5. Přesměrování edge subscriptions na nový primary
 * 6. Vytvoření NOVÝCH subscriptions pro příjem dat z edges
 *    (staré sloty na edges se smažou a vytvoří se nové)
 * 
 * FAILBACK PROCES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Původní primary musí být VYPNUTÝ nebo překonfigurovaný jako standby
 * 2. Promoce původního primary
 * 3. Přesměrování edges zpět
 * 4. Vytvoření nových subscriptions z edges (stejně jako u failoveru)
 * 
 * POUŽITÍ:
 * ─────────────────────────────────────────────────────────────────────────────
 * bun run src/failover.ts status    # Kontrola stavu clusteru
 * bun run src/failover.ts prepare   # Příprava (sync slotů)
 * bun run src/failover.ts failover  # Provedení failoveru
 * bun run src/failover.ts failback  # Návrat na původní primary
 */

import { Pool } from 'pg';

// ============================================================================
// KONFIGURACE
// ============================================================================

interface ClusterConfig {
  connections: Record<string, string>;
  coreTables: string[];
  edgeTables: string[];
}

const config: ClusterConfig = {
  connections: {
    core: 'postgres://admin:admin@db_core:5432/core_db',
    core_replica: 'postgres://admin:admin@db_core_replica:5432/core_db',
    edge1: 'postgres://admin:admin@db_edge1:5432/edge1_db',
    edge2: 'postgres://admin:admin@db_edge2:5432/edge2_db',
    edge3: 'postgres://admin:admin@db_edge3:5432/edge3_db',
  },
  coreTables: ['core_merchants', 'core_products', 'core_inventory_ledger', 'core_stock_grants'],
  edgeTables: ['edge_orders', 'edge_order_items', 'edge_stock_requests'],
};

const EDGES = ['edge1', 'edge2', 'edge3'] as const;
type NodeName = keyof typeof config.connections;

// ============================================================================
// POMOCNÉ FUNKCE
// ============================================================================

async function getPool(name: NodeName): Promise<Pool> {
  return new Pool({
    connectionString: config.connections[name],
    connectionTimeoutMillis: 10000,
  });
}

async function waitForConnection(pool: Pool, name: string, maxRetries = 10): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      console.log(`  ⏳ Čekám na ${name}... (${i + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

async function checkIsReplica(pool: Pool): Promise<boolean> {
  const result = await pool.query('SELECT pg_is_in_recovery() as is_replica');
  return result.rows[0].is_replica;
}

async function safeEndPool(pool: Pool): Promise<void> {
  try {
    await pool.end();
  } catch {
    // Ignoruj
  }
}

// ============================================================================
// SLOT SYNCHRONIZACE (PG17/18)
// ============================================================================

async function syncReplicationSlots(standbyPool: Pool): Promise<void> {
  console.log('🔄 Kontrola synchronizace slotů...');
  
  try {
    const workerCheck = await standbyPool.query(`
      SELECT count(*) as cnt FROM pg_stat_activity 
      WHERE backend_type = 'slot sync worker'
    `);
    
    if (parseInt(workerCheck.rows[0].cnt) > 0) {
      console.log('  ✅ Slot sync worker běží (automatická synchronizace aktivní)');
      return;
    }
    
    console.log('  ⏳ Provádím manuální synchronizaci slotů...');
    await standbyPool.query('SELECT pg_sync_replication_slots()');
    console.log('  ✅ Sloty synchronizovány manuálně');
  } catch (e: any) {
    if (e.message.includes('concurrently') || e.message.includes('cannot synchronize')) {
      console.log('  ✅ Synchronizace probíhá na pozadí');
    } else {
      console.log(`  ⚠️ Problém se synchronizací: ${e.message}`);
    }
  }
}

async function checkFailoverSlots(standbyPool: Pool): Promise<{ slot_name: string; failover_ready: boolean }[]> {
  console.log('\n📊 Kontrola failover slotů na standby...');
  
  const result = await standbyPool.query(`
    SELECT 
      slot_name,
      synced,
      temporary,
      failover,
      invalidation_reason,
      (synced AND NOT temporary AND invalidation_reason IS NULL) AS failover_ready
    FROM pg_replication_slots
    WHERE failover = true OR synced = true
    ORDER BY slot_name;
  `);
  
  if (result.rows.length === 0) {
    console.log('  ⚠️ Žádné failover sloty nenalezeny');
    return [];
  }
  
  for (const slot of result.rows) {
    const status = slot.failover_ready ? '✅' : '❌';
    console.log(`  ${status} ${slot.slot_name} (synced: ${slot.synced}, failover: ${slot.failover})`);
  }
  
  return result.rows;
}

// ============================================================================
// PROMOCE REPLIKY (PG17/18)
// ============================================================================

async function promoteReplica(replicaPool: Pool): Promise<void> {
  console.log('🚀 Promuji repliku na primary pomocí pg_promote()...');
  
  const isReplica = await checkIsReplica(replicaPool);
  if (!isReplica) {
    console.log('  ⚠️ Uzel už je primary (není v recovery módu)');
    return;
  }
  
  const result = await replicaPool.query('SELECT pg_promote(true, 60) as promoted');
  
  if (result.rows[0].promoted) {
    console.log('  ✅ Replika úspěšně promována na primary!');
  } else {
    throw new Error('Promoce selhala - pg_promote vrátilo false');
  }
  
  const stillReplica = await checkIsReplica(replicaPool);
  if (stillReplica) {
    throw new Error('Ověření promoce selhalo - stále v recovery módu');
  }
}

// ============================================================================
// NASTAVENÍ REPLIKACE PO FAILOVERU
// ============================================================================

async function setupPublicationsOnNewPrimary(newPrimaryPool: Pool): Promise<void> {
  console.log('\n📡 Vytvářím publikace na novém primary...');
  
  await newPrimaryPool.query(`DROP PUBLICATION IF EXISTS pub_core_to_edges;`);
  await newPrimaryPool.query(`
    CREATE PUBLICATION pub_core_to_edges FOR TABLE ${config.coreTables.join(', ')};
  `);
  console.log('  ✅ Vytvořena publikace: pub_core_to_edges');
}

async function redirectEdgeSubscriptions(newPrimaryHost: string): Promise<void> {
  console.log('\n🔄 Přesměrovávám edge subscriptions na nový primary...');
  
  const newCoreConnString = `postgres://admin:admin@${newPrimaryHost}:5432/core_db`;
  
  for (const edgeName of EDGES) {
    const pool = await getPool(edgeName);
    const subName = `sub_core_to_${edgeName}`;
    
    try {
      await pool.query(`ALTER SUBSCRIPTION ${subName} CONNECTION '${newCoreConnString}';`);
      console.log(`  ⏳ ${subName}: connection → ${newPrimaryHost}`);
      
      await pool.query(`ALTER SUBSCRIPTION ${subName} ENABLE;`);
      console.log(`  ⏳ ${subName}: ENABLED`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await pool.query(`ALTER SUBSCRIPTION ${subName} REFRESH PUBLICATION;`);
      console.log(`  ✅ ${subName}: přesměrováno na ${newPrimaryHost}`);
    } catch (e: any) {
      console.error(`  ❌ ${subName}: selhalo - ${e.message}`);
    }
    
    await safeEndPool(pool);
  }
}

/**
 * setupSubscriptionsOnNewPrimary
 * ─────────────────────────────────────────────────────────────────────────────
 * Po failoveru/failbacku musíme znovu vytvořit subscriptions pro příjem
 * dat z edges (objednávky atd.).
 * 
 * DŮLEŽITÉ: Sloty na edges NEMOHOU být synchronizovány mezi core a core_replica
 * protože edges nemají physical standby. Proto po každém failoveru:
 * 
 * 1. Korektně odstraníme starou subscription (disable → slot_name=NONE → drop)
 * 2. Smažeme starý slot na edge (pokud existuje a je neaktivní)
 * 3. Vytvoříme novou subscription s novým slotem
 * 
 * POZOR: copy_data=false znamená, že se přenesou pouze NOVÉ změny od vytvoření
 * subscription. Data vzniklá během výpadku se NEPŘENESOU automaticky.
 * Pro full resync nastav copy_data=true (může trvat dlouho).
 */
async function setupSubscriptionsOnNewPrimary(newPrimaryPool: Pool): Promise<void> {
  console.log('\n📥 Vytvářím subscriptions na novém primary (z edges)...');
  console.log('   ℹ️ Sloty edges→core nelze synchronizovat (edges nemají standby)');
  console.log('   ℹ️ Vytvářím nové sloty na každém edge...\n');
  
  for (const edge of EDGES) {
    const subName = `sub_${edge}_to_core`;
    const connString = config.connections[edge];
    
    // Krok 1: Korektně odstranit existující subscription na novém primary
    try {
      // Nejprve zkontroluj jestli subscription existuje
      const subExists = await newPrimaryPool.query(
        `SELECT subname FROM pg_subscription WHERE subname = $1`,
        [subName]
      );
      
      if (subExists.rows.length > 0) {
        console.log(`  ⏳ ${subName}: odstraňuji starou subscription...`);
        
        // Disable subscription aby se odpojila od slotu
        await newPrimaryPool.query(`ALTER SUBSCRIPTION ${subName} DISABLE;`);
        
        // Odpoj slot (jinak DROP selže s chybou "slot neexistuje")
        await newPrimaryPool.query(`ALTER SUBSCRIPTION ${subName} SET (slot_name = NONE);`);
        
        // Teď můžeme bezpečně smazat subscription
        await newPrimaryPool.query(`DROP SUBSCRIPTION ${subName};`);
        console.log(`  ✅ ${subName}: stará subscription odstraněna`);
      }
    } catch (e: any) {
      console.log(`  ⚠️ ${subName}: nelze odstranit starou subscription - ${e.message}`);
    }
    
    // Krok 2: Smazat starý slot na edge (pokud existuje)
    try {
      const edgePool = await getPool(edge);
      
      // Zkontroluj jestli slot existuje
      const slotCheck = await edgePool.query(
        `SELECT slot_name, active FROM pg_replication_slots WHERE slot_name = $1`,
        [subName]
      );
      
      if (slotCheck.rows.length > 0) {
        const slot = slotCheck.rows[0];
        
        if (slot.active) {
          // Slot je aktivní - někdo ho používá, terminuj spojení
          console.log(`  ⏳ ${subName}: terminuji aktivní spojení na ${edge}...`);
          await edgePool.query(`
            SELECT pg_terminate_backend(active_pid) 
            FROM pg_replication_slots 
            WHERE slot_name = $1 AND active_pid IS NOT NULL
          `, [subName]);
          
          // Počkej chvíli na odpojení
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Smaž starý slot
        console.log(`  ⏳ ${subName}: mažu starý slot na ${edge}...`);
        await edgePool.query(`SELECT pg_drop_replication_slot($1);`, [subName]);
        console.log(`  ✅ ${subName}: starý slot smazán`);
      }
      
      await safeEndPool(edgePool);
    } catch (e: any) {
      // Slot možná neexistuje nebo je stále aktivní - to je OK, CREATE ho vytvoří
      console.log(`  ℹ️ ${subName}: slot na ${edge} nelze smazat (${e.message.split('\n')[0]})`);
    }
    
    // Krok 3: Vytvořit novou subscription s novým slotem
    try {
      console.log(`  ⏳ ${subName}: vytvářím subscription s novým slotem...`);
      
      await newPrimaryPool.query(`
        CREATE SUBSCRIPTION ${subName}
        CONNECTION '${connString}'
        PUBLICATION pub_edge_to_core
        WITH (
          copy_data = false,      -- Pouze nové změny (pro full resync změň na true)
          create_slot = true,     -- Vytvoř nový slot na edge
          failover = true         -- Slot bude synchronizován na standby
        );
      `);
      
      console.log(`  ✅ ${subName}: subscription vytvořena`);
    } catch (e: any) {
      console.error(`  ❌ ${subName}: selhalo - ${e.message}`);
    }
  }
  
  console.log('\n   ℹ️ Poznámka: Data vzniklá během výpadku se nepřenesou automaticky');
  console.log('   ℹ️ Pro full resync použij: ALTER SUBSCRIPTION ... SET (copy_data = true)');
}

// ============================================================================
// HLAVNÍ FAILOVER PROCES
// ============================================================================

async function performFailover(targetNode: 'core_replica' | 'core' = 'core_replica'): Promise<void> {
  const sourceNode = targetNode === 'core_replica' ? 'core' : 'core_replica';
  const isFailback = targetNode === 'core';
  
  console.log(`🔥 Spouštím ${isFailback ? 'FAILBACK' : 'FAILOVER'}...\n`);
  console.log('═'.repeat(60));
  
  // Krok 1: Kontrola stavu clusteru
  console.log('\n📊 Krok 1: Kontrola stavu clusteru...');
  
  const sourcePool = await getPool(sourceNode);
  const sourceUp = await waitForConnection(sourcePool, sourceNode, 3);
  await safeEndPool(sourcePool);
  
  if (sourceUp) {
    console.log(`  ⚠️ VAROVÁNÍ: ${sourceNode} (current primary) je stále DOSTUPNÝ!`);
    console.log('  ⚠️ Pokračování může způsobit split-brain!');
    
    if (!process.argv.includes('--force')) {
      console.log('\n❌ Failover přerušen. Použij --force pro vynucení.');
      process.exit(1);
    }
    console.log('  ⚠️ Vynucuji failover dle požadavku...');
  } else {
    console.log(`  ✅ ${sourceNode} je NEDOSTUPNÝ - bezpečný failover`);
  }
  
  // Krok 2: Připojení k cílovému uzlu
  console.log(`\n📊 Krok 2: Připojování k ${targetNode}...`);
  const targetPool = await getPool(targetNode);
  
  const targetUp = await waitForConnection(targetPool, targetNode, 5);
  if (!targetUp) {
    console.error(`❌ ${targetNode} není dostupný! Nelze provést failover.`);
    process.exit(1);
  }
  
  // Krok 3: Kontrola failover slotů
  console.log('\n📊 Krok 3: Kontrola failover slotů...');
  const isReplica = await checkIsReplica(targetPool);
  
  if (isReplica) {
    const slots = await checkFailoverSlots(targetPool);
    const notReady = slots.filter(s => !s.failover_ready);
    if (notReady.length > 0) {
      console.log(`  ⚠️ ${notReady.length} slot(ů) není připraveno pro failover`);
    }
  } else {
    console.log('  ⚠️ Cílový uzel už je primary - přeskakuji kontrolu slotů');
  }
  
  // Krok 4: Promoce
  console.log('\n📊 Krok 4: Promoce repliky...');
  await promoteReplica(targetPool);
  
  // Krok 5: Nastavení publikací
  console.log('\n📊 Krok 5: Nastavení publikací...');
  await setupPublicationsOnNewPrimary(targetPool);
  
  // Krok 6: Přesměrování edges
  console.log('\n📊 Krok 6: Přesměrování edge subscriptions...');
  const targetHost = targetNode === 'core_replica' ? 'db_core_replica' : 'db_core';
  await redirectEdgeSubscriptions(targetHost);
  
  // Krok 7: Nastavení příjmu z edges
  console.log('\n📊 Krok 7: Nastavení subscriptions z edges...');
  await setupSubscriptionsOnNewPrimary(targetPool);
  
  await safeEndPool(targetPool);
  
  // Shrnutí
  console.log('\n' + '═'.repeat(60));
  console.log(`✅ ${isFailback ? 'FAILBACK' : 'FAILOVER'} DOKONČEN!`);
  console.log('\n📋 Shrnutí:');
  console.log(`  • ${targetNode} je nyní PRIMARY`);
  console.log(`  • Všechny edges replikují s ${targetHost}`);
  console.log(`  • Nový primary přijímá zápisy na portu ${targetNode === 'core_replica' ? '35436' : '35432'}`);
  console.log('\n⚠️ Další kroky:');
  console.log('  1. Aktualizuj connection stringy v aplikacích');
  console.log('  2. Prozkoumej proč původní primary selhal');
  console.log(`  3. Nastav ${sourceNode} jako nový standby pro další failover`);
}

// ============================================================================
// KONTROLA STAVU
// ============================================================================

async function checkStatus(): Promise<void> {
  console.log('📊 Stav PostgreSQL clusteru (PG17/18)\n');
  
  const nodes = [
    { name: 'core' as const, label: 'Core' },
    { name: 'core_replica' as const, label: 'Core Replica' },
    { name: 'edge1' as const, label: 'Edge 1' },
    { name: 'edge2' as const, label: 'Edge 2' },
    { name: 'edge3' as const, label: 'Edge 3' },
  ];
  
  console.log('UZLY:');
  for (const node of nodes) {
    try {
      const pool = await getPool(node.name);
      await pool.query('SELECT 1');
      
      if (node.name === 'core' || node.name === 'core_replica') {
        const isReplica = await checkIsReplica(pool);
        const role = isReplica ? '(STANDBY)' : '(PRIMARY)';
        console.log(`  ✅ ${node.label}: UP ${role}`);
        
        if (!isReplica) {
          const lsn = await pool.query('SELECT pg_current_wal_lsn() as lsn');
          console.log(`     WAL LSN: ${lsn.rows[0].lsn}`);
        } else {
          const lsn = await pool.query('SELECT pg_last_wal_receive_lsn() as lsn');
          console.log(`     Received LSN: ${lsn.rows[0].lsn || 'N/A'}`);
        }
      } else {
        console.log(`  ✅ ${node.label}: UP`);
      }
      
      await safeEndPool(pool);
    } catch {
      console.log(`  ❌ ${node.label}: DOWN`);
    }
  }
  
  console.log('\nREPLIKAČNÍ SLOTY:');
  
  for (const nodeName of ['core', 'core_replica'] as const) {
    try {
      const pool = await getPool(nodeName);
      const isReplica = await checkIsReplica(pool);
      
      const slots = await pool.query(`
        SELECT slot_name, slot_type, active, failover,
               CASE WHEN synced THEN 'synced' ELSE 'local' END as origin
        FROM pg_replication_slots ORDER BY slot_name;
      `);
      
      if (slots.rows.length > 0) {
        const role = isReplica ? 'STANDBY' : 'PRIMARY';
        console.log(`\n  ${nodeName} (${role}):`);
        for (const slot of slots.rows) {
          const activeIcon = slot.active ? '🟢' : '🔴';
          const failoverIcon = slot.failover ? '⚡' : '';
          console.log(`    ${activeIcon} ${slot.slot_name} [${slot.slot_type}] ${failoverIcon} (${slot.origin})`);
        }
      }
      
      await safeEndPool(pool);
    } catch { /* uzel je down */ }
  }
  
  console.log('\nEDGE SUBSCRIPTIONS:');
  
  for (const edgeName of EDGES) {
    try {
      const pool = await getPool(edgeName);
      const subs = await pool.query(`
        SELECT subname, subenabled, subfailover, subconninfo
        FROM pg_subscription;
      `);
      
      if (subs.rows.length > 0) {
        console.log(`\n  ${edgeName}:`);
        for (const sub of subs.rows) {
          const enabled = sub.subenabled ? '🟢' : '🔴';
          const failover = sub.subfailover ? '⚡failover' : '';
          const hostMatch = sub.subconninfo.match(/@([^:]+):/);
          const host = hostMatch ? hostMatch[1] : 'unknown';
          console.log(`    ${enabled} ${sub.subname} → ${host} ${failover}`);
        }
      }
      
      await safeEndPool(pool);
    } catch {
      console.log(`  ❌ ${edgeName}: nelze připojit`);
    }
  }
}

// ============================================================================
// PŘÍPRAVA FAILOVERU
// ============================================================================

async function prepareFailover(): Promise<void> {
  console.log('🔧 Příprava failoveru (synchronizace slotů)...\n');
  
  try {
    const replicaPool = await getPool('core_replica');
    const isReplica = await checkIsReplica(replicaPool);
    
    if (!isReplica) {
      console.log('❌ core_replica není ve standby módu!');
      await safeEndPool(replicaPool);
      return;
    }
    
    await syncReplicationSlots(replicaPool);
    await checkFailoverSlots(replicaPool);
    
    await safeEndPool(replicaPool);
    
    console.log('\n✅ Příprava dokončena');
    console.log('   Spusť "make failover" pro provedení failoveru');
  } catch (e: any) {
    console.error('❌ Příprava selhala:', e.message);
  }
}

// ============================================================================
// MAIN
// ============================================================================

const cmd = process.argv[2] || 'status';

(async () => {
  try {
    switch (cmd) {
      case 'failover':
        await performFailover('core_replica');
        break;
      case 'failback':
        await performFailover('core');
        break;
      case 'status':
        await checkStatus();
        break;
      case 'prepare':
        await prepareFailover();
        break;
      default:
        console.log('PostgreSQL 17/18 Native Failover Manager\n');
        console.log('Použití: bun run src/failover.ts [příkaz]\n');
        console.log('Příkazy:');
        console.log('  status   - Kontrola stavu clusteru, WAL pozic a slotů');
        console.log('  prepare  - Synchronizace failover slotů na standby');
        console.log('  failover - Promoce repliky a přesměrování replikace');
        console.log('  failback - Návrat na původní primary (db_core)');
        console.log('\nMožnosti:');
        console.log('  --force  - Vynutit failover i když je primary dostupný');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Chyba:', error);
    process.exit(1);
  }
})();
