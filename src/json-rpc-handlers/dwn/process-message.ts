import { v4 as uuidv4 } from 'uuid';
import type { Readable as IsomorphicReadable } from 'readable-stream';
import type {
  RecordsReadReply,
  SubscriptionRequestReply,
} from '@tbd54566975/dwn-sdk-js';
import {
  DwnInterfaceName,
  DwnMethodName,
  SubscriptionRequest,
} from '@tbd54566975/dwn-sdk-js';
import type {
  HandlerResponse,
  JsonRpcHandler,
} from '../../lib/json-rpc-router.js';
import {
  JsonRpcErrorCodes,
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
} from '../../lib/json-rpc.js';

export const handleDwnProcessMessage: JsonRpcHandler = async (
  dwnRequest,
  context,
) => {
  const { dwn, dataStream } = context;
  const { target, message } = dwnRequest.params;
  const requestId = dwnRequest.id ?? uuidv4();
  try {
    let reply: any;

    const messageType =
      message?.descriptor?.interface + message?.descriptor?.method;

    if (
      messageType === DwnInterfaceName.Records + DwnMethodName.Write &&
      !dataStream
    ) {
      reply = await dwn.synchronizePrunedInitialRecordsWrite(target, message);
    } else if (
      messageType ===
      DwnInterfaceName.Subscriptions + DwnMethodName.Request
    ) {
      reply = (await dwn.processMessage(
        target,
        message,
      )) as SubscriptionRequestReply;
      if (!context.subscriptionManager || !context.socket) {
        throw new Error(
          'setup failure. improper context provided for subscription',
        );
      }

      // FIXME: How to handle subscription requests?
      const request = await SubscriptionRequest.create({});
      const req = {
        socket: context.socket,
        from: message.descriptor.author,
        request: request,
      };
      reply = await context.subscriptionManager.subscribe(req);
      const jsonRpcResponse = createJsonRpcSuccessResponse(requestId, {
        reply,
      });
      const responsePayload: HandlerResponse = { jsonRpcResponse };
      return responsePayload;
    } else {
      reply = (await dwn.processMessage(
        target,
        message,
        dataStream as IsomorphicReadable,
      )) as RecordsReadReply;
    }

    let recordDataStream;
    if (reply?.record?.data !== undefined) {
      recordDataStream = reply.record.data;
      delete reply.record.data;
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
