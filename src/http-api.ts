import type { Express, Request, Response } from 'express';
import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import type { RequestContext } from './lib/json-rpc-router.js';
import responseTime from 'response-time';

import cors from 'cors';
import express from 'express';
import { register, Histogram } from 'prom-client';

import { v4 as uuidv4 } from 'uuid';

import { jsonRpcApi } from './json-rpc-api.js';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes } from './lib/json-rpc.js';

export class HttpApi {
  api: Express;
  dwn: Dwn;

  constructor(dwn: Dwn) {
    this.api = express();
    this.dwn = dwn;

    const responseHistogram = new Histogram({
      name       : 'http_response',
      help       : 'response histogram',
      buckets    : [50, 250, 500, 750, 1000],
      labelNames : ['route', 'code'],
    });

    this.api.use(cors({ exposedHeaders: 'dwn-response' }));
    this.api.use(responseTime((req: Request, res: Response, time) => {
      const url = req.url === '/' ? '/jsonrpc' : req.url;
      const route = (req.method + url).toLowerCase()
        .replace(/[:.]/g, '')
        .replace(/\//g, '_');

      const statusCode = res.statusCode.toString();
      responseHistogram.labels(route, statusCode).observe(time);
    }));

    this.api.get('/health', (_req, res) => {
      // return 200 ok
      return res.json({ ok: true });
    });

    this.api.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (e) {
        res.status(500).end(e);
      }
    });

    this.api.get('/', (_req, res) => {
      // return a plain text string
      res.setHeader('content-type', 'text/plain');
      return res.send('please use a web5 client, for example: https://github.com/TBD54566975/web5-js ');
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
      } catch (e) {
        const reply = createJsonRpcErrorResponse(uuidv4(), JsonRpcErrorCodes.BadRequest, e.message);

        return res.status(400).json(reply);
      }

      // Check whether data was provided in the request body
      const contentLength = req.headers['content-length'];
      const transferEncoding = req.headers['transfer-encoding'];
      const requestDataStream = (parseInt(contentLength) > 0 || transferEncoding !== undefined) ? req : undefined;

      const requestContext: RequestContext = { dwn: this.dwn, transport: 'http', dataStream: requestDataStream };
      const { jsonRpcResponse, dataStream: responseDataStream } = await jsonRpcApi.handle(dwnRequest, requestContext as RequestContext);

      // If the handler catches a thrown exception and returns a JSON RPC InternalError, return the equivalent
      // HTTP 500 Internal Server Error with the response.
      if (jsonRpcResponse.error) {
        return res.status(500).json(jsonRpcResponse);
      }

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