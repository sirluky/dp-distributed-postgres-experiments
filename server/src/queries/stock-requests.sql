/* @name CreateStockRequest */
INSERT INTO edge_stock_requests (order_id, replication_identity, product_id, requested_qty, status)
VALUES (:orderId, :replicationIdentity!, :productId!, :requestedQty!, :status!)
RETURNING *;

/* @name GetStockRequest */
SELECT * FROM edge_stock_requests WHERE id = :id!;

/* @name GetStockRequestByProduct */
SELECT * FROM edge_stock_requests WHERE product_id = :productId! AND status = 'PENDING'
ORDER BY created_at DESC
LIMIT 1;

/* @name UpdateStockRequestStatus */
UPDATE edge_stock_requests
SET status = :status!
WHERE id = :id! AND status = 'PENDING'
RETURNING *;

/* @name CreateStockGrant */
INSERT INTO core_stock_grants (request_id, replication_identity, product_id, granted_qty, status)
VALUES (:requestId!, :replicationIdentity!, :productId!, :grantedQty!, :status!)
ON CONFLICT (request_id) DO UPDATE
SET replication_identity = EXCLUDED.replication_identity,
	product_id = EXCLUDED.product_id,
	granted_qty = EXCLUDED.granted_qty,
	status = EXCLUDED.status
RETURNING *;

/* @name GetStockGrantByRequestId */
SELECT * FROM core_stock_grants WHERE request_id = :requestId!;

/* @name GetInventoryLedger */
SELECT product_id, total_physical_stock, leased_to_edges FROM core_inventory_ledger WHERE product_id = :productId!;

/* @name UpdateInventoryLeased */
UPDATE core_inventory_ledger
SET leased_to_edges = leased_to_edges + :addedQty!
WHERE product_id = :productId! AND leased_to_edges + :addedQty! <= total_physical_stock
RETURNING *;
