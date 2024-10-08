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

    // if this is a subscription request, we first check if the connection has a subscription with this Id
    // we do this ahead of time to prevent opening a subscription on the dwn only to close it after attempting to add it to the subscription manager
    // otherwise the subscription manager would throw an error that the Id is already in use and we would close the open subscription on the DWN.
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


    const { entry } = reply;
    // RecordsRead or MessagesRead messages optionally return data as a stream to accommodate large amounts of data
    // we remove the data stream from the reply that will be serialized and return it as a separate property in the response payload.
    let recordDataStream: IsomorphicReadable;
    if (entry !== undefined && entry.data !== undefined) {
      recordDataStream = entry.data;
      delete reply.entry.data; // not serializable via JSON
    }

    if (subscriptionRequest && reply.subscription) {
      const { close } = reply.subscription;
      // Subscribe messages return a close function to facilitate closing the subscription
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
  } catch (error) {
    const jsonRpcResponse = createJsonRpcErrorResponse(
      requestId,
      JsonRpcErrorCodes.InternalError,
      error.message,
    );

    // log the unhandled error response
    log.error('handleDwnProcessMessage error', jsonRpcResponse, dwnRequest, error);
    return { jsonRpcResponse } as HandlerResponse;
  }
};
