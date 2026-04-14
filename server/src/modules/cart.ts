import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import {
  createCart,
  getCartItems,
  addCartItem,
  deleteCartItem,
} from "../queries/cart.queries";

export const cart = (pool: Pool) =>
  new Elysia({ prefix: "/cart", tags: ["Cart"] })
    .post(
      "/",
      async ({ body, headers, set }) => {
        const orderIdHeader = headers["x-order-id"];
        const orderId = orderIdHeader ?? body?.orderId ?? crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        const rows = await createCart.run({ orderId, sessionId }, pool);
        const cart = rows[0];
        set.headers["X-Order-Id"] = String(cart.id);
        return {
          ...cart,
          orderId: cart.id,
        };
      },
      {
        headers: t.Object({
          "x-order-id": t.Optional(
            t.String({ description: "Preferované ID objednávky" }),
          ),
        }),
        body: t.Optional(
          t.Object({
            orderId: t.Optional(
              t.String({ description: "Volitelné ID objednávky (alias pro hlavičku X-Order-Id)" }),
            ),
          }),
        ),
        detail: {
          summary: "Vytvořit košík",
          description:
            "Vytvoří nový nákupní košík (local_carts). Pokud je zasláno X-Order-Id, použije se jako ID košíku/objednávky. V odpovědi vrací orderId (stejná hodnota jako id).",
        },
      },
    )
    .post(
      "/items",
      async ({ body, headers, set }) => {
        const orderIdHeader = headers["x-order-id"];
        const orderId = orderIdHeader ?? body.orderId;
        if (!orderId) {
          set.status = 400;
          return { error: "orderId is required (X-Order-Id header or body.orderId)" };
        }

        try {
          const rows = await addCartItem.run(
            {
              cartId: orderId,
              productId: body.productId,
              quantity: body.quantity,
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
        headers: t.Object({
          "x-order-id": t.Optional(
            t.String({ description: "Preferované ID objednávky" }),
          ),
        }),
        body: t.Object({
          orderId: t.Optional(
            t.String({ description: "ID objednávky (stejné jako ID košíku)" }),
          ),
          productId: t.Number({ description: "ID produktu" }),
          quantity: t.Number({ description: "Počet kusů", minimum: 1 }),
        }),
        detail: {
          summary: "Přidat do košíku podle orderId",
          description:
            "Preferovaný endpoint pro LB routování podle orderId v body. orderId je stejné jako ID košíku.",
        },
      },
    )
    .get(
      "/:cartId/items",
      async ({ params }) =>
        getCartItems.run({ cartId: params.cartId }, pool),
      {
        params: t.Object({ cartId: t.String() }),
        detail: {
          summary: "Položky v košíku",
          description: "Vrátí všechny položky košíku s cenou a názvem produktu.",
        },
      },
    )
    .post(
      "/:cartId/items",
      async ({ params, body, headers, set }) => {
        try {
          const orderIdHeader = headers["x-order-id"];
          const orderId = orderIdHeader ?? body.orderId ?? params.cartId;
          const rows = await addCartItem.run(
            {
              cartId: orderId,
              productId: body.productId,
              quantity: body.quantity,
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
        params: t.Object({ cartId: t.String() }),
        headers: t.Object({
          "x-order-id": t.Optional(
            t.String({ description: "Preferované ID objednávky" }),
          ),
        }),
        body: t.Object({
          orderId: t.Optional(
            t.String({ description: "Preferované ID objednávky (alias pro cartId)" }),
          ),
          productId: t.Number({ description: "ID produktu" }),
          quantity: t.Number({ description: "Počet kusů", minimum: 1 }),
        }),
        detail: {
          summary: "Přidat do košíku",
          description:
            "Přidá položku do košíku. Pokud produkt již v košíku je, navýší se množství (UPSERT). V body lze poslat orderId jako alias.",
        },
      },
    )
    .delete(
      "/:cartId/items/:itemId",
      async ({ params }) => {
        await deleteCartItem.run(
          { itemId: params.itemId, cartId: params.cartId },
          pool,
        );
        return { success: true };
      },
      {
        params: t.Object({ cartId: t.String(), itemId: t.Number() }),
        detail: {
          summary: "Odebrat z košíku",
          description: "Odstraní položku z košíku podle ID.",
        },
      },
    );
