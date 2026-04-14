import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import { getProducts, getProductById } from "../queries/products.queries";

export const products = (pool: Pool) =>
  new Elysia({ prefix: "/products", tags: ["Products"] })
    .get(
      "/",
      async () => getProducts.run(undefined, pool),
      {
        detail: {
          summary: "Výpis produktů",
          description:
            "Vrátí všechny produkty včetně názvu obchodníka. Na edge uzlu čte z lokální repliky core_products.",
        },
      },
    )
    .get(
      "/:id",
      async ({ params, set }) => {
        const rows = await getProductById.run({ id: params.id }, pool);
        if (rows.length === 0) {
          set.status = 404;
          return { error: "Product not found" };
        }
        return rows[0];
      },
      {
        params: t.Object({ id: t.Number() }),
        detail: {
          summary: "Detail produktu",
          description: "Vrátí detail jednoho produktu podle ID.",
        },
      },
    );
