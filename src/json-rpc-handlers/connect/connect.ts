import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';
import { GetStorage, type KVStore } from './storage.js';
import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';
import type { JsonRpcId, JsonRpcRequest } from '../../lib/json-rpc.js';

import { v4 as uuidv4 } from 'uuid';

let store: KVStore;

export async function initializeConnect(storeURL: string): Promise<void> {
  store = GetStorage(storeURL);
  await store.connect();
}

export async function shutdownConnect(): Promise<void> {
  await store.shutdown();
}

export const handleConnectCreateRequest: JsonRpcHandler = async (
  req: JsonRpcRequest,
): Promise<HandlerResponse> => {
  const { message, uuid } = req.params;

  try {
    await store.set('request-' + uuid, message);
  } catch (e) {
    return error(req.id, JsonRpcErrorCodes.Forbidden, e);
  }

  return success(req.id, true);
};

export const handleConnectGetRequest: JsonRpcHandler = async (
  req: JsonRpcRequest,
): Promise<HandlerResponse> => {
  const { uuid } = req.params;

  const message = await store.get('request-' + uuid);
  if (message == null) {
    return error(req.id, JsonRpcErrorCodes.NotFound, '');
  }

  return success(req.id, message);
};

export const handleConnectCreateGrant: JsonRpcHandler = async (
  req: JsonRpcRequest,
): Promise<HandlerResponse> => {
  const { message, id } = req.params;

  await store.set('grant-' + id, message);

  return success(req.id, true);
};

export const handleConnectGetGrant: JsonRpcHandler = async (
  req: JsonRpcRequest,
): Promise<HandlerResponse> => {
  const { id } = req.params;

  const message = await store.get('grant-' + id);
  if (message == null) {
    return error(req.id, JsonRpcErrorCodes.NotFound, '');
  }

  return success(req.id, message);
};

function success(requestID: JsonRpcId | null, message: any): HandlerResponse {
  return {
    jsonRpcResponse: createJsonRpcSuccessResponse(
      requestID || uuidv4(),
      message,
    ),
  };
}

function error(
  requestID: JsonRpcId | null,
  code: JsonRpcErrorCodes,
  message: string,
): HandlerResponse {
  return {
    jsonRpcResponse: createJsonRpcErrorResponse(
      requestID || uuidv4(),
      code,
      message,
    ),
  };
}
