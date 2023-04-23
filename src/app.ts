import type { RequestContext } from './lib/json-rpc-router.js';

import cors from 'cors';
import ContentType from 'content-type';
import express from 'express';
import getRawBody from 'raw-body';

import { rpcRouter } from './rpc-router.js';
import { v4 as uuidv4 } from 'uuid';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes } from './lib/json-rpc.js';

export const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  // return 200 ok
  return res.json({ ok: true });
});

app.post('/', async (req, res) => {
  let dwnRequest;

  try {
    // the json rpc request payload is provided in the http request body _or_ as the value of
    // the 'dwn-request' request header.
    dwnRequest = req.headers['dwn-request'] ?? await getRawBody(req, { encoding: true });
  } catch(e) {
    const reply = createJsonRpcErrorResponse(
      uuidv4(), JsonRpcErrorCodes.BadRequest, 'failed to read request.');

    return res.status(400).json(reply);
  }

  if (!dwnRequest) {
    const reply = createJsonRpcErrorResponse(uuidv4(),
      JsonRpcErrorCodes.BadRequest, 'request payload required.');

    return res.status(400).json(reply);
  }

  try {
    dwnRequest = JSON.parse(dwnRequest);
  } catch(e) {
    const reply = createJsonRpcErrorResponse(uuidv4(), JsonRpcErrorCodes.BadRequest, e.message);

    return res.status(400).json(reply);
  }

  const requestContext: RequestContext = {};
  if ('content-type' in req.headers) {
    const contentType = ContentType.parse(req);

    if (contentType['type'] === 'multipart/form-data') {
      requestContext.multipartRequest = req;
    }
  }

  const { jsonRpcResponse, dataStream } = await rpcRouter.handle(dwnRequest, requestContext);
  if (dataStream) {
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('dwn-response', JSON.stringify(jsonRpcResponse));

    return dataStream.pipe(res);
  } else {
    return res.json(jsonRpcResponse);
  }
});