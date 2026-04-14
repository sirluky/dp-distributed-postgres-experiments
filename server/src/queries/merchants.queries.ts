/** Types generated for queries found in "src/queries/merchants.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type NumberOrString = number | string;

/** 'GetMerchants' parameters type */
export type IGetMerchantsParams = void;

/** 'GetMerchants' return type */
export interface IGetMerchantsResult {
  commission_rate: string | null;
  id: number;
  name: string;
}

/** 'GetMerchants' query type */
export interface IGetMerchantsQuery {
  params: IGetMerchantsParams;
  result: IGetMerchantsResult;
}

const getMerchantsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM core_merchants ORDER BY name"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM core_merchants ORDER BY name
 * ```
 */
export const getMerchants = new PreparedQuery<IGetMerchantsParams,IGetMerchantsResult>(getMerchantsIR);


/** 'CreateMerchant' parameters type */
export interface ICreateMerchantParams {
  commissionRate: NumberOrString;
  name: string;
}

/** 'CreateMerchant' return type */
export interface ICreateMerchantResult {
  commission_rate: string | null;
  id: number;
  name: string;
}

/** 'CreateMerchant' query type */
export interface ICreateMerchantQuery {
  params: ICreateMerchantParams;
  result: ICreateMerchantResult;
}

const createMerchantIR: any = {"usedParamSet":{"name":true,"commissionRate":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":59,"b":64}]},{"name":"commissionRate","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":82}]}],"statement":"INSERT INTO core_merchants (name, commission_rate)\nVALUES (:name!, :commissionRate!) RETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO core_merchants (name, commission_rate)
 * VALUES (:name!, :commissionRate!) RETURNING *
 * ```
 */
export const createMerchant = new PreparedQuery<ICreateMerchantParams,ICreateMerchantResult>(createMerchantIR);


/** 'CreateProduct' parameters type */
export interface ICreateProductParams {
  isScarcityMode: boolean;
  merchantId: number;
  name: string;
  price: NumberOrString;
}

/** 'CreateProduct' return type */
export interface ICreateProductResult {
  id: number;
  is_scarcity_mode: boolean;
  merchant_id: number;
  name: string;
  price: string;
}

/** 'CreateProduct' query type */
export interface ICreateProductQuery {
  params: ICreateProductParams;
  result: ICreateProductResult;
}

