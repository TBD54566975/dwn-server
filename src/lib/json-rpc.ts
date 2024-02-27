export type JsonRpcId = string | number | null;
export type JsonRpcVersion = '2.0';

export interface JsonRpcRequest {
  jsonrpc: JsonRpcVersion;
  id?: JsonRpcId;
  method: string;
  params?: any;
  /** JSON RPC Subscription Extension Parameters */
  subscription?: {
    id: JsonRpcId
  };
}

export interface JsonRpcError {
  code: JsonRpcErrorCodes;
  message: string;
  data?: any;
}

export interface JsonRpcSubscription {
  /** JSON RPC Id of the Subscription Request */
  id: JsonRpcId;
  close: () => Promise<void>;
}

export enum JsonRpcErrorCodes {
  // JSON-RPC 2.0 pre-defined errors
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ParseError = -32700,

  /** App defined error equivalent to HTTP Status 400 */
  BadRequest = -50400,
  /** App defined error equivalent to HTTP Status 401 */
  Unauthorized = -50401,
  /** App defined error equivalent to HTTP Status 403 */
  Forbidden = -50403,
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface JsonRpcSuccessResponse {
  jsonrpc: JsonRpcVersion;
  id: JsonRpcId;
  result: any;
  error?: never;
}

export interface JsonRpcErrorResponse {
  jsonrpc: JsonRpcVersion;
  id: JsonRpcId;
  result?: never;
  error: JsonRpcError;
}

export const createJsonRpcErrorResponse = (
  id: JsonRpcId,
  code: JsonRpcErrorCodes,
  message: string,
  data?: any,
): JsonRpcErrorResponse => {
  const error: JsonRpcError = { code, message };
  if (data != undefined) {
    error.data = data;
  }
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
};

export const createJsonRpcNotification = (
  method: string,
  params?: any,
): JsonRpcRequest => {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
};

export const createJsonRpcSubscriptionRequest = (
  id: JsonRpcId,
  method: string,
  params?: any,
  subscriptionId?: JsonRpcId
): JsonRpcRequest => {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
    subscription: {
      id: subscriptionId,
    }
  }
}

export const createJsonRpcRequest = (
  id: JsonRpcId,
  method: string,
  params?: any,
): JsonRpcRequest => {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
};

export const createJsonRpcSuccessResponse = (
  id: JsonRpcId,
  result?: any,
): JsonRpcSuccessResponse => {
  return {
    jsonrpc: '2.0',
    id,
    result: result ?? null,
  };
};
