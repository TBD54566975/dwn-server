import type { Readable as IsomorphicReadable } from 'readable-stream';
import type { JsonRpcHandler, HandlerResponse } from '../../lib/json-rpc-router.js';

import { v4 as uuidv4 } from 'uuid';
import { DwnInterfaceName, DwnMethodName } from '@tbd54566975/dwn-sdk-js';

import { JsonRpcErrorCodes, createJsonRpcErrorResponse, createJsonRpcSuccessResponse } from '../../lib/json-rpc.js';

export const handleDwnProcessMessage: JsonRpcHandler = async (dwnRequest, context) => {
  let { dwn, dataStream } = context;
  const { target, message } = dwnRequest.params;
  const requestId = dwnRequest.id ?? uuidv4();

  try {
    let reply;
    const messageType = message?.descriptor?.interface + message?.descriptor?.method;

    // When a record is deleted via `RecordsDelete`, the initial RecordsWrite is kept as a tombstone _in addition_
    // to the RecordsDelete message. the data associated to that initial RecordsWrite is deleted. If a record was written
    // _and_ deleted before it ever got to dwn-server, we end up in a situation where we still need to process the tombstone
    // so that we can process the RecordsDelete.
    if (messageType === DwnInterfaceName.Records + DwnMethodName.Write && !dataStream) {
      reply = await dwn.synchronizePrunedInitialRecordsWrite(target, message);
    } else {
      reply = await dwn.processMessage(target, message, dataStream as IsomorphicReadable);
    }


    // RecordsRead messages return record data as a stream to for accommodate large amounts of data
    let recordDataStream;
    if ('record' in reply) {
      // TODO: Import `RecordsReadReply` from dwn-sdk-js once release with https://github.com/TBD54566975/dwn-sdk-js/pull/346 is available
      recordDataStream = reply.record['data'];
      delete reply.record['data'];
    }

    const jsonRpcResponse = createJsonRpcSuccessResponse(requestId, { reply });
    const responsePayload: HandlerResponse = { jsonRpcResponse };
    if (recordDataStream) {
      responsePayload.dataStream = recordDataStream;
    }

    return responsePayload;
  } catch (e) {
    const jsonRpcResponse = createJsonRpcErrorResponse(
      requestId, JsonRpcErrorCodes.InternalError, e.message);

    return { jsonRpcResponse } as HandlerResponse;
  }
};