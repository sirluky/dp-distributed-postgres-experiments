import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import {
  createStockRequest,
  getStockRequest,
  getStockGrantByRequestId,
  updateStockRequestStatus,
  createStockGrant,
  getInventoryLedger,
  updateInventoryLeased,
} from "../queries/stock-requests.queries";

// Endpointy pro schvalování/zamítání žádostí na core uzlu (bez POST / který patří edge)
export const coreStockOperations = (pool: Pool) =>
  new Elysia({ prefix: "/stock-requests", tags: ["Stock Requests"] })
    .get(
      "/:id/decision",
      async ({ params, set }) => {
        // Čte finální rozhodnutí z core_stock_grants (stejný zdroj pro core i edge benchmark).
        const grantRows = await getStockGrantByRequestId.run(
          { requestId: params.id },
          pool,
        );

        if (grantRows.length > 0) {
          const grant = grantRows[0];
          return {
            id: params.id,
            status: grant.status,
            decided: true,
            grant,
          };
        }

        const reqRows = await getStockRequest.run({ id: params.id }, pool);
        if (reqRows.length === 0) {
          set.status = 404;
          return { error: "Stock request not found on core" };
        }

        return {
          id: params.id,
          status: "PENDING",
          decided: false,
        };
      },
      {
        params: t.Object({ id: t.String() }),
        detail: { summary: "Stav žádosti na core (H3 benchmark)", description: "Čte finální stav z core_stock_grants pro měření replikační latence." },
      },
    )
    .post(
      "/:id/approve",
      async ({ params, body, set }) => {
        const client = await pool.connect();
        try {
          const [stockRequest] = await updateStockRequestStatus.run(
            { id: params.id, status: "APPROVED" },
            client,
          );

          if (!stockRequest) {
            set.status = 400;
            return { error: "Cannot approve — request not found or already processed" };
          }

          const qtyToGrant = body.grantedQty ?? stockRequest.requested_qty;
          const [grant] = await createStockGrant.run(
            {
              requestId: stockRequest.id,
              replicationIdentity: stockRequest.replication_identity,
              productId: stockRequest.product_id,
              grantedQty: qtyToGrant,
              status: "APPROVED",
            },
            client,
          );

          await updateInventoryLeased.run(
            { productId: stockRequest.product_id, addedQty: qtyToGrant },
            client,
          );

          return { status: "APPROVED", stockRequest, grant };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message };
        } finally {
          client.release();
        }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          grantedQty: t.Optional(t.Number({ description: "Schválené množství (výchozí: celá žádost)" })),
        }),
        detail: { summary: "Schválit žádost (core)", description: "Core endpoint. Schválí pending žádost a vytvoří core_stock_grants." },
      },
    )
    .post(
      "/:id/reject",
      async ({ params, set }) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const [stockRequest] = await updateStockRequestStatus.run(
            { id: params.id, status: "REJECTED_SCARCITY" },
            client,
          );

          if (!stockRequest) {
            await client.query("ROLLBACK");
            set.status = 400;
            return { error: "Cannot reject — request not found or already processed" };
          }

          await createStockGrant.run(
            {
              requestId: stockRequest.id,
              replicationIdentity: stockRequest.replication_identity,
              productId: stockRequest.product_id,
              grantedQty: 0,
              status: "REJECTED_SCARCITY",
            },
            client,
          );

          await client.query("COMMIT");
          return { status: "REJECTED_SCARCITY", stockRequest };
        } catch (e: any) {
          await client.query("ROLLBACK");
          set.status = 500;
          return { error: e.message };
        } finally {
          client.release();
        }
      },
      {
        params: t.Object({ id: t.String() }),
        detail: { summary: "Zamítnout žádost (core)", description: "Core endpoint. Zamítne žádost z důvodu scarcity." },
      },
    );

