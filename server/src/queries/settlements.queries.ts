/** Types generated for queries found in "src/queries/settlements.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'CreateSettlementPayouts' parameters type */
export interface ICreateSettlementPayoutsParams {
  settlementDate: DateOrString;
}

/** 'CreateSettlementPayouts' return type */
export interface ICreateSettlementPayoutsResult {
  created_at: Date;
  id: string;
  merchant_id: number;
  merchant_payout: string;
  order_count: number;
  platform_fee: string;
  settlement_period: Date;
  status: string;
  total_amount: string;
}

/** 'CreateSettlementPayouts' query type */
export interface ICreateSettlementPayoutsQuery {
  params: ICreateSettlementPayoutsParams;
  result: ICreateSettlementPayoutsResult;
}

const createSettlementPayoutsIR: any = { "usedParamSet": { "settlementDate": true }, "params": [{ "name": "settlementDate", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 142, "b": 157 }, { "a": 788, "b": 803 }, { "a": 820, "b": 835 }] }], "statement": "INSERT INTO core_payouts (merchant_id, settlement_period, order_count, total_amount, platform_fee, merchant_payout)\nSELECT\n  p.merchant_id,\n  :settlementDate!::date                                           AS settlement_period,\n  count(DISTINCT o.id)::int                                        AS order_count,\n  sum(oi.price * oi.quantity)::numeric(12,2)                       AS total_amount,\n  sum(oi.price * oi.quantity * m.commission_rate / 100)::numeric(12,2) AS platform_fee,\n  sum(oi.price * oi.quantity * (1 - m.commission_rate / 100))::numeric(12,2) AS merchant_payout\nFROM edge_orders o\nJOIN edge_order_items oi ON o.id = oi.order_id\nJOIN core_products p ON oi.product_id = p.id\nJOIN core_merchants m ON p.merchant_id = m.id\nWHERE o.status = 'PAID'\n  AND o.created_at >= :settlementDate!::date\n  AND o.created_at <  :settlementDate!::date + interval '1 day'\nGROUP BY p.merchant_id\nHAVING count(DISTINCT o.id) > 0\nON CONFLICT (merchant_id, settlement_period) DO UPDATE SET\n  order_count = EXCLUDED.order_count,\n  total_amount = EXCLUDED.total_amount,\n  platform_fee = EXCLUDED.platform_fee,\n  merchant_payout = EXCLUDED.merchant_payout,\n  status = 'ready_for_payout'\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO core_payouts (merchant_id, settlement_period, order_count, total_amount, platform_fee, merchant_payout)
 * SELECT
 *   p.merchant_id,
 *   :settlementDate!::date                                           AS settlement_period,
 *   count(DISTINCT o.id)::int                                        AS order_count,
 *   sum(oi.price * oi.quantity)::numeric(12,2)                       AS total_amount,
 *   sum(oi.price * oi.quantity * m.commission_rate / 100)::numeric(12,2) AS platform_fee,
 *   sum(oi.price * oi.quantity * (1 - m.commission_rate / 100))::numeric(12,2) AS merchant_payout
 * FROM edge_orders o
 * JOIN edge_order_items oi ON o.id = oi.order_id
 * JOIN core_products p ON oi.product_id = p.id
 * JOIN core_merchants m ON p.merchant_id = m.id
 * WHERE o.status = 'PAID'
 *   AND o.created_at::date = :settlementDate!::date
 * GROUP BY p.merchant_id
 * HAVING count(DISTINCT o.id) > 0
 * ON CONFLICT (merchant_id, settlement_period) DO UPDATE SET
 *   order_count = EXCLUDED.order_count,
 *   total_amount = EXCLUDED.total_amount,
 *   platform_fee = EXCLUDED.platform_fee,
 *   merchant_payout = EXCLUDED.merchant_payout,
 *   status = 'ready_for_payout'
 * RETURNING *
 * ```
 */
export const createSettlementPayouts = new PreparedQuery<ICreateSettlementPayoutsParams, ICreateSettlementPayoutsResult>(createSettlementPayoutsIR);


/** 'GetSettlementPayouts' parameters type */
export interface IGetSettlementPayoutsParams {
  settlementDate: DateOrString;
}

/** 'GetSettlementPayouts' return type */
export interface IGetSettlementPayoutsResult {
  created_at: Date;
  id: string;
  merchant_id: number;
  merchant_name: string;
  merchant_payout: string;
  order_count: number;
  platform_fee: string;
  settlement_period: Date;
  status: string;
  total_amount: string;
}

/** 'GetSettlementPayouts' query type */
export interface IGetSettlementPayoutsQuery {
  params: IGetSettlementPayoutsParams;
  result: IGetSettlementPayoutsResult;
}

const getSettlementPayoutsIR: any = { "usedParamSet": { "settlementDate": true }, "params": [{ "name": "settlementDate", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 134, "b": 149 }] }], "statement": "SELECT cp.*, m.name AS merchant_name\nFROM core_payouts cp\nJOIN core_merchants m ON cp.merchant_id = m.id\nWHERE cp.settlement_period = :settlementDate!::date\nORDER BY cp.merchant_payout DESC" };

/**
 * Query generated from SQL:
 * ```
 * SELECT cp.*, m.name AS merchant_name
 * FROM core_payouts cp
 * JOIN core_merchants m ON cp.merchant_id = m.id
 * WHERE cp.settlement_period = :settlementDate!::date
 * ORDER BY cp.merchant_payout DESC
 * ```
 */
export const getSettlementPayouts = new PreparedQuery<IGetSettlementPayoutsParams, IGetSettlementPayoutsResult>(getSettlementPayoutsIR);


