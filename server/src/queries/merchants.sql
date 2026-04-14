/* @name GetMerchants */
SELECT * FROM core_merchants ORDER BY name;

/* @name CreateMerchant */
INSERT INTO core_merchants (name, commission_rate)
VALUES (:name!, :commissionRate!) RETURNING *;

/* @name CreateProduct */
INSERT INTO core_products (merchant_id, name, price, is_scarcity_mode)
VALUES (:merchantId!, :name!, :price!, :isScarcityMode!) RETURNING *;

/* @name GetMerchantOrders */
SELECT o.id, o.user_id, o.replication_identity, o.total_price,
       o.status, o.shipping_address, o.created_at,
       json_agg(json_build_object(
         'product_id', oi.product_id,
         'product_name', p.name,
         'quantity', oi.quantity,
         'price', oi.price
       )) AS items
FROM edge_orders o
JOIN edge_order_items oi ON o.id = oi.order_id
JOIN core_products p ON oi.product_id = p.id
WHERE p.merchant_id = :merchantId!
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 50;

/* @name UpdateMerchantFee */
UPDATE core_merchants SET commission_rate = :commissionRate!
WHERE id = :id! RETURNING *;

/* @name SetProductPhysicalStock */
INSERT INTO core_inventory_ledger (product_id, total_physical_stock, leased_to_edges)
VALUES (:productId!, :totalPhysicalStock!, 0)
ON CONFLICT (product_id) DO UPDATE
SET total_physical_stock = :totalPhysicalStock!
WHERE core_inventory_ledger.leased_to_edges <= :totalPhysicalStock!
RETURNING *;

/*
  @name DeleteMerchantsByName
  @param names -> (...)
*/
DELETE FROM core_merchants WHERE name IN :names;
