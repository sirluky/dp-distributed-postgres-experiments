/** Types generated for queries found in "src/queries/orders.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

/** 'GetCartItemsForOrder' parameters type */
export interface IGetCartItemsForOrderParams {
  cartId: string;
}

/** 'GetCartItemsForOrder' return type */
export interface IGetCartItemsForOrderResult {
  is_scarcity_mode: boolean;
  price: string;
  product_id: number;
  quantity: number;
}

/** 'GetCartItemsForOrder' query type */
export interface IGetCartItemsForOrderQuery {
  params: IGetCartItemsForOrderParams;
  result: IGetCartItemsForOrderResult;
}

const getCartItemsForOrderIR: any = { "usedParamSet": { "cartId": true }, "params": [{ "name": "cartId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 152, "b": 159 }] }], "statement": "SELECT ci.product_id, ci.quantity, p.price, p.is_scarcity_mode\nFROM local_cart_items ci\nJOIN core_products p ON ci.product_id = p.id\nWHERE ci.cart_id = :cartId!" };

/**
 * Query generated from SQL:
 * ```
 * SELECT ci.product_id, ci.quantity, p.price, p.is_scarcity_mode
 * FROM local_cart_items ci
 * JOIN core_products p ON ci.product_id = p.id
 * WHERE ci.cart_id = :cartId!
 * ```
 */
export const getCartItemsForOrder = new PreparedQuery<IGetCartItemsForOrderParams, IGetCartItemsForOrderResult>(getCartItemsForOrderIR);


/** 'CreateOrder' parameters type */
export interface ICreateOrderParams {
  orderId: string;
  replicationIdentity: string;
  shippingAddress?: string | null | void;
  totalPrice: NumberOrString;
  userId: number;
}

/** 'CreateOrder' return type */
export interface ICreateOrderResult {
  created_at: Date;
  id: string;
  replication_identity: string;
  shipping_address: string | null;
  status: string;
  total_price: string;
  user_id: number;
}

/** 'CreateOrder' query type */
export interface ICreateOrderQuery {
  params: ICreateOrderParams;
  result: ICreateOrderResult;
}

const createOrderIR: any = { "usedParamSet": { "orderId": true, "userId": true, "replicationIdentity": true, "totalPrice": true, "shippingAddress": true }, "params": [{ "name": "orderId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 99, "b": 107 }] }, { "name": "userId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 110, "b": 117 }] }, { "name": "replicationIdentity", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 120, "b": 140 }] }, { "name": "totalPrice", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 143, "b": 154 }] }, { "name": "shippingAddress", "required": false, "transform": { "type": "scalar" }, "locs": [{ "a": 157, "b": 172 }] }], "statement": "INSERT INTO edge_orders (id, user_id, replication_identity, total_price, shipping_address)\nVALUES (:orderId!, :userId!, :replicationIdentity!, :totalPrice!, :shippingAddress)\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO edge_orders (id, user_id, replication_identity, total_price, shipping_address)
 * VALUES (:orderId!, :userId!, :replicationIdentity!, :totalPrice!, :shippingAddress)
 * RETURNING *
 * ```
 */
export const createOrder = new PreparedQuery<ICreateOrderParams, ICreateOrderResult>(createOrderIR);


/** 'CreateOrderItem' parameters type */
export interface ICreateOrderItemParams {
  orderId: string;
  price: NumberOrString;
  productId: number;
  quantity: number;
}

/** 'CreateOrderItem' return type */
export type ICreateOrderItemResult = void;

/** 'CreateOrderItem' query type */
export interface ICreateOrderItemQuery {
  params: ICreateOrderItemParams;
  result: ICreateOrderItemResult;
}

const createOrderItemIR: any = { "usedParamSet": { "orderId": true, "productId": true, "quantity": true, "price": true }, "params": [{ "name": "orderId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 77, "b": 85 }] }, { "name": "productId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 88, "b": 98 }] }, { "name": "quantity", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 101, "b": 110 }] }, { "name": "price", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 113, "b": 119 }] }], "statement": "INSERT INTO edge_order_items (order_id, product_id, quantity, price)\nVALUES (:orderId!, :productId!, :quantity!, :price!)" };

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO edge_order_items (order_id, product_id, quantity, price)
 * VALUES (:orderId!, :productId!, :quantity!, :price!)
 * ```
 */