export const stockRequests = (pool: Pool, edgeId: string) =>
  new Elysia({ prefix: "/stock-requests", tags: ["Stock Requests"] })
    .post(
      "/",
      async ({ body, set }) => {
        const { productId, requestedQty, orderId } = body;

        const client = await pool.connect();
        try {
          // Na edge pouze validujeme, že produkt existuje v ledgeru.
          // Samotné schválení a grant probíhají až na core triggeru po replikaci.
          const ledgerRows = await getInventoryLedger.run(
            { productId },
            client,
          );

          if (ledgerRows.length === 0) {
            set.status = 404;
            return { error: "Product not found in inventory ledger" };
          }

          const ledger = ledgerRows[0];
          const availableStock = ledger.total_physical_stock - ledger.leased_to_edges;

          const [stockRequest] = await createStockRequest.run(
            {
              orderId: orderId ?? null,
              replicationIdentity: edgeId,
              productId,
              requestedQty,
              status: "PENDING",
            },
            client,
          );

          set.status = 202;
          return {
            status: "PENDING",
            stockRequest,
            availableStock,
            requestedQty,
            message: "Request accepted on edge; final approval is decided on core.",
          };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message };
        } finally {
          client.release();
        }
      },
      {
        body: t.Object({
          productId: t.Number({ description: "ID produktu" }),
          requestedQty: t.Number({ description: "Požadované množství", minimum: 1 }),
          orderId: t.Optional(t.String({ description: "Volitelné ID objednávky" })),
        }),
        detail: {
          summary: "Vytvořit žádost o zboží",
          description:
            "Vytvoří žádost o alokaci zboží na edge. " +
            "Žádost je vždy přijata jako PENDING a finální schválení/zamítnutí probíhá na core po replikaci.",
        },
      },
    )
    .get(
      "/:id",
      async ({ params, set }) => {
        const rows = await getStockRequest.run({ id: params.id }, pool);
        if (rows.length === 0) {
          set.status = 404;
          return { error: "Stock request not found" };
        }
        return rows[0];
      },
      {
        params: t.Object({ id: t.String() }),
        detail: {
          summary: "Detail žádosti o zboží",
          description: "Vrátí detail žádosti včetně statusu.",
        },
      },
    )
    .get(
      "/:id/decision",
      async ({ params, set }) => {
        // Čte stav rozhodnutí z EDGE databáze.
        // Měří skutečný roundtrip: edge→core (replikace) → trigger → grant / reject → core→edge (replikace).
        const grantRows = await getStockGrantByRequestId.run(
          { requestId: params.id },
          pool,
        );

        if (grantRows.length > 0) {
          const grant = grantRows[0];
          return {
            id: params.id,
            status: grant.status,
            decided: true,
            grant,
          };
        }

        // Grant ještě nedorazil — zkontrolujeme jestli request vůbec existuje
        const reqRows = await getStockRequest.run({ id: params.id }, pool);
        if (reqRows.length === 0) {
          set.status = 404;
          return { error: "Stock request not found" };
        }

        const request = reqRows[0];

        return {
          id: request.id,
          status: "PENDING",
          decided: false,
        };
      },
      {
        params: t.Object({ id: t.String() }),
        detail: {
          summary: "Stav rozhodnutí na edge (H3 benchmark)",
          description:
            "Čte replikovanou core_stock_grants tabulku na edge. " +
            "Dokud grant nebo zamítnutí nedorazí přes replikaci, vrací decided=false.",
        },
      },
    )
    .post(
      "/:id/approve",
      async ({ params, body, set }) => {
        const client = await pool.connect();
        try {
          // Aktualizovat status žádosti
          const [stockRequest] = await updateStockRequestStatus.run(
            { id: params.id, status: "APPROVED" },
            client,
          );

          if (!stockRequest) {
            set.status = 400;
            return { error: "Cannot approve — request not found or already processed" };
          }

          // Vytvořit stock grant
          const qtyToGrant = body.grantedQty ?? stockRequest.requested_qty;
          const [grant] = await createStockGrant.run(
            {
              requestId: stockRequest.id,
              replicationIdentity: edgeId,
              productId: stockRequest.product_id,
              grantedQty: qtyToGrant,
              status: "APPROVED",
            },
            client,
          );

          // Aktualizovat leased_to_edges
          await updateInventoryLeased.run(
            { productId: stockRequest.product_id, addedQty: qtyToGrant },
            client,
          );

          return {
            status: "APPROVED",
            stockRequest,
            grant,
          };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message };
        } finally {
          client.release();
        }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          grantedQty: t.Optional(t.Number({ description: "Schválené množství (výchozí: celá žádost)" })),
        }),
        detail: {
          summary: "Schválit žádost o zboží",
          description:
            "Pouze core mode. Schválí pending žádost a vytvoří core_stock_grants. " +
            "Volitelně lze schválit pouze část požadovaného množství.",
        },
      },
    )
    .post(
      "/:id/reject",
      async ({ params, set }) => {
        const [stockRequest] = await updateStockRequestStatus.run(
          { id: params.id, status: "REJECTED_SCARCITY" },
          pool,
        );

        if (!stockRequest) {
          set.status = 400;
          return { error: "Cannot reject — request not found or already processed" };
        }

        return {
          status: "REJECTED_SCARCITY",
          stockRequest,
        };
      },
      {
        params: t.Object({ id: t.String() }),
        detail: {
          summary: "Zamítnout žádost o zboží",
          description:
            "Zamítne žádost z důvodu scarcity. Pouze core mode.",
        },
      },
    );
