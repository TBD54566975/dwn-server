import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';

import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';

export const handleSubscriptionsClose: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const requestId = dwnRequest.id ?? crypto.randomUUID();
  const { subscriptionManager } = context;
  const { target, subscriptionId } = dwnRequest.params as { target: string, subscriptionId: string };

  let jsonRpcResponse;
  try {
    await subscriptionManager.close(target, subscriptionId);
    jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply: { status: 200, detail: 'Accepted' } });
  } catch(error) {
    jsonRpcResponse = createJsonRpcErrorResponse(requestId, JsonRpcErrorCodes.InvalidParams, `subscription ${subscriptionId} does not exist.`);
  }

  return { jsonRpcResponse } as HandlerResponse;
}