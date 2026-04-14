/* @name GetCartItemsForOrder */
SELECT ci.product_id, ci.quantity, p.price, p.is_scarcity_mode
FROM local_cart_items ci
JOIN core_products p ON ci.product_id = p.id
WHERE ci.cart_id = :cartId!;

/* @name CreateOrder */
INSERT INTO edge_orders (id, user_id, replication_identity, total_price, shipping_address)
VALUES (:orderId!, :userId!, :replicationIdentity!, :totalPrice!, :shippingAddress)
RETURNING *;

/* @name CreateOrderItem */
INSERT INTO edge_order_items (order_id, product_id, quantity, price)
VALUES (:orderId!, :productId!, :quantity!, :price!);

/* @name GetOrderById */
SELECT * FROM edge_orders WHERE id = :id!;

/* @name GetOrderItems */
SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price,
       p.name AS product_name
FROM edge_order_items oi
JOIN core_products p ON oi.product_id = p.id
WHERE oi.order_id = :orderId!;

/* @name UpdateOrderAddress */
UPDATE edge_orders
SET shipping_address = :shippingAddress!
WHERE id = :id! AND status NOT IN ('SHIPPED', 'DELIVERED', 'CANCELLED')
RETURNING *;

/* @name PayOrder */
UPDATE edge_orders
SET status = 'PAID'
WHERE id = :id! AND status IN ('CREATED', 'PENDING')
RETURNING *;
