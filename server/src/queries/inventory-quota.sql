/* @name GetInventoryQuota */
SELECT product_id, quantity, last_updated FROM local_inventory_quota WHERE product_id = :productId!;

/* @name UpsertInventoryQuota */
INSERT INTO local_inventory_quota (product_id, quantity)
VALUES (:productId!, :quantity!)
ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated = CURRENT_TIMESTAMP
RETURNING *;

/* @name ConsumeInventoryQuota */
UPDATE local_inventory_quota
SET quantity = quantity - :amount!,
    last_updated = CURRENT_TIMESTAMP
WHERE product_id = :productId! AND quantity >= :amount!
RETURNING *;

/* @name GetInventoryQuotaForProducts */
SELECT product_id, quantity FROM local_inventory_quota WHERE product_id = ANY(:productIds!);
