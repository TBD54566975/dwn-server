import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import type { RequestContext } from './lib/json-rpc-router.js';
import type { ParsedMediaType } from 'content-type';
import type { Express, Request } from 'express';

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

    this.api.post('/', async (req: Request, res) => {
      let contentType: ParsedMediaType;

      if ('content-type' in req.headers) {
        contentType = ContentType.parse(req);
      } else {
        const reply = createJsonRpcErrorResponse(
          uuidv4(), JsonRpcErrorCodes.BadRequest, 'content-type is required.');

        return res.status(400).json(reply);
      }

      let requestContext: RequestContext = { dwn: this.dwn, transport: 'http' };
      let dwnRequest;

      if (contentType.type === 'application/json') {
        dwnRequest = await getRawBody(req, { encoding: true });

        if (!dwnRequest) {
          const reply = createJsonRpcErrorResponse(uuidv4(),
            JsonRpcErrorCodes.BadRequest, 'request payload required.');

          return res.status(400).json(reply);
        }
      } else if (contentType.type === 'application/octet-stream') {
        dwnRequest = req.headers['dwn-request'];

        if (!dwnRequest) {
          const reply = createJsonRpcErrorResponse(uuidv4(),
            JsonRpcErrorCodes.BadRequest, 'request payload required.');

          return res.status(400).json(reply);
        }

        requestContext.dataStream = req;
      } else {
        const reply = createJsonRpcErrorResponse(
          uuidv4(), JsonRpcErrorCodes.BadRequest, 'content-type not supported');

        return res.status(400).json(reply);
      }

      try {
        dwnRequest = JSON.parse(dwnRequest);
      } catch(e) {
        const reply = createJsonRpcErrorResponse(uuidv4(), JsonRpcErrorCodes.BadRequest, e.message);

        return res.status(400).json(reply);
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