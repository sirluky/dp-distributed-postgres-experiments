/* @name CreateSettlementPayouts */
INSERT INTO core_payouts (merchant_id, settlement_period, order_count, total_amount, platform_fee, merchant_payout)
SELECT
  p.merchant_id,
  :settlementDate!::date                                           AS settlement_period,
  count(DISTINCT o.id)::int                                        AS order_count,
  sum(oi.price * oi.quantity)::numeric(12,2)                       AS total_amount,
  sum(oi.price * oi.quantity * m.commission_rate / 100)::numeric(12,2) AS platform_fee,
  sum(oi.price * oi.quantity * (1 - m.commission_rate / 100))::numeric(12,2) AS merchant_payout
FROM edge_orders o
JOIN edge_order_items oi ON o.id = oi.order_id
JOIN core_products p ON oi.product_id = p.id
JOIN core_merchants m ON p.merchant_id = m.id
WHERE o.status = 'PAID'
  AND o.created_at >= :settlementDate!::date
  AND o.created_at <  :settlementDate!::date + interval '1 day'
GROUP BY p.merchant_id
HAVING count(DISTINCT o.id) > 0
ON CONFLICT (merchant_id, settlement_period) DO UPDATE SET
  order_count = EXCLUDED.order_count,
  total_amount = EXCLUDED.total_amount,
  platform_fee = EXCLUDED.platform_fee,
  merchant_payout = EXCLUDED.merchant_payout,
  status = 'ready_for_payout'
RETURNING *;

/* @name GetSettlementPayouts */
SELECT cp.*, m.name AS merchant_name
FROM core_payouts cp
JOIN core_merchants m ON cp.merchant_id = m.id
WHERE cp.settlement_period = :settlementDate!::date
ORDER BY cp.merchant_payout DESC;
