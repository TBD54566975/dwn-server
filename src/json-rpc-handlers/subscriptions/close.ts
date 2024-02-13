import { v4 as uuidv4 } from 'uuid';

import { DwnServerErrorCode } from '../../dwn-error.js';
import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';

import type { JsonRpcResponse } from '../../lib/json-rpc.js';
import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';

/**
 * Closes a subscription for a given `target` and `subscriptionId` within a given connection's `SubscriptionManager`.
 * @param dwnRequest must include the `target` and `subscriptionId` within the `params`.
 * @param context must include the `subscriptionManager` for the associated connection.
 *
 */
export const handleSubscriptionsClose: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const requestId = dwnRequest.id ?? uuidv4();
  const { subscriptionManager } = context;
  const { target, subscriptionId } = dwnRequest.params as { target: string, subscriptionId: string };

  let jsonRpcResponse:JsonRpcResponse;
  try {
    await subscriptionManager.close(target, subscriptionId);
    jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply: { status: 200, detail: 'Accepted' } });
  } catch(error) {
    if (error.code === DwnServerErrorCode.SubscriptionManagerSubscriptionNotFound) {
      jsonRpcResponse = createJsonRpcErrorResponse(requestId, JsonRpcErrorCodes.InvalidParams, `subscription ${subscriptionId} does not exist.`);
    } else {
      jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InternalError,
        `unknown subscription close error for ${subscriptionId}: ${error.message}`
      );
    }
  }

  return { jsonRpcResponse } as HandlerResponse;
}