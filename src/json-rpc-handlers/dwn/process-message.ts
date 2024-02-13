import type { GenericMessage } from '@tbd54566975/dwn-sdk-js';
import { DwnInterfaceName, DwnMethodName } from '@tbd54566975/dwn-sdk-js';

import type { Readable as IsomorphicReadable } from 'readable-stream';
import { v4 as uuidv4 } from 'uuid';

import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';

import { DwnServerErrorCode } from '../../dwn-error.js';
import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';

export const handleDwnProcessMessage: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const { dwn, dataStream, subscriptionHandler, socketConnection, transport } = context;
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

    // Subscribe methods are only supported on 'ws' (WebSockets)
    if (transport !== 'ws' && message.descriptor.method === DwnMethodName.Subscribe) {
      const jsonRpcResponse = createJsonRpcErrorResponse(
        requestId,
        JsonRpcErrorCodes.InvalidParams,
        `Subscribe not supported via ${context.transport}`
      )
      return { jsonRpcResponse };
    }

    const reply = await dwn.processMessage(target, message, {
      dataStream: dataStream as IsomorphicReadable,
      subscriptionHandler,
    });

    const { record, subscription } = reply;

    // RecordsRead messages return record data as a stream to for accommodate large amounts of data
    let recordDataStream: IsomorphicReadable;
    if (record !== undefined && record.data !== undefined) {
      recordDataStream = reply.record.data;
      delete reply.record.data; // not serializable via JSON
    }

    // Subscribe messages return a close function to facilitate closing the subscription
    if (subscription !== undefined) {
      const { close } = subscription;
      try {
        // adding a reference to the close function for this subscription request to the connection.
        // this will facilitate closing the subscription later.
        await socketConnection.subscribe({ id: requestId, close });
        delete reply.subscription.close // not serializable via JSON
      } catch(error) {
        // close the subscription upon receiving an error here
        await close();
        if (error.code === DwnServerErrorCode.ConnectionSubscriptionJsonRPCIdExists) {
          // a subscription with this request id already exists
          const errorResponse = createJsonRpcErrorResponse(
            requestId,
            JsonRpcErrorCodes.BadRequest,
            `the request id ${requestId} already has an active subscription`
          );
          return { jsonRpcResponse: errorResponse };
        } else {
          // will catch as an unknown error below
          throw new Error('unknown error adding subscription');
        }
      }
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

    return { jsonRpcResponse } as HandlerResponse;
  }
};
