/** Types generated for queries found in "src/queries/analytics.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'GetOrderAnalytics' parameters type */
export interface IGetOrderAnalyticsParams {
  fromDate: DateOrString;
  granularity: string;
  toDate: DateOrString;
}

/** 'GetOrderAnalytics' return type */
export interface IGetOrderAnalyticsResult {
  order_count: number | null;
  period: Date | null;
  revenue: string | null;
}

/** 'GetOrderAnalytics' query type */
export interface IGetOrderAnalyticsQuery {
  params: IGetOrderAnalyticsParams;
  result: IGetOrderAnalyticsResult;
}

const getOrderAnalyticsIR: any = {"usedParamSet":{"granularity":true,"fromDate":true,"toDate":true},"params":[{"name":"granularity","required":true,"transform":{"type":"scalar"},"locs":[{"a":20,"b":32}]},{"name":"fromDate","required":true,"transform":{"type":"scalar"},"locs":[{"a":180,"b":189}]},{"name":"toDate","required":true,"transform":{"type":"scalar"},"locs":[{"a":220,"b":227}]}],"statement":"SELECT\n  date_trunc(:granularity!, created_at) AS period,\n  count(*)::int              AS order_count,\n  sum(total_price)::numeric  AS revenue\nFROM edge_orders\nWHERE created_at >= :fromDate!::timestamp AND created_at <= :toDate!::timestamp\nGROUP BY period\nORDER BY period"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   date_trunc(:granularity!, created_at) AS period,
 *   count(*)::int              AS order_count,
 *   sum(total_price)::numeric  AS revenue
 * FROM edge_orders
 * WHERE created_at >= :fromDate!::timestamp AND created_at <= :toDate!::timestamp
 * GROUP BY period
 * ORDER BY period
 * ```
 */
export const getOrderAnalytics = new PreparedQuery<IGetOrderAnalyticsParams,IGetOrderAnalyticsResult>(getOrderAnalyticsIR);


