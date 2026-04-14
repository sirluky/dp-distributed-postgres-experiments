import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import {
  getCartItemsForOrder,
  createOrder,
  createOrderItem,
  getOrderById,
  getOrderItems,
  updateOrderAddress,
  payOrder,
} from "../queries/orders.queries";
import { deleteCartItemsByCartId } from "../queries/cart.queries";
import { createStockRequest } from "../queries/stock-requests.queries";

export const orders = (pool: Pool, edgeId: string) =>
  new Elysia({ tags: ["Orders"] })
    .post(
      "/orders",
      async ({ body, headers, set }) => {
        const orderIdHeader = headers["x-order-id"];
        const orderId = orderIdHeader ?? body.orderId ?? body.cartId;
        if (!orderId) {
          set.status = 400;
          return { error: "orderId is required (X-Order-Id header or body.orderId)" };
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const cartItems = await getCartItemsForOrder.run(
            { cartId: orderId },
            client,
          );

          if (cartItems.length === 0) {
            await client.query("ROLLBACK");
            set.status = 400;
            return { error: "Cart is empty" };
          }

          const totalPrice = cartItems.reduce(
            (sum, i) => sum + parseFloat(i.price) * i.quantity,
            0,
          );

          const [order] = await createOrder.run(
            {
              orderId,
              userId: body.userId,
              replicationIdentity: edgeId,
              totalPrice,
              shippingAddress: body.shippingAddress ?? null,
            },
            client,
          );

          for (const item of cartItems) {
            await createOrderItem.run(
              {
                orderId: order.id,
                productId: item.product_id,
                quantity: item.quantity,
                price: item.price,
              },
              client,
            );

            // Scarcity products require async stock allocation on core.
            if (item.is_scarcity_mode) {
              await createStockRequest.run(
                {
                  orderId: order.id,
                  replicationIdentity: edgeId,
                  productId: item.product_id,
                  requestedQty: item.quantity,
                  status: "PENDING",
                },
                client,
              );
            }
          }

          await deleteCartItemsByCartId.run({ cartId: orderId }, client);
          await client.query("COMMIT");

          console.log(
            `📧 [Email] Objednávka ${order.id} vytvořena — potvrzení uživateli ${body.userId}`,
          );
          return order;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
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
            t.String({ description: "ID objednávky (stejné jako původní ID košíku)" }),
          ),
          cartId: t.Optional(
            t.String({ description: "Zpětná kompatibilita: alias pro orderId" }),
          ),
          userId: t.Number({ description: "ID uživatele" }),
          shippingAddress: t.Optional(
            t.String({ description: "Doručovací adresa" }),
          ),
        }),
        detail: {
          summary: "Vytvořit objednávku",
          description:
            "Vytvoří objednávku z košíku v transakci. Zapíše do edge_orders + edge_order_items a vymaže košík. Data se asynchronně replikují na core.",
        },
      },
    )
    .get(
      "/orders/:id",
      async ({ params, set }) => {
        const rows = await getOrderById.run({ id: params.id }, pool);
        if (rows.length === 0) {
          set.status = 404;
          return { error: "Order not found" };
        }
        const items = await getOrderItems.run({ orderId: params.id }, pool);
        return { ...rows[0], items };
      },
      {
        params: t.Object({ id: t.String() }),
        detail: {
          summary: "Detail objednávky",
          description:
            "Vrátí objednávku včetně seznamu položek.",
        },
      },
    )
    .patch(
      "/orders/:id/address",
      async ({ params, body, set }) => {
        const rows = await updateOrderAddress.run(
          { shippingAddress: body.shippingAddress, id: params.id },
          pool,
        );
        if (rows.length === 0) {
          set.status = 400;
          return { error: "Order not found or cannot change address in terminal/shipped state" };
        }
        console.log(`📧 [Email] Adresa objednávky ${params.id} změněna`);
        return rows[0];
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          shippingAddress: t.String({ description: "Nová doručovací adresa" }),
        }),
        detail: {
          summary: "Změnit adresu objednávky",
          description:
            "Změní doručovací adresu, pokud objednávka není ve stavech SHIPPED, DELIVERED nebo CANCELLED.",
        },
      },
    );

export const webhooks = (pool: Pool) =>
  new Elysia({ prefix: "/webhooks", tags: ["Webhooks"] }).post(
    "/payment",
    async ({ body, headers, set }) => {
      const orderIdHeader = headers["x-order-id"];
      const orderId = orderIdHeader ?? body.orderId;
      if (!orderId) {
        set.status = 400;
        return { error: "orderId is required (X-Order-Id header or body.orderId)" };
      }

      const rows = await payOrder.run({ id: orderId }, pool);
      if (rows.length === 0) {
        set.status = 400;
        return { error: "Order not found or already paid" };
      }
      console.log(
        `📧 [Email] Platba přijata pro objednávku ${orderId}`,
      );
      return { success: true, order: rows[0] };
    },
    {
      headers: t.Object({
        "x-order-id": t.Optional(
          t.String({ description: "Preferované ID objednávky" }),
        ),
      }),
      body: t.Object({
        orderId: t.Optional(t.String({ description: "ID objednávky" })),
      }),
      detail: {
        summary: "Webhook platební brány",
        description:
          "Přijme potvrzení o platbě a změní stav objednávky na 'PAID'. Simuluje webhook od poskytovatele plateb.",
      },
    },
  );
