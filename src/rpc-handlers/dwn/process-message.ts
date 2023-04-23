import type { Readable } from 'readable-stream';
import type { JsonRpcHandler, HandlerResponse } from '../../lib/json-rpc-router.js';

import busboy from 'busboy';
import EventEmitter from 'events';

import { base64url } from 'multiformats/bases/base64';
import { DataStream } from '@tbd54566975/dwn-sdk-js';
import { dwn } from '../../dwn.js';
import { v4 as uuidv4 } from 'uuid';
import { JsonRpcErrorCodes, createJsonRpcErrorResponse, createJsonRpcSuccessResponse } from '../../lib/json-rpc.js';

const emitter = new EventEmitter();

export const handleDwnProcessMessage: JsonRpcHandler = async (dwnRequest, context) => {
  const requestId = dwnRequest.id ?? uuidv4();
  const { target, message } = dwnRequest.params;

  if (context.contentType === 'application/octet-stream') {
    return await _processDwnMessage(requestId, target, message, context.request as any);
  } else if (context.contentType === 'multipart/form-data') {
    // there's no choice other than to return a promise here because we have to wait until the multipart
    // request body is fully consumed.
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(resolve => {
      const bb = busboy({
        headers : context.request.headers,
        limits  : {
          fields : 0,
          files  : 1
        }
      });

      let { params } = dwnRequest;

      emitter.once(requestId, responsePayload => {
        return resolve(responsePayload);
      });

      // TODO: figure out whether we need to listen for errors on multipartRequest. not sure if
      //       the error bubbles all the way up to topmost stream
      // context.multipartRequest.on('error', error => {});

      // TODO: figure out whether we need to listen for errors on busboy
      // bb.once('error', error => {});

      bb.on('file', async (_name, stream, _info) => {
        // TODO: figure out whether we need to listen for errors on this stream
        // stream.on('error', error => {});

        const responsePayload = await _processDwnMessage(requestId, params.target, params.message, <any>stream);
        emitter.emit(requestId, responsePayload);
      });

      // TODO: might make more sense to send the reply from here. is 'close' called when an error occurs?
      // bb.on('close', () => {});

      context.request.pipe(bb);
    });
  } else {
    const { message, target, encodedData } = dwnRequest.params;
    const dataStream = encodedData ? DataStream.fromBytes(base64url.baseDecode(encodedData)) : undefined;

    return await _processDwnMessage(requestId, target, message, dataStream);
  }
};

async function _processDwnMessage(requestId: string, target: string, dwnMessage, dataStream?: Readable) {
  try {
    const reply = await dwn.processMessage(target, dwnMessage, dataStream);
    const { status } = reply;

    if (status.code >= 400) {
      const jsonRpcResponse = createJsonRpcErrorResponse(requestId,
        JsonRpcErrorCodes.BadRequest, status.detail);

      return { jsonRpcResponse } as HandlerResponse;
    }


    // RecordsRead messages return record data as a stream to for accommodate large amounts of data
    let recordDataStream;
    if ('record' in reply) {
      // TODO: export `RecordsReadReply` from dwn-sdk-js
      recordDataStream = reply.record['data'];
      reply.record['data'] = null;
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
}