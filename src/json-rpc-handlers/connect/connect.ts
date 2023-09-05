import type { JsonRpcRequest } from '../../lib/json-rpc.js';
import type { HandlerResponse, JsonRpcHandler } from '../../lib/json-rpc-router.js';
import { type KVStore, LocalDiskStore } from './storage.js';

import { createJsonRpcSuccessResponse } from '../../lib/json-rpc.js';
import { v4 as uuidv4 } from 'uuid';

const store: KVStore = new LocalDiskStore('./data/connect');

export const handleConnectCreateRequest: JsonRpcHandler = async (req: JsonRpcRequest): Promise<HandlerResponse> => {
  const { message, id } = req.params;
  await store.set('request-' + id, message);

  const resp: HandlerResponse = {
    jsonRpcResponse: createJsonRpcSuccessResponse(req.id || uuidv4(), true),
  };

  return resp;
};

export const handleConnectGetRequest: JsonRpcHandler = async (req: JsonRpcRequest): Promise<HandlerResponse> => {
  const { id } = req.params;
  const message = await store.get('request-' + id);

  const resp: HandlerResponse = {
    jsonRpcResponse: createJsonRpcSuccessResponse(req.id || uuidv4(), message),
  };

  return resp;
};

export const handleConnectCreateGrant: JsonRpcHandler = async (req: JsonRpcRequest): Promise<HandlerResponse> => {
  const { message, id } = req.params;
  await store.set('grant-' + id, message);

  const resp: HandlerResponse = {
    jsonRpcResponse: createJsonRpcSuccessResponse(req.id || uuidv4(), true),
  };

  return resp;
};

export const handleConnectGetGrant: JsonRpcHandler = async (req: JsonRpcRequest): Promise<HandlerResponse> => {
  const { id } = req.params;
  const message = await store.get('grant-' + id);

  const resp: HandlerResponse = {
    jsonRpcResponse: createJsonRpcSuccessResponse(req.id || uuidv4(), message),
  };

  return resp;
};