/* @name GetProducts */
SELECT p.id, p.name, p.price, p.is_scarcity_mode,
       m.name AS merchant_name, m.id AS merchant_id
FROM core_products p
JOIN core_merchants m ON p.merchant_id = m.id
ORDER BY p.id
LIMIT 200;

/* @name GetProductById */
SELECT p.id, p.name, p.price, p.is_scarcity_mode, p.merchant_id,
       m.name AS merchant_name
FROM core_products p
JOIN core_merchants m ON p.merchant_id = m.id
WHERE p.id = :id!;
