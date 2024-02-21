import type { GenericMessage } from '@tbd54566975/dwn-sdk-js';
import { DwnInterfaceName, DwnMethodName } from '@tbd54566975/dwn-sdk-js';

import type { Readable as IsomorphicReadable } from 'readable-stream';
import log from 'loglevel';
import { v4 as uuidv4 } from 'uuid';

import type { JsonRpcSubscription } from '../../lib/json-rpc.js';
import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';

import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';


export const handleDwnProcessMessage: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const { dwn, dataStream, subscriptionRequest, socketConnection, transport } = context;
  const { target, message } = dwnRequest.params as { target: string, message: GenericMessage };
  const requestId = dwnRequest.id ?? uuidv4();

  try {
    // RecordsWrite is only supported on 'http' to support data stream for large data
    // TODO: https://github.com/TBD54566975/dwn-server/issues/108
    if (
      transport !== 'http' &&
      message.descriptor.interface === DwnInterfaceName.Records &&
      message.descriptor.method === DwnMethodName.Write
    ) {
      const jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InvalidParams,
        `RecordsWrite is not supported via ${context.transport}`
      )
      return { jsonRpcResponse };
    }

    // subscribe methods must come with a subscriptionRequest context 
    if (message.descriptor.method === DwnMethodName.Subscribe && subscriptionRequest === undefined) {
      const jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InvalidRequest,
        `subscribe methods must contain a subscriptionRequest context`
      );
      return { jsonRpcResponse };
    }

    // Subscribe methods are only supported on 'ws' (WebSockets)
    if (transport !== 'ws' && subscriptionRequest !== undefined) {
      const jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InvalidParams,
        `subscriptions are not supported via ${context.transport}`
      )
      return { jsonRpcResponse };
    }

    if (subscriptionRequest !== undefined && socketConnection?.hasSubscription(subscriptionRequest.id)) {
      const jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InvalidParams,
        `the subscribe id: ${subscriptionRequest.id} is in use by an active subscription`
      )
      return { jsonRpcResponse };
    }

    const reply = await dwn.processMessage(target, message, {
      dataStream: dataStream as IsomorphicReadable,
      subscriptionHandler: subscriptionRequest?.subscriptionHandler,
    });

    const { record } = reply;
    // RecordsRead messages return record data as a stream to for accommodate large amounts of data
    let recordDataStream: IsomorphicReadable;
    if (record !== undefined && record.data !== undefined) {
      recordDataStream = reply.record.data;
      delete reply.record.data; // not serializable via JSON
    }

    // Subscribe messages return a close function to facilitate closing the subscription
    if (subscriptionRequest && reply.subscription) {
      const { close } = reply.subscription;
      // we add a reference to the close function for this subscription request to the socket connection.
      // this will facilitate closing the subscription later.
      const subscriptionReply: JsonRpcSubscription = {
        id: subscriptionRequest.id,
        close,
      }
      await socketConnection.addSubscription(subscriptionReply);
      delete reply.subscription.close // delete the close method from the reply as it's not JSON serializable and has a held reference.
    }

    const jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply });
    const responsePayload: HandlerResponse = { jsonRpcResponse };
    if (recordDataStream) {
      responsePayload.dataStream = recordDataStream;
    }

    return responsePayload;
  } catch (e) {
    const jsonRpcResponse = createJsonRpcErrorResponse(
      requestId,
      JsonRpcErrorCodes.InternalError,
      e.message,
    );

    // log the error response
    log.error('handleDwnProcessMessage error', jsonRpcResponse);
    return { jsonRpcResponse } as HandlerResponse;
  }
};
