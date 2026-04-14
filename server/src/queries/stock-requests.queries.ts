/** Types generated for queries found in "src/queries/stock-requests.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type edge_stock_request_status = 'APPROVED' | 'PENDING' | 'REJECTED_SCARCITY';

/** 'CreateStockRequest' parameters type */
export interface ICreateStockRequestParams {
  orderId?: string | null | void;
  productId: number;
  replicationIdentity: string;
  requestedQty: number;
  status: edge_stock_request_status;
}

/** 'CreateStockRequest' return type */
export interface ICreateStockRequestResult {
  created_at: Date;
  id: string;
  order_id: string | null;
  product_id: number;
  replication_identity: string;
  requested_qty: number;
  status: edge_stock_request_status;
}

/** 'CreateStockRequest' query type */
export interface ICreateStockRequestQuery {
  params: ICreateStockRequestParams;
  result: ICreateStockRequestResult;
}

const createStockRequestIR: any = { "usedParamSet": { "orderId": true, "replicationIdentity": true, "productId": true, "requestedQty": true, "status": true }, "params": [{ "name": "orderId", "required": false, "transform": { "type": "scalar" }, "locs": [{ "a": 108, "b": 115 }] }, { "name": "replicationIdentity", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 118, "b": 138 }] }, { "name": "productId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 141, "b": 151 }] }, { "name": "requestedQty", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 154, "b": 167 }] }, { "name": "status", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 170, "b": 177 }] }], "statement": "INSERT INTO edge_stock_requests (order_id, replication_identity, product_id, requested_qty, status)\nVALUES (:orderId, :replicationIdentity!, :productId!, :requestedQty!, :status!)\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO edge_stock_requests (order_id, replication_identity, product_id, requested_qty, status)
 * VALUES (:orderId, :replicationIdentity!, :productId!, :requestedQty!, :status!)
 * RETURNING *
 * ```
 */
export const createStockRequest = new PreparedQuery<ICreateStockRequestParams, ICreateStockRequestResult>(createStockRequestIR);


/** 'GetStockRequest' parameters type */
export interface IGetStockRequestParams {
  id: string;
}

/** 'GetStockRequest' return type */
export interface IGetStockRequestResult {
  created_at: Date;
  id: string;
  order_id: string | null;
  product_id: number;
  replication_identity: string;
  requested_qty: number;
  status: edge_stock_request_status;
}

/** 'GetStockRequest' query type */
export interface IGetStockRequestQuery {
  params: IGetStockRequestParams;
  result: IGetStockRequestResult;
}

const getStockRequestIR: any = { "usedParamSet": { "id": true }, "params": [{ "name": "id", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 45, "b": 48 }] }], "statement": "SELECT * FROM edge_stock_requests WHERE id = :id!" };

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM edge_stock_requests WHERE id = :id!
 * ```
 */
export const getStockRequest = new PreparedQuery<IGetStockRequestParams, IGetStockRequestResult>(getStockRequestIR);


/** 'GetStockRequestByProduct' parameters type */
export interface IGetStockRequestByProductParams {
  productId: number;
}

/** 'GetStockRequestByProduct' return type */
export interface IGetStockRequestByProductResult {
  created_at: Date;
  id: string;
  order_id: string | null;
  product_id: number;
  replication_identity: string;
  requested_qty: number;
  status: edge_stock_request_status;
}

/** 'GetStockRequestByProduct' query type */
export interface IGetStockRequestByProductQuery {
  params: IGetStockRequestByProductParams;
  result: IGetStockRequestByProductResult;
}

const getStockRequestByProductIR: any = { "usedParamSet": { "productId": true }, "params": [{ "name": "productId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 53, "b": 63 }] }], "statement": "SELECT * FROM edge_stock_requests WHERE product_id = :productId! AND status = 'PENDING'\nORDER BY created_at DESC\nLIMIT 1" };

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM edge_stock_requests WHERE product_id = :productId! AND status = 'PENDING'
 * ORDER BY created_at DESC
 * LIMIT 1
 * ```
 */
export const getStockRequestByProduct = new PreparedQuery<IGetStockRequestByProductParams, IGetStockRequestByProductResult>(getStockRequestByProductIR);


/** 'UpdateStockRequestStatus' parameters type */
export interface IUpdateStockRequestStatusParams {
  id: string;
  status: edge_stock_request_status;
}

/** 'UpdateStockRequestStatus' return type */
export interface IUpdateStockRequestStatusResult {
  created_at: Date;
  id: string;
  order_id: string | null;
  product_id: number;
  replication_identity: string;
  requested_qty: number;
  status: edge_stock_request_status;
}

/** 'UpdateStockRequestStatus' query type */
export interface IUpdateStockRequestStatusQuery {
  params: IUpdateStockRequestStatusParams;
  result: IUpdateStockRequestStatusResult;
}

const updateStockRequestStatusIR: any = { "usedParamSet": { "status": true, "id": true }, "params": [{ "name": "status", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 40, "b": 47 }] }, { "name": "id", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 60, "b": 63 }] }], "statement": "UPDATE edge_stock_requests\nSET status = :status!\nWHERE id = :id! AND status = 'PENDING'\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * UPDATE edge_stock_requests
 * SET status = :status!
 * WHERE id = :id! AND status = 'PENDING'
 * RETURNING *
 * ```
 */
export const updateStockRequestStatus = new PreparedQuery<IUpdateStockRequestStatusParams, IUpdateStockRequestStatusResult>(updateStockRequestStatusIR);


/** 'CreateStockGrant' parameters type */
export interface ICreateStockGrantParams {
  grantedQty: number;
  productId: number;
  replicationIdentity: string;
  requestId: string;
  status: edge_stock_request_status;
}

/** 'CreateStockGrant' return type */
export interface ICreateStockGrantResult {
  created_at: Date;
  granted_qty: number;
  id: string;
  product_id: number;
  replication_identity: string;
  request_id: string | null;
  status: edge_stock_request_status;
}

/** 'CreateStockGrant' query type */
export interface ICreateStockGrantQuery {
  params: ICreateStockGrantParams;
  result: ICreateStockGrantResult;
}

const createStockGrantIR: any = { "usedParamSet": { "requestId": true, "replicationIdentity": true, "productId": true, "grantedQty": true, "status": true }, "params": [{ "name": "requestId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 106, "b": 116 }] }, { "name": "replicationIdentity", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 119, "b": 139 }] }, { "name": "productId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 142, "b": 152 }] }, { "name": "grantedQty", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 155, "b": 166 }] }, { "name": "status", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 169, "b": 176 }] }], "statement": "INSERT INTO core_stock_grants (request_id, replication_identity, product_id, granted_qty, status)\nVALUES (:requestId!, :replicationIdentity!, :productId!, :grantedQty!, :status!)\nON CONFLICT (request_id) DO UPDATE\nSET replication_identity = EXCLUDED.replication_identity,\n    product_id = EXCLUDED.product_id,\n    granted_qty = EXCLUDED.granted_qty,\n    status = EXCLUDED.status\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO core_stock_grants (request_id, replication_identity, product_id, granted_qty, status)
 * VALUES (:requestId!, :replicationIdentity!, :productId!, :grantedQty!, :status!)
 * ON CONFLICT (request_id) DO UPDATE
 * SET replication_identity = EXCLUDED.replication_identity,
 *     product_id = EXCLUDED.product_id,
 *     granted_qty = EXCLUDED.granted_qty,
 *     status = EXCLUDED.status
 * RETURNING *
 * ```
 */
export const createStockGrant = new PreparedQuery<ICreateStockGrantParams, ICreateStockGrantResult>(createStockGrantIR);


/** 'GetStockGrantByRequestId' parameters type */
export interface IGetStockGrantByRequestIdParams {
  requestId: string;
}

/** 'GetStockGrantByRequestId' return type */
export interface IGetStockGrantByRequestIdResult {
  created_at: Date;
  granted_qty: number;
  id: string;
  product_id: number;
  replication_identity: string;
  request_id: string | null;
  status: edge_stock_request_status;
}

/** 'GetStockGrantByRequestId' query type */
export interface IGetStockGrantByRequestIdQuery {
  params: IGetStockGrantByRequestIdParams;
  result: IGetStockGrantByRequestIdResult;
}

const getStockGrantByRequestIdIR: any = { "usedParamSet": { "requestId": true }, "params": [{ "name": "requestId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 51, "b": 61 }] }], "statement": "SELECT * FROM core_stock_grants WHERE request_id = :requestId!" };

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM core_stock_grants WHERE request_id = :requestId!
 * ```
 */
