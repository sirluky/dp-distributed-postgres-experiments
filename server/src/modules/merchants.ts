import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import {
  getMerchants,
  createMerchant,
  createProduct,
  getMerchantOrders,
  updateMerchantFee,
  setProductPhysicalStock,
} from "../queries/merchants.queries";

export const merchants = (pool: Pool) =>
  new Elysia({ prefix: "/merchants", tags: ["Merchants"] })
    .get(
      "/",
      async () => getMerchants.run(undefined, pool),
      {
        detail: {
          summary: "Výpis obchodníků",
          description: "Vrátí seznam všech registrovaných obchodníků.",
        },
      },
    )
    .post(
      "/",
      async ({ body, set }) => {
        try {
          const rows = await createMerchant.run(
            { name: body.name, commissionRate: body.commissionRate },
            pool,
          );
          return rows[0];
        } catch (e: any) {
          set.status = 400;
          return { error: e.message };
        }
      },
      {
        body: t.Object({
          name: t.String({ description: "Název obchodníka" }),
          commissionRate: t.Number({
            description: "Provize platformy v %",
            minimum: 0,
            maximum: 100,
          }),
        }),
        detail: {
          summary: "Registrovat obchodníka",
          description:
            "Vytvoří nový obchod (core_merchants). Funguje pouze na core — na edge uzlu selže díky read-only triggeru.",
        },
      },
    )
    .post(
      "/:id/products",
      async ({ params, body, set }) => {
        try {
          const rows = await createProduct.run(
            {
              merchantId: params.id,
              name: body.name,
              price: body.price,
              isScarcityMode: body.isScarcityMode ?? false,
            },
            pool,
          );
          return rows[0];
        } catch (e: any) {
          set.status = 400;
          return { error: e.message };
        }
      },
      {
        params: t.Object({ id: t.Number() }),
        body: t.Object({
          name: t.String({ description: "Název produktu" }),
          price: t.Number({ description: "Cena v CZK", minimum: 0 }),
          isScarcityMode: t.Optional(
            t.Boolean({
              description: "Omezená dostupnost — vyžaduje stock-grant flow",
            }),
          ),
        }),
        detail: {
          summary: "Přidat produkt",
          description:
            "Přidá produkt ke zvolenému obchodníkovi. Produkt se zreplikuje na všechny edge uzly.",
        },
      },
    )
    .put(
      "/products/:productId/stock",
      async ({ params, body, set }) => {
        try {
          const rows = await setProductPhysicalStock.run(
            {
              productId: params.productId,
              totalPhysicalStock: body.totalPhysicalStock,
            },
            pool,
          );

          if (rows.length === 0) {
            set.status = 400;
            return { error: "Cannot set stock below already leased quantity" };
          }

          const row = rows[0];
          return {
            productId: row.product_id,
            totalPhysicalStock: row.total_physical_stock,
            leasedToEdges: row.leased_to_edges,
            available: row.total_physical_stock - row.leased_to_edges,
          };
        } catch (e: any) {
          if (e?.code === "23503") {
            set.status = 404;
            return { error: "Product not found" };
          }

          set.status = 500;
          return { error: e?.message ?? "Internal error" };
        }
      },
      {
        params: t.Object({
          productId: t.Number({ description: "ID produktu" }),
        }),
        body: t.Object({
          totalPhysicalStock: t.Number({
            description: "Celkový fyzický stock produktu na core",
            minimum: 0,
          }),
        }),
        detail: {
          summary: "Nastavit fyzický stock produktu",
          description:
            "Nastaví fyzický stock v core_inventory_ledger. Hodnota nesmí být menší než již alokované množství do edge uzlů.",
        },
      },
    )
    .get(
      "/:id/orders",
      async ({ params }) =>
        getMerchantOrders.run({ merchantId: params.id }, pool),
      {
        params: t.Object({ id: t.Number() }),
        detail: {
          summary: "Objednávky obchodníka",
          description:
            "Vrátí všechny objednávky, které obsahují produkty daného obchodníka. Data jsou agregovaná z edge_orders replikovaných na core.",
        },
      },
    )
    .patch(
      "/:id/fee",
      async ({ params, body, set }) => {
        const rows = await updateMerchantFee.run(
          { commissionRate: body.commissionRate, id: params.id },
          pool,
        );
        if (rows.length === 0) {
          set.status = 404;
          return { error: "Merchant not found" };
        }
        return rows[0];
      },
      {
        params: t.Object({ id: t.Number() }),
        body: t.Object({
          commissionRate: t.Number({
            description: "Nová provize v %",
            minimum: 0,
            maximum: 100,
          }),
        }),
        detail: {
          summary: "Upravit provizi",
          description:
            "Změní procentuální provizi platformy pro obchodníka (P1 — Platform management).",
        },
      },
    );
