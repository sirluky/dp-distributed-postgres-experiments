import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import {
  getInventoryQuota,
  upsertInventoryQuota,
  consumeInventoryQuota,
  getInventoryQuotaForProducts,
} from "../queries/inventory-quota.queries";

export const inventoryQuota = (pool: Pool, _edgeId: string) =>
  new Elysia({ prefix: "/inventory-quota", tags: ["Inventory Quota"] })
    .get(
      "/:productId",
      async ({ params, set }) => {
        const rows = await getInventoryQuota.run({ productId: params.productId }, pool);
        if (rows.length === 0) {
          // Žádná kvóta nastavená = neomezeno
          return {
            productId: params.productId,
            quantity: null,
            isUnlimited: true,
          };
        }
        return {
          productId: rows[0].product_id,
          quantity: rows[0].quantity,
          lastUpdated: rows[0].last_updated,
          isUnlimited: false,
        };
      },
      {
        params: t.Object({ productId: t.Number() }),
        detail: {
          summary: "Získat kvótu produktu",
          description:
            "Vrátí lokální kvótu pro produkt. Pokud kvóta není nastavena, považuje se za neomezenou.",
        },
      },
    )
    .get(
      "/batch/products",
      async ({ query, set }) => {
        const productIds = query.productIds?.split(",").map(id => parseInt(id, 10)).filter(n => !isNaN(n));

        if (!productIds || productIds.length === 0) {
          set.status = 400;
          return { error: "productIds query parameter is required (comma-separated list)" };
        }

        const rows = await getInventoryQuotaForProducts.run({ productIds }, pool);

        // Vrátit i produkty bez kvóty (neomezeně)
        const result = productIds.map(productId => {
          const found = rows.find(r => r.product_id === productId);
          if (found) {
            return { productId, quantity: found.quantity, isUnlimited: false };
          }
          return { productId, quantity: null, isUnlimited: true };
        });

        return result;
      },
      {
        query: t.Object({
          productIds: t.String({ description: "Čárkami oddělený seznam ID produktů" }),
        }),
        detail: {
          summary: "Získat kvóty pro více produktů",
          description:
            "Vrátí lokální kvóty pro více produktů najednou.",
        },
      },
    )
    .put(
      "/",
      async ({ body, set }) => {
        const { productId, quantity } = body;
        try {
          const rows = await upsertInventoryQuota.run({ productId, quantity }, pool);

          return {
            productId: rows[0].product_id,
            quantity: rows[0].quantity,
            lastUpdated: rows[0].last_updated,
          };
        } catch (error: any) {
          // 23503 
          if (error?.code === "23503") {
            set.status = 404;
            return { error: "Product not found" };
          }
          set.status = 500;
          return { error: error?.message ?? "Internal error" };
        }
      },
      {
        body: t.Object({
          productId: t.Number({ description: "ID produktu" }),
          quantity: t.Number({ description: "Nastavená kvóta (0 = vyčerpáno)", minimum: 0 }),
        }),
        detail: {
          summary: "Nastavit kvótu produktu",
          description:
            "Nastaví lokální kvótu pro produkt. Pouze pro admin/core operace.",
        },
      },
    )
    .post(
      "/consume",
      async ({ body, set }) => {
        const { productId, amount } = body;

        const rows = await consumeInventoryQuota.run({ productId, amount }, pool);

        if (rows.length === 0) {
          // Buď produkt nemá kvótu, nebo není dostatek
          const quota = await getInventoryQuota.run({ productId }, pool);

          if (quota.length === 0) {
            // Žádná kvóta nastavena = neomezeno, spotřeba v pořádku
            return {
              success: true,
              productId,
              amount,
              remaining: null,
              message: "No quota set — unlimited",
            };
          }

          set.status = 400;
          return {
            error: "Insufficient quota",
            productId,
            requested: amount,
            available: quota[0].quantity,
          };
        }

        return {
          success: true,
          productId,
          amount,
          remaining: rows[0].quantity,
        };
      },
      {
        body: t.Object({
          productId: t.Number({ description: "ID produktu" }),
          amount: t.Number({ description: "Množství ke spotřebování", minimum: 1 }),
        }),
        detail: {
          summary: "Spotřebovat kvótu",
          description:
            "Sníží dostupnou kvótu při prodeji. Vrací error, pokud není dostatek kvóty.",
        },
      },
    );
