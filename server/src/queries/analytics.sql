/* @name GetOrderAnalytics */
SELECT
  date_trunc(:granularity!, created_at) AS period,
  count(*)::int              AS order_count,
  sum(total_price)::numeric  AS revenue
FROM edge_orders
WHERE created_at >= :fromDate!::timestamp AND created_at <= :toDate!::timestamp
GROUP BY period
ORDER BY period;
