/** Types generated for queries found in "src/queries/cart.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'CreateCart' parameters type */
export interface ICreateCartParams {
  orderId: string;
  sessionId: string;
}

/** 'CreateCart' return type */
export interface ICreateCartResult {
  created_at: Date;
  id: string;
  session_id: string;
}

/** 'CreateCart' query type */
export interface ICreateCartQuery {
  params: ICreateCartParams;
  result: ICreateCartResult;
}

const createCartIR: any = {"usedParamSet":{"orderId":true,"sessionId":true},"params":[{"name":"orderId","required":true,"transform":{"type":"scalar"},"locs":[{"a":49,"b":57}]},{"name":"sessionId","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":70}]}],"statement":"INSERT INTO local_carts (id, session_id) VALUES (:orderId!, :sessionId!) RETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO local_carts (id, session_id) VALUES (:orderId!, :sessionId!) RETURNING *
 * ```
 */
export const createCart = new PreparedQuery<ICreateCartParams,ICreateCartResult>(createCartIR);


/** 'GetCartItems' parameters type */
export interface IGetCartItemsParams {
  cartId: string;
}

/** 'GetCartItems' return type */
export interface IGetCartItemsResult {
  cart_id: string;
  id: number;
  price: string;
  product_id: number;
  product_name: string;
  quantity: number;
}

/** 'GetCartItems' query type */
export interface IGetCartItemsQuery {
  params: IGetCartItemsParams;
  result: IGetCartItemsResult;
}

const getCartItemsIR: any = {"usedParamSet":{"cartId":true},"params":[{"name":"cartId","required":true,"transform":{"type":"scalar"},"locs":[{"a":182,"b":189}]}],"statement":"SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity,\n       p.name AS product_name, p.price\nFROM local_cart_items ci\nJOIN core_products p ON ci.product_id = p.id\nWHERE ci.cart_id = :cartId!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity,
 *        p.name AS product_name, p.price
 * FROM local_cart_items ci
 * JOIN core_products p ON ci.product_id = p.id
 * WHERE ci.cart_id = :cartId!
 * ```
 */
export const getCartItems = new PreparedQuery<IGetCartItemsParams,IGetCartItemsResult>(getCartItemsIR);


/** 'AddCartItem' parameters type */
export interface IAddCartItemParams {
  cartId: string;
  productId: number;
  quantity: number;
}

/** 'AddCartItem' return type */
export interface IAddCartItemResult {
  cart_id: string;
  id: number;
  product_id: number;
  quantity: number;
}

/** 'AddCartItem' query type */
export interface IAddCartItemQuery {
  params: IAddCartItemParams;
  result: IAddCartItemResult;
}

const addCartItemIR: any = {"usedParamSet":{"cartId":true,"productId":true,"quantity":true},"params":[{"name":"cartId","required":true,"transform":{"type":"scalar"},"locs":[{"a":69,"b":76}]},{"name":"productId","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":89}]},{"name":"quantity","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":101}]}],"statement":"INSERT INTO local_cart_items (cart_id, product_id, quantity)\nVALUES (:cartId!, :productId!, :quantity!)\nON CONFLICT (cart_id, product_id)\nDO UPDATE SET quantity = local_cart_items.quantity + EXCLUDED.quantity\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO local_cart_items (cart_id, product_id, quantity)
 * VALUES (:cartId!, :productId!, :quantity!)
 * ON CONFLICT (cart_id, product_id)
 * DO UPDATE SET quantity = local_cart_items.quantity + EXCLUDED.quantity
 * RETURNING *
 * ```
 */
export const addCartItem = new PreparedQuery<IAddCartItemParams,IAddCartItemResult>(addCartItemIR);


/** 'DeleteCartItem' parameters type */
export interface IDeleteCartItemParams {
  cartId: string;
  itemId: number;
}

/** 'DeleteCartItem' return type */
export type IDeleteCartItemResult = void;

/** 'DeleteCartItem' query type */
export interface IDeleteCartItemQuery {
  params: IDeleteCartItemParams;
  result: IDeleteCartItemResult;
}

const deleteCartItemIR: any = {"usedParamSet":{"itemId":true,"cartId":true},"params":[{"name":"itemId","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":47}]},{"name":"cartId","required":true,"transform":{"type":"scalar"},"locs":[{"a":63,"b":70}]}],"statement":"DELETE FROM local_cart_items WHERE id = :itemId! AND cart_id = :cartId!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM local_cart_items WHERE id = :itemId! AND cart_id = :cartId!
 * ```
 */
export const deleteCartItem = new PreparedQuery<IDeleteCartItemParams,IDeleteCartItemResult>(deleteCartItemIR);


/** 'DeleteCartItemsByCartId' parameters type */
export interface IDeleteCartItemsByCartIdParams {
  cartId: string;
}

/** 'DeleteCartItemsByCartId' return type */
export type IDeleteCartItemsByCartIdResult = void;

/** 'DeleteCartItemsByCartId' query type */
export interface IDeleteCartItemsByCartIdQuery {
  params: IDeleteCartItemsByCartIdParams;
  result: IDeleteCartItemsByCartIdResult;
}

const deleteCartItemsByCartIdIR: any = {"usedParamSet":{"cartId":true},"params":[{"name":"cartId","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":52}]}],"statement":"DELETE FROM local_cart_items WHERE cart_id = :cartId!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM local_cart_items WHERE cart_id = :cartId!
 * ```
 */
export const deleteCartItemsByCartId = new PreparedQuery<IDeleteCartItemsByCartIdParams,IDeleteCartItemsByCartIdResult>(deleteCartItemsByCartIdIR);