export const createOrderItem = new PreparedQuery<ICreateOrderItemParams, ICreateOrderItemResult>(createOrderItemIR);


/** 'GetOrderById' parameters type */
export interface IGetOrderByIdParams {
  id: string;
}

/** 'GetOrderById' return type */
export interface IGetOrderByIdResult {
  created_at: Date;
  id: string;
  replication_identity: string;
  shipping_address: string | null;
  status: string;
  total_price: string;
  user_id: number;
}

/** 'GetOrderById' query type */
export interface IGetOrderByIdQuery {
  params: IGetOrderByIdParams;
  result: IGetOrderByIdResult;
}

const getOrderByIdIR: any = { "usedParamSet": { "id": true }, "params": [{ "name": "id", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 37, "b": 40 }] }], "statement": "SELECT * FROM edge_orders WHERE id = :id!" };

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM edge_orders WHERE id = :id!
 * ```
 */
export const getOrderById = new PreparedQuery<IGetOrderByIdParams, IGetOrderByIdResult>(getOrderByIdIR);


/** 'GetOrderItems' parameters type */
export interface IGetOrderItemsParams {
  orderId: string;
}

/** 'GetOrderItems' return type */
export interface IGetOrderItemsResult {
  id: string;
  order_id: string;
  price: string;
  product_id: number;
  product_name: string;
  quantity: number;
}

/** 'GetOrderItems' query type */
export interface IGetOrderItemsQuery {
  params: IGetOrderItemsParams;
  result: IGetOrderItemsResult;
}

const getOrderItemsIR: any = { "usedParamSet": { "orderId": true }, "params": [{ "name": "orderId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 185, "b": 193 }] }], "statement": "SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price,\n       p.name AS product_name\nFROM edge_order_items oi\nJOIN core_products p ON oi.product_id = p.id\nWHERE oi.order_id = :orderId!" };

/**
 * Query generated from SQL:
 * ```
 * SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price,
 *        p.name AS product_name
 * FROM edge_order_items oi
 * JOIN core_products p ON oi.product_id = p.id
 * WHERE oi.order_id = :orderId!
 * ```
 */
export const getOrderItems = new PreparedQuery<IGetOrderItemsParams, IGetOrderItemsResult>(getOrderItemsIR);


/** 'UpdateOrderAddress' parameters type */
export interface IUpdateOrderAddressParams {
  id: string;
  shippingAddress: string;
}

/** 'UpdateOrderAddress' return type */
export interface IUpdateOrderAddressResult {
  created_at: Date;
  id: string;
  replication_identity: string;
  shipping_address: string | null;
  status: string;
  total_price: string;
  user_id: number;
}

/** 'UpdateOrderAddress' query type */
export interface IUpdateOrderAddressQuery {
  params: IUpdateOrderAddressParams;
  result: IUpdateOrderAddressResult;
}

const updateOrderAddressIR: any = { "usedParamSet": { "shippingAddress": true, "id": true }, "params": [{ "name": "shippingAddress", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 42, "b": 58 }] }, { "name": "id", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 71, "b": 74 }] }], "statement": "UPDATE edge_orders\nSET shipping_address = :shippingAddress!\nWHERE id = :id! AND status NOT IN ('SHIPPED', 'DELIVERED', 'CANCELLED')\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * UPDATE edge_orders
 * SET shipping_address = :shippingAddress!
 * WHERE id = :id! AND status NOT IN ('SHIPPED', 'DELIVERED', 'CANCELLED')
 * RETURNING *
 * ```
 */
export const updateOrderAddress = new PreparedQuery<IUpdateOrderAddressParams, IUpdateOrderAddressResult>(updateOrderAddressIR);