export const getStockGrantByRequestId = new PreparedQuery<IGetStockGrantByRequestIdParams, IGetStockGrantByRequestIdResult>(getStockGrantByRequestIdIR);


/** 'GetInventoryLedger' parameters type */
export interface IGetInventoryLedgerParams {
  productId: number;
}

/** 'GetInventoryLedger' return type */
export interface IGetInventoryLedgerResult {
  leased_to_edges: number;
  product_id: number;
  total_physical_stock: number;
}

/** 'GetInventoryLedger' query type */
export interface IGetInventoryLedgerQuery {
  params: IGetInventoryLedgerParams;
  result: IGetInventoryLedgerResult;
}

const getInventoryLedgerIR: any = { "usedParamSet": { "productId": true }, "params": [{ "name": "productId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 103, "b": 113 }] }], "statement": "SELECT product_id, total_physical_stock, leased_to_edges FROM core_inventory_ledger WHERE product_id = :productId!" };

/**
 * Query generated from SQL:
 * ```
 * SELECT product_id, total_physical_stock, leased_to_edges FROM core_inventory_ledger WHERE product_id = :productId!
 * ```
 */
export const getInventoryLedger = new PreparedQuery<IGetInventoryLedgerParams, IGetInventoryLedgerResult>(getInventoryLedgerIR);


/** 'UpdateInventoryLeased' parameters type */
export interface IUpdateInventoryLeasedParams {
  addedQty: number;
  productId: number;
}

/** 'UpdateInventoryLeased' return type */
export interface IUpdateInventoryLeasedResult {
  leased_to_edges: number;
  product_id: number;
  total_physical_stock: number;
}

/** 'UpdateInventoryLeased' query type */
export interface IUpdateInventoryLeasedQuery {
  params: IUpdateInventoryLeasedParams;
  result: IUpdateInventoryLeasedResult;
}

const updateInventoryLeasedIR: any = { "usedParamSet": { "addedQty": true, "productId": true }, "params": [{ "name": "addedQty", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 69, "b": 78 }, { "a": 133, "b": 142 }] }, { "name": "productId", "required": true, "transform": { "type": "scalar" }, "locs": [{ "a": 99, "b": 109 }] }], "statement": "UPDATE core_inventory_ledger\nSET leased_to_edges = leased_to_edges + :addedQty!\nWHERE product_id = :productId! AND leased_to_edges + :addedQty! <= total_physical_stock\nRETURNING *" };

/**
 * Query generated from SQL:
 * ```
 * UPDATE core_inventory_ledger
 * SET leased_to_edges = leased_to_edges + :addedQty!
 * WHERE product_id = :productId! AND leased_to_edges + :addedQty! <= total_physical_stock
 * RETURNING *
 * ```
 */
export const updateInventoryLeased = new PreparedQuery<IUpdateInventoryLeasedParams, IUpdateInventoryLeasedResult>(updateInventoryLeasedIR);


