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
 * Closes a subscription tied to a specific `SocketConnection`.
 *
 * @param dwnRequest must include JsonRpcId of the subscription request within the `params`.
 * @param context must include the associated `SocketConnection`.
 *
 */
export const handleSubscriptionsClose: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const requestId = dwnRequest.id ?? uuidv4();
  if (context.socketConnection === undefined) {
    const jsonRpcResponse = createJsonRpcErrorResponse(requestId, JsonRpcErrorCodes.InvalidRequest, 'socket connection does not exist');
    return { jsonRpcResponse };
  }

  if (dwnRequest.subscribe === undefined) {
    const jsonRpcResponse = createJsonRpcErrorResponse(requestId, JsonRpcErrorCodes.InvalidRequest, 'subscribe options do not exist');
    return { jsonRpcResponse };
  }

  const { socketConnection } = context;
  const { id } = dwnRequest.subscribe as { id: JsonRpcId };

  let jsonRpcResponse:JsonRpcResponse;
  try {
    // closing the subscription and cleaning up the reference within the given connection.
    await socketConnection.closeSubscription(id);
    jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply: { status: 200, detail: 'Accepted' } });
  } catch(error) {
    if (error.code === DwnServerErrorCode.ConnectionSubscriptionJsonRpcIdNotFound) {
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