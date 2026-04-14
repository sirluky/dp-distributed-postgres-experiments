/** Types generated for queries found in "src/queries/inventory-quota.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type numberArray = (number)[];

/** 'GetInventoryQuota' parameters type */
export interface IGetInventoryQuotaParams {
  productId: number;
}

/** 'GetInventoryQuota' return type */
export interface IGetInventoryQuotaResult {
  last_updated: Date;
  product_id: number;
  quantity: number;
}

/** 'GetInventoryQuota' query type */
export interface IGetInventoryQuotaQuery {
  params: IGetInventoryQuotaParams;
  result: IGetInventoryQuotaResult;
}

const getInventoryQuotaIR: any = {"usedParamSet":{"productId":true},"params":[{"name":"productId","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":98}]}],"statement":"SELECT product_id, quantity, last_updated FROM local_inventory_quota WHERE product_id = :productId!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT product_id, quantity, last_updated FROM local_inventory_quota WHERE product_id = :productId!
 * ```
 */
export const getInventoryQuota = new PreparedQuery<IGetInventoryQuotaParams,IGetInventoryQuotaResult>(getInventoryQuotaIR);


/** 'UpsertInventoryQuota' parameters type */
export interface IUpsertInventoryQuotaParams {
  productId: number;
  quantity: number;
}

/** 'UpsertInventoryQuota' return type */
export interface IUpsertInventoryQuotaResult {
  last_updated: Date;
  product_id: number;
  quantity: number;
}

/** 'UpsertInventoryQuota' query type */
export interface IUpsertInventoryQuotaQuery {
  params: IUpsertInventoryQuotaParams;
  result: IUpsertInventoryQuotaResult;
}

const upsertInventoryQuotaIR: any = {"usedParamSet":{"productId":true,"quantity":true},"params":[{"name":"productId","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":75}]},{"name":"quantity","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":87}]}],"statement":"INSERT INTO local_inventory_quota (product_id, quantity)\nVALUES (:productId!, :quantity!)\nON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated = CURRENT_TIMESTAMP\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO local_inventory_quota (product_id, quantity)
 * VALUES (:productId!, :quantity!)
 * ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated = CURRENT_TIMESTAMP
 * RETURNING *
 * ```
 */
export const upsertInventoryQuota = new PreparedQuery<IUpsertInventoryQuotaParams,IUpsertInventoryQuotaResult>(upsertInventoryQuotaIR);


/** 'ConsumeInventoryQuota' parameters type */
export interface IConsumeInventoryQuotaParams {
  amount: number;
  productId: number;
}

/** 'ConsumeInventoryQuota' return type */
export interface IConsumeInventoryQuotaResult {
  last_updated: Date;
  product_id: number;
  quantity: number;
}

/** 'ConsumeInventoryQuota' query type */
export interface IConsumeInventoryQuotaQuery {
  params: IConsumeInventoryQuotaParams;
  result: IConsumeInventoryQuotaResult;
}

const consumeInventoryQuotaIR: any = {"usedParamSet":{"amount":true,"productId":true},"params":[{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":62},{"a":149,"b":156}]},{"name":"productId","required":true,"transform":{"type":"scalar"},"locs":[{"a":121,"b":131}]}],"statement":"UPDATE local_inventory_quota\nSET quantity = quantity - :amount!,\n    last_updated = CURRENT_TIMESTAMP\nWHERE product_id = :productId! AND quantity >= :amount!\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE local_inventory_quota
 * SET quantity = quantity - :amount!,
 *     last_updated = CURRENT_TIMESTAMP
 * WHERE product_id = :productId! AND quantity >= :amount!
 * RETURNING *
 * ```
 */
export const consumeInventoryQuota = new PreparedQuery<IConsumeInventoryQuotaParams,IConsumeInventoryQuotaResult>(consumeInventoryQuotaIR);


/** 'GetInventoryQuotaForProducts' parameters type */
export interface IGetInventoryQuotaForProductsParams {
  productIds: numberArray;
}

/** 'GetInventoryQuotaForProducts' return type */
export interface IGetInventoryQuotaForProductsResult {
  product_id: number;
  quantity: number;
}

/** 'GetInventoryQuotaForProducts' query type */
export interface IGetInventoryQuotaForProductsQuery {
  params: IGetInventoryQuotaForProductsParams;
  result: IGetInventoryQuotaForProductsResult;
}

const getInventoryQuotaForProductsIR: any = {"usedParamSet":{"productIds":true},"params":[{"name":"productIds","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":89}]}],"statement":"SELECT product_id, quantity FROM local_inventory_quota WHERE product_id = ANY(:productIds!)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT product_id, quantity FROM local_inventory_quota WHERE product_id = ANY(:productIds!)
 * ```
 */
export const getInventoryQuotaForProducts = new PreparedQuery<IGetInventoryQuotaForProductsParams,IGetInventoryQuotaForProductsResult>(getInventoryQuotaForProductsIR);


