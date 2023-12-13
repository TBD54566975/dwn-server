import type { RecordsReadReply } from '@tbd54566975/dwn-sdk-js';

import type { Readable as IsomorphicReadable } from 'readable-stream';
import { v4 as uuidv4 } from 'uuid';

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
  const { dwn, dataStream } = context;
  const { target, message } = dwnRequest.params;
  const requestId = dwnRequest.id ?? uuidv4();

  try {
    const reply = (await dwn.processMessage(
      target,
      message,
      dataStream as IsomorphicReadable,
    )) as RecordsReadReply;

    // RecordsRead messages return record data as a stream to for accommodate large amounts of data
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
