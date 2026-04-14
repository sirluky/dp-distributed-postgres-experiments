/** Types generated for queries found in "src/queries/products.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetProducts' parameters type */
export type IGetProductsParams = void;

/** 'GetProducts' return type */
export interface IGetProductsResult {
  id: number;
  is_scarcity_mode: boolean;
  merchant_id: number;
  merchant_name: string;
  name: string;
  price: string;
}

/** 'GetProducts' query type */
export interface IGetProductsQuery {
  params: IGetProductsParams;
  result: IGetProductsResult;
}

const getProductsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT p.id, p.name, p.price, p.is_scarcity_mode,\n       m.name AS merchant_name, m.id AS merchant_id\nFROM core_products p\nJOIN core_merchants m ON p.merchant_id = m.id\nORDER BY p.id\nLIMIT 200"};

/**
 * Query generated from SQL:
 * ```
 * SELECT p.id, p.name, p.price, p.is_scarcity_mode,
 *        m.name AS merchant_name, m.id AS merchant_id
 * FROM core_products p
 * JOIN core_merchants m ON p.merchant_id = m.id
 * ORDER BY p.name
 * ```
 */
export const getProducts = new PreparedQuery<IGetProductsParams,IGetProductsResult>(getProductsIR);


/** 'GetProductById' parameters type */
export interface IGetProductByIdParams {
  id: number;
}

/** 'GetProductById' return type */
export interface IGetProductByIdResult {
  id: number;
  is_scarcity_mode: boolean;
  merchant_id: number;
  merchant_name: string;
  name: string;
  price: string;
}

/** 'GetProductById' query type */
export interface IGetProductByIdQuery {
  params: IGetProductByIdParams;
  result: IGetProductByIdResult;
}

const getProductByIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":176,"b":179}]}],"statement":"SELECT p.id, p.name, p.price, p.is_scarcity_mode, p.merchant_id,\n       m.name AS merchant_name\nFROM core_products p\nJOIN core_merchants m ON p.merchant_id = m.id\nWHERE p.id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT p.id, p.name, p.price, p.is_scarcity_mode, p.merchant_id,
 *        m.name AS merchant_name
 * FROM core_products p
 * JOIN core_merchants m ON p.merchant_id = m.id
 * WHERE p.id = :id!
 * ```
 */
export const getProductById = new PreparedQuery<IGetProductByIdParams,IGetProductByIdResult>(getProductByIdIR);


