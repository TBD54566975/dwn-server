import type { Readable as IsomorphicReadable } from 'readable-stream';
import type { JsonRpcHandler, HandlerResponse } from '../../lib/json-rpc-router.js';

import { base64url } from 'multiformats/bases/base64';
import { DataStream } from '@tbd54566975/dwn-sdk-js';
import { v4 as uuidv4 } from 'uuid';

import { JsonRpcErrorCodes, createJsonRpcErrorResponse, createJsonRpcSuccessResponse } from '../../lib/json-rpc.js';

export const handleDwnProcessMessage: JsonRpcHandler = async (dwnRequest, context) => {
  let { dwn, dataStream } = context;
  const { target, message } = dwnRequest.params;

  const requestId = dwnRequest.id ?? uuidv4();

  // data can either be provided in the dwnRequest itself or as a stream
  if (!dataStream) {
    const { encodedData } = dwnRequest.params;
    dataStream = encodedData ? DataStream.fromBytes(base64url.baseDecode(encodedData)) : undefined;
  }

  try {
    const reply = await dwn.processMessage(target, message, dataStream as IsomorphicReadable);

    if (reply.status.code >= 400) {
      const jsonRpcResponse = createJsonRpcErrorResponse(requestId,
        JsonRpcErrorCodes.BadRequest, reply.status.detail);

      return { jsonRpcResponse } as HandlerResponse;
    }

    // RecordsRead messages return record data as a stream to for accommodate large amounts of data
    let recordDataStream;
    if ('record' in reply) {
      // TODO: export `RecordsReadReply` from dwn-sdk-js
      recordDataStream = reply.record['data'];
      delete reply.record['data'];
    }

    const jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply });
    const responsePayload: HandlerResponse = { jsonRpcResponse };
    if (recordDataStream) {
      responsePayload.dataStream = recordDataStream;
    }

    return responsePayload;
  } catch(e) {
    const jsonRpcResponse = createJsonRpcErrorResponse(
      requestId, JsonRpcErrorCodes.InternalError, e.message);

    return { jsonRpcResponse } as HandlerResponse;
  }
};