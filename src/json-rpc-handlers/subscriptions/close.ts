import { v4 as uuidv4 } from 'uuid';

import { DwnServerErrorCode } from '../../dwn-error.js';
import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';

import type { JsonRpcId, JsonRpcResponse } from '../../lib/json-rpc.js';
import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';

/**
 * Closes a subscription for a given `id` for a given `SocketConnection`
 *
 * @param dwnRequest must include the `id` of the subscription to close within the `params`.
 * @param context must include the associated `SocketConnection`.
 *
 */
export const handleSubscriptionsClose: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const requestId = dwnRequest.id ?? uuidv4();
  const { socketConnection } = context;
  const { id } = dwnRequest.params as { id: JsonRpcId};

  let jsonRpcResponse:JsonRpcResponse;
  try {
    await socketConnection.closeSubscription(id);
    jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply: { status: 200, detail: 'Accepted' } });
  } catch(error) {
    if (error.code === DwnServerErrorCode.ConnectionSubscriptionJsonRPCIdNotFound) {
      jsonRpcResponse = createJsonRpcErrorResponse(requestId, JsonRpcErrorCodes.InvalidParams, `subscription ${id} does not exist.`);
    } else {
      jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InternalError,
        `unknown subscription close error for ${id}: ${error.message}`
      );
    }
  }

  return { jsonRpcResponse } as HandlerResponse;
}