import type { Express, Request } from 'express';
import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import type { RequestContext } from './lib/json-rpc-router.js';

import cors from 'cors';
import express from 'express';

import { v4 as uuidv4 } from 'uuid';

import { jsonRpcApi } from './json-rpc-api.js';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes } from './lib/json-rpc.js';

export class HttpApi {
  api: Express;
  dwn: Dwn;

  constructor(dwn: Dwn) {
    this.api = express();
    this.dwn = dwn;

    this.api.use(cors({ exposedHeaders: 'dwn-response' }));

    this.api.get('/health', (_req, res) => {
      // return 200 ok
      return res.json({ ok: true });
    });

    this.api.post('/', async (req: Request, res) => {
      let dwnRequest = req.headers['dwn-request'] as any;

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

      // Check whether data was provided in the request body
      const contentLength = req.headers['content-length'];
      const transferEncoding = req.headers['transfer-encoding'];
      const requestDataStream = (parseInt(contentLength) > 0 || transferEncoding !== undefined) ? req : undefined;

      const requestContext: RequestContext = { dwn: this.dwn, transport: 'http', dataStream: requestDataStream };
      const { jsonRpcResponse, dataStream: responseDataStream } = await jsonRpcApi.handle(dwnRequest, requestContext as RequestContext);

      if (responseDataStream) {
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('dwn-response', JSON.stringify(jsonRpcResponse));

        return responseDataStream.pipe(res);
      } else {
        return res.json(jsonRpcResponse);
      }
    });
  }

  listen(port: number, callback?: () => void) {
    return this.api.listen(port, callback);
  }
}