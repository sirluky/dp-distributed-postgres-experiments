import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import type { Pool } from "pg";

import { products } from "./modules/products";
import { cart } from "./modules/cart";
import { orders, webhooks } from "./modules/orders";
import { merchants } from "./modules/merchants";
import { analytics } from "./modules/analytics";
import { settlements } from "./modules/settlements";
import { stockRequests, coreStockOperations } from "./modules/stock-requests";
import { inventoryQuota } from "./modules/inventory-quota";

export type NodeRole = "edge" | "core" | "all";

/**
 * Sestaví Elysia aplikaci podle role uzlu.
 *
 * - **edge**: zákaznické operace (produkty, košík, objednávky, webhooky)
 * - **core**: nadmnožina edge + obchodní operace (merchants, analytika, settlementy)
 * - **all**:  vše (výchozí — pro vývoj a testy)
 */
export function createApp(
  pool: Pool,
  opts: { edgeId: string; role?: NodeRole },
) {
  const role = opts.role ?? "all";

  const app = new Elysia()
    .use(
      openapi({
        documentation: {
          info: {
            title: "Edge-Core E-commerce API",
            version: "1.0.0",
            description: [
              "E-shop API",
              // "",
              // `**Role uzlu:** \`${role}\` | **Edge ID:** \`${opts.edgeId}\``,
              // "",
              // "- **core_\\*** tabulky jsou read-only na edge uzlech (chráněno triggery)",
              // "- **edge_\\*** tabulky se replikují z edge → core",
              // "- **local_\\*** tabulky žijí pouze na daném uzlu",
            ].join("\n"),
          },
          tags: [
            { name: "Products", description: "Katalog produktů (čtení na všech uzlech)" },
            { name: "Cart", description: "Nákupní košík (local_* — pouze edge)" },
            { name: "Orders", description: "Objednávky (edge_* — zapisuje edge, replikuje se na core)" },
            { name: "Stock Requests", description: "Žádosti o alokaci zboží při scarcity (edge_stock_requests → core_stock_grants)" },
            { name: "Inventory Quota", description: "Lokální kvóty prodeje na edge (local_inventory_quota)" },
            { name: "Webhooks", description: "Příjem webhooků (platební brána)" },
            { name: "Merchants", description: "Správa obchodníků (core_* — pouze core)" },
            { name: "Settlements", description: "Denní vyúčtování a výplaty obchodníkům (core_payouts — batch zpracování na core)" },
            { name: "Analytics", description: "Analytické dotazy (agregace na core)" },
          ],
        },
      }),
    )
    .get("/health", () => ({ status: "ok", role, edgeId: opts.edgeId }), {
      detail: { hide: true },
    })
    .get("/health/db-load", async () => {
      try {
        const queryPromise = pool.query(
          "SELECT COUNT(*)::int AS active_count FROM pg_stat_activity WHERE state = 'active'",
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          const timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            reject(new Error("db-load timeout"));
          }, 700);
        });

        const result = await Promise.race([queryPromise, timeoutPromise]);

        return {
          status: "ok",
          role,
          edgeId: opts.edgeId,
          dbActiveConnections: Number(result.rows[0]?.active_count ?? 0),
        };
      } catch {
        // DB unavailable from app server perspective.
        return {
          status: "db_unavailable",
          role,
          edgeId: opts.edgeId,
          dbActiveConnections: 9999,
        };
      }
    });

  // Produkty jsou dostupné na všech uzlech
  app.use(products(pool));

  // Zákaznické endpointy jsou dostupné i na core, aby core API bylo nadmnožinou edge.
  if (role === "edge" || role === "core" || role === "all") {
    app.use(cart(pool));
    app.use(orders(pool, opts.edgeId));
    app.use(webhooks(pool));
    app.use(stockRequests(pool, opts.edgeId));
    app.use(inventoryQuota(pool, opts.edgeId));
  }

  // Core endpointy
  if (role === "core" || role === "all") {
    app.use(merchants(pool));
    app.use(settlements(pool));
    app.use(analytics(pool));
    app.use(coreStockOperations(pool));
  }

  return app;
}