/** 'CheckOrderPaymentReadiness' parameters type */
export interface ICheckOrderPaymentReadinessParams {
  id: string;
}

/** 'CheckOrderPaymentReadiness' return type */
export interface ICheckOrderPaymentReadinessResult {
  is_payable_state: boolean | null;
  missing_scarcity_items: number | null;
  order_exists: boolean | null;
}

/** 'CheckOrderPaymentReadiness' query type */
export interface ICheckOrderPaymentReadinessQuery {
  params: ICheckOrderPaymentReadinessParams;
  result: ICheckOrderPaymentReadinessResult;
}

const checkOrderPaymentReadinessIR: any = { "usedParamSet": { "id": true }, "params": [{ "name": "id", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 84, "b": 87 }, { "a": 189, "b": 192 }, { "a": 407, "b": 410 }] }], "statement": "SELECT\n    EXISTS(\n        SELECT 1\n        FROM edge_orders o\n        WHERE o.id = :id!\n    ) AS order_exists,\n    EXISTS(\n        SELECT 1\n        FROM edge_orders o\n        WHERE o.id = :id!\n            AND o.status = 'created'\n    ) AS is_payable_state,\n    (\n        SELECT COUNT(*)::int\n        FROM edge_order_items oi\n        JOIN core_products p ON p.id = oi.product_id\n        WHERE oi.order_id = :id!\n            AND p.is_scarcity_mode = TRUE\n            AND COALESCE(\n                (\n                    SELECT SUM(g.granted_qty)\n                    FROM edge_stock_requests r\n                    JOIN core_stock_grants g ON g.request_id = r.id\n                    WHERE r.order_id = oi.order_id\n                        AND r.product_id = oi.product_id\n                ),\n                0\n            ) < oi.quantity\n    ) AS missing_scarcity_items" };

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *     EXISTS(
 *         SELECT 1
 *         FROM edge_orders o
 *         WHERE o.id = :id!
 *     ) AS order_exists,
 *     EXISTS(
 *         SELECT 1
 *         FROM edge_orders o
 *         WHERE o.id = :id!
 *             AND o.status = 'created'
 *     ) AS is_payable_state,
 *     (
 *         SELECT COUNT(*)::int
 *         FROM edge_order_items oi
 *         JOIN core_products p ON p.id = oi.product_id
 *         WHERE oi.order_id = :id!
 *             AND p.is_scarcity_mode = TRUE
 *             AND COALESCE(
 *                 (
 *                     SELECT SUM(g.granted_qty)
 *                     FROM edge_stock_requests r
 *                     JOIN core_stock_grants g ON g.request_id = r.id
 *                     WHERE r.order_id = oi.order_id
 *                         AND r.product_id = oi.product_id
 *                 ),
 *                 0
 *             ) < oi.quantity
 *     ) AS missing_scarcity_items
 * ```
 */
export const checkOrderPaymentReadiness = new PreparedQuery<ICheckOrderPaymentReadinessParams, ICheckOrderPaymentReadinessResult>(checkOrderPaymentReadinessIR);


/** 'PayOrder' parameters type */
export interface IPayOrderParams {
  id: string;
}

/** 'PayOrder' return type */
export interface IPayOrderResult {
  created_at: Date;
  id: string;
  replication_identity: string;
  shipping_address: string | null;
  status: string;
  total_price: string;
  user_id: number;
}

/** 'PayOrder' query type */
export interface IPayOrderQuery {
  params: IPayOrderParams;
  result: IPayOrderResult;
}

const payOrderIR: any = { "usedParamSet": { "id": true }, "params": [{ "name": "id", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 50, "b": 53 }] }], "statement": "UPDATE edge_orders\nSET status = 'PAID'\nWHERE id = :id! AND status IN ('CREATED', 'PENDING')\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * UPDATE edge_orders
 * SET status = 'paid'
 * WHERE id = :id! AND status = 'created'
 * RETURNING *
 * ```
 */
export const payOrder = new PreparedQuery<IPayOrderParams, IPayOrderResult>(payOrderIR);