const createProductIR: any = {"usedParamSet":{"merchantId":true,"name":true,"price":true,"isScarcityMode":true},"params":[{"name":"merchantId","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":90}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":93,"b":98}]},{"name":"price","required":true,"transform":{"type":"scalar"},"locs":[{"a":101,"b":107}]},{"name":"isScarcityMode","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":125}]}],"statement":"INSERT INTO core_products (merchant_id, name, price, is_scarcity_mode)\nVALUES (:merchantId!, :name!, :price!, :isScarcityMode!) RETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO core_products (merchant_id, name, price, is_scarcity_mode)
 * VALUES (:merchantId!, :name!, :price!, :isScarcityMode!) RETURNING *
 * ```
 */
export const createProduct = new PreparedQuery<ICreateProductParams,ICreateProductResult>(createProductIR);


/** 'GetMerchantOrders' parameters type */
export interface IGetMerchantOrdersParams {
  merchantId: number;
}

/** 'GetMerchantOrders' return type */
export interface IGetMerchantOrdersResult {
  created_at: Date;
  id: string;
  items: Json | null;
  replication_identity: string;
  shipping_address: string | null;
  status: string;
  total_price: string;
  user_id: number;
}

/** 'GetMerchantOrders' query type */
export interface IGetMerchantOrdersQuery {
  params: IGetMerchantOrdersParams;
  result: IGetMerchantOrdersResult;
}

const getMerchantOrdersIR: any = {"usedParamSet":{"merchantId":true},"params":[{"name":"merchantId","required":true,"transform":{"type":"scalar"},"locs":[{"a":433,"b":444}]}],"statement":"SELECT o.id, o.user_id, o.replication_identity, o.total_price,\n       o.status, o.shipping_address, o.created_at,\n       json_agg(json_build_object(\n         'product_id', oi.product_id,\n         'product_name', p.name,\n         'quantity', oi.quantity,\n         'price', oi.price\n       )) AS items\nFROM edge_orders o\nJOIN edge_order_items oi ON o.id = oi.order_id\nJOIN core_products p ON oi.product_id = p.id\nWHERE p.merchant_id = :merchantId!\nGROUP BY o.id\nORDER BY o.created_at DESC\nLIMIT 50"};

/**
 * Query generated from SQL:
 * ```
 * SELECT o.id, o.user_id, o.replication_identity, o.total_price,
 *        o.status, o.shipping_address, o.created_at,
 *        json_agg(json_build_object(
 *          'product_id', oi.product_id,
 *          'product_name', p.name,
 *          'quantity', oi.quantity,
 *          'price', oi.price
 *        )) AS items
 * FROM edge_orders o
 * JOIN edge_order_items oi ON o.id = oi.order_id
 * JOIN core_products p ON oi.product_id = p.id
 * WHERE p.merchant_id = :merchantId!
 * GROUP BY o.id
 * ORDER BY o.created_at DESC
 * ```
 */
export const getMerchantOrders = new PreparedQuery<IGetMerchantOrdersParams,IGetMerchantOrdersResult>(getMerchantOrdersIR);


/** 'UpdateMerchantFee' parameters type */
export interface IUpdateMerchantFeeParams {
  commissionRate: NumberOrString;
  id: number;
}

/** 'UpdateMerchantFee' return type */
export interface IUpdateMerchantFeeResult {
  commission_rate: string | null;
  id: number;
  name: string;
}

/** 'UpdateMerchantFee' query type */
export interface IUpdateMerchantFeeQuery {
  params: IUpdateMerchantFeeParams;
  result: IUpdateMerchantFeeResult;
}

const updateMerchantFeeIR: any = {"usedParamSet":{"commissionRate":true,"id":true},"params":[{"name":"commissionRate","required":true,"transform":{"type":"scalar"},"locs":[{"a":44,"b":59}]},{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":75}]}],"statement":"UPDATE core_merchants SET commission_rate = :commissionRate!\nWHERE id = :id! RETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE core_merchants SET commission_rate = :commissionRate!
 * WHERE id = :id! RETURNING *
 * ```
 */
export const updateMerchantFee = new PreparedQuery<IUpdateMerchantFeeParams,IUpdateMerchantFeeResult>(updateMerchantFeeIR);


/** 'SetProductPhysicalStock' parameters type */
export interface ISetProductPhysicalStockParams {
  productId: number;
  totalPhysicalStock: number;
}

/** 'SetProductPhysicalStock' return type */
export interface ISetProductPhysicalStockResult {
  leased_to_edges: number;
  product_id: number;
  total_physical_stock: number;
}

/** 'SetProductPhysicalStock' query type */
export interface ISetProductPhysicalStockQuery {
  params: ISetProductPhysicalStockParams;
  result: ISetProductPhysicalStockResult;
}

const setProductPhysicalStockIR: any = {"usedParamSet":{"productId":true,"totalPhysicalStock":true},"params":[{"name":"productId","required":true,"transform":{"type":"scalar"},"locs":[{"a":94,"b":104}]},{"name":"totalPhysicalStock","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":126},{"a":194,"b":213},{"a":262,"b":281}]}],"statement":"INSERT INTO core_inventory_ledger (product_id, total_physical_stock, leased_to_edges)\nVALUES (:productId!, :totalPhysicalStock!, 0)\nON CONFLICT (product_id) DO UPDATE\nSET total_physical_stock = :totalPhysicalStock!\nWHERE core_inventory_ledger.leased_to_edges <= :totalPhysicalStock!\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO core_inventory_ledger (product_id, total_physical_stock, leased_to_edges)
 * VALUES (:productId!, :totalPhysicalStock!, 0)
 * ON CONFLICT (product_id) DO UPDATE
 * SET total_physical_stock = :totalPhysicalStock!
 * WHERE core_inventory_ledger.leased_to_edges <= :totalPhysicalStock!
 * RETURNING *
 * ```
 */
export const setProductPhysicalStock = new PreparedQuery<ISetProductPhysicalStockParams,ISetProductPhysicalStockResult>(setProductPhysicalStockIR);


/** 'DeleteMerchantsByName' parameters type */
export interface IDeleteMerchantsByNameParams {
  names: readonly (string | null | void)[];
}

/** 'DeleteMerchantsByName' return type */
export type IDeleteMerchantsByNameResult = void;

/** 'DeleteMerchantsByName' query type */
export interface IDeleteMerchantsByNameQuery {
  params: IDeleteMerchantsByNameParams;
  result: IDeleteMerchantsByNameResult;
}

const deleteMerchantsByNameIR: any = {"usedParamSet":{"names":true},"params":[{"name":"names","required":false,"transform":{"type":"array_spread"},"locs":[{"a":41,"b":46}]}],"statement":"DELETE FROM core_merchants WHERE name IN :names"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM core_merchants WHERE name IN :names
 * ```
 */
export const deleteMerchantsByName = new PreparedQuery<IDeleteMerchantsByNameParams,IDeleteMerchantsByNameResult>(deleteMerchantsByNameIR);


