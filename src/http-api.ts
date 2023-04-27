import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import type { Express } from 'express';
import type { RequestContext } from './lib/json-rpc-router.js';

import cors from 'cors';
import express from 'express';
import getRawBody from 'raw-body';
import ContentType from 'content-type';

import { v4 as uuidv4 } from 'uuid';

import { jsonRpcApi } from './json-rpc-api.js';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes } from './lib/json-rpc.js';

export class HttpApi {
  api: Express;
  dwn: Dwn;

  constructor(dwn: Dwn) {
    this.api = express();
    this.dwn = dwn;

    this.api.use(cors());

    this.api.get('/health', (_req, res) => {
      // return 200 ok
      return res.json({ ok: true });
    });

    this.api.post('/', async (req, res) => {
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

      let requestContext: Partial<RequestContext> = { dwn: this.dwn };
      if ('content-type' in req.headers) {
        const contentType = ContentType.parse(req);

        if (contentType['type'] === 'application/octet-stream' || contentType['type'] === 'multipart/form-data') {
          requestContext.contentType = contentType['type'];
          requestContext.request = req;
        }
      }

      const { jsonRpcResponse, dataStream } = await jsonRpcApi.handle(dwnRequest, requestContext as RequestContext);
      if (dataStream) {
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('dwn-response', JSON.stringify(jsonRpcResponse));

        return dataStream.pipe(res);
      } else {
        return res.json(jsonRpcResponse);
      }
    });
  }

  listen(port: number, callback?: () => void) {
    return this.api.listen(port, callback);
  }
}