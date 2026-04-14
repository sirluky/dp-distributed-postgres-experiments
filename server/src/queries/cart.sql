/* @name CreateCart */
INSERT INTO local_carts (id, session_id) VALUES (:orderId!, :sessionId!) RETURNING *;

/* @name GetCartItems */
SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity,
       p.name AS product_name, p.price
FROM local_cart_items ci
JOIN core_products p ON ci.product_id = p.id
WHERE ci.cart_id = :cartId!;

/* @name AddCartItem */
INSERT INTO local_cart_items (cart_id, product_id, quantity)
VALUES (:cartId!, :productId!, :quantity!)
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = local_cart_items.quantity + EXCLUDED.quantity
RETURNING *;

/* @name DeleteCartItem */
DELETE FROM local_cart_items WHERE id = :itemId! AND cart_id = :cartId!;

/* @name DeleteCartItemsByCartId */
DELETE FROM local_cart_items WHERE cart_id = :cartId!;
