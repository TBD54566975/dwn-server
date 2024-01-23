import { type Dwn, RecordsRead, type RecordsReadReply } from '@tbd54566975/dwn-sdk-js';

import cors from 'cors';
import type { Express, Request, Response } from 'express';
import express from 'express';
import { readFileSync } from 'fs';
import http from 'http';
import log from 'loglevel';
import { register } from 'prom-client';
import responseTime from 'response-time';
import { v4 as uuidv4 } from 'uuid';

import type { RequestContext } from './lib/json-rpc-router.js';
import type { JsonRpcRequest } from './lib/json-rpc.js';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes } from './lib/json-rpc.js';

import type { DwnServerConfig } from './config.js';
import { config } from './config.js';
import { type DwnServerError } from './dwn-error.js';
import { jsonRpcApi } from './json-rpc-api.js';
import { requestCounter, responseHistogram } from './metrics.js';
import type { RegistrationManager } from './registration/registration-manager.js';

const packageJson = process.env.npm_package_json ? JSON.parse(readFileSync(process.env.npm_package_json).toString()) : {};

export class HttpApi {
  #config: DwnServerConfig;
  #api: Express;
  #server: http.Server;
  registrationManager: RegistrationManager;
  dwn: Dwn;

  constructor(config: DwnServerConfig, dwn: Dwn, registrationManager: RegistrationManager) {
    console.log(config);

    this.#config = config;
    this.#api = express();
    this.#server = http.createServer(this.#api);
    this.dwn = dwn;

    if (registrationManager !== undefined) {
      this.registrationManager = registrationManager;
    }

    this.#setupMiddleware();
    this.#setupRoutes();
  }

  get server(): http.Server {
    return this.#server;
  }

  get api(): Express {
    return this.#api;
  }

  #setupMiddleware(): void {
    this.#api.use(cors({ exposedHeaders: 'dwn-response' }));
    this.#api.use(express.json());

    this.#api.use(
      responseTime((req: Request, res: Response, time) => {
        const url = req.url === '/' ? '/jsonrpc' : req.url;
        const route = (req.method + url)
          .toLowerCase()
          .replace(/[:.]/g, '')
          .replace(/\//g, '_');

        const statusCode = res.statusCode.toString();
        responseHistogram.labels(route, statusCode).observe(time);
        log.info(req.method, decodeURI(req.url), res.statusCode);
      }),
    );
  }

  /* setupRoutes configures the HTTP server's request handlers
   */
  #setupRoutes(): void {
    this.#api.get('/health', (_req, res) => {
      // return 200 ok
      return res.json({ ok: true });
    });

    this.#api.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (e) {
        res.status(500).end(e);
      }
    });

    this.#api.get('/:did/records/:id', async (req, res) => {
      const record = await RecordsRead.create({
        filter: { recordId: req.params.id },
      });
      const reply = (await this.dwn.processMessage(req.params.did, record.toJSON())) as RecordsReadReply;

      if (reply.status.code === 200) {
        if (reply?.record?.data) {
          const stream = reply.record.data;
          delete reply.record.data;

          res.setHeader('content-type', reply.record.descriptor.dataFormat);
          res.setHeader('dwn-response', JSON.stringify(reply));

          return stream.pipe(res);
        } else {
          return res.sendStatus(400);
        }
      } else if (reply.status.code === 401) {
        return res.sendStatus(404);
      } else {
        return res.status(reply.status.code).send(reply);
      }
    });

    this.#api.get('/', (_req, res) => {
      // return a plain text string
      res.setHeader('content-type', 'text/plain');
      return res.send('please use a web5 client, for example: https://github.com/TBD54566975/web5-js ');
    });

    this.#api.post('/', async (req: Request, res) => {
      const dwnRequest = req.headers['dwn-request'] as any;

      if (!dwnRequest) {
        const reply = createJsonRpcErrorResponse(uuidv4(), JsonRpcErrorCodes.BadRequest, 'request payload required.');

        return res.status(400).json(reply);
      }

      let dwnRpcRequest: JsonRpcRequest;
      try {
        dwnRpcRequest = JSON.parse(dwnRequest);
      } catch (e) {
        const reply = createJsonRpcErrorResponse(uuidv4(), JsonRpcErrorCodes.BadRequest, e.message);

        return res.status(400).json(reply);
      }

      // Check whether data was provided in the request body
      const contentLength = req.headers['content-length'];
      const transferEncoding = req.headers['transfer-encoding'];
      const requestDataStream = parseInt(contentLength) > 0 || transferEncoding !== undefined ? req : undefined;

      const requestContext: RequestContext = {
        dwn        : this.dwn,
        transport  : 'http',
        dataStream : requestDataStream,
      };
      const { jsonRpcResponse, dataStream: responseDataStream } = await jsonRpcApi.handle(dwnRpcRequest, requestContext as RequestContext);

      // If the handler catches a thrown exception and returns a JSON RPC InternalError, return the equivalent
      // HTTP 500 Internal Server Error with the response.
      if (jsonRpcResponse.error) {
        requestCounter.inc({ method: dwnRpcRequest.method, error: 1 });
        return res.status(500).json(jsonRpcResponse);
      }

      requestCounter.inc({
        method : dwnRpcRequest.method,
        status : jsonRpcResponse?.result?.reply?.status?.code || 0,
      });
      if (responseDataStream) {
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('dwn-response', JSON.stringify(jsonRpcResponse));

        return responseDataStream.pipe(res);
      } else {
        return res.json(jsonRpcResponse);
      }
    });

    this.#setupRegistrationRoutes();

    this.#api.get('/info', (req, res) => {
      res.setHeader('content-type', 'application/json');
      const registrationRequirements: string[] = [];
      if (config.registrationProofOfWorkEnabled) {
        registrationRequirements.push('proof-of-work-sha256-v0');
      }
      if (config.termsOfServiceFilePath !== undefined) {
        registrationRequirements.push('terms-of-service');
      }

      res.json({
        server                   : process.env.npm_package_name,
        maxFileSize              : config.maxRecordDataSize,
        registrationRequirements : registrationRequirements,
        version                  : packageJson.version,
        sdkVersion               : packageJson.dependencies['@tbd54566975/dwn-sdk-js'],
      });
    });
  }

  #listen(port: number, callback?: () => void): void {
    this.#server.listen(port, callback);
  }

  #setupRegistrationRoutes(): void {
    if (this.#config.registrationProofOfWorkEnabled) {
      this.#api.get('/registration/proof-of-work', async (_req: Request, res: Response) => {
        const proofOfWorkChallenge = this.registrationManager.getProofOfWorkChallenge();
        res.json(proofOfWorkChallenge);
      });
    }

    if (this.#config.termsOfServiceFilePath !== undefined) {
      this.#api.get('/registration/terms-of-service', (_req: Request, res: Response) => res.send(this.registrationManager.getTermsOfService()));
    }

    if (this.#config.registrationStoreUrl !== undefined) {
      this.#api.post('/registration', async (req: Request, res: Response) => {
        const requestBody = req.body;
        console.log('Registration request:', requestBody);

        try {
          await this.registrationManager.handleRegistrationRequest(requestBody);
          res.status(200).json({ success: true });
        } catch (error) {
          const dwnServerError = error as DwnServerError;

          if (dwnServerError.code !== undefined) {
            res.status(400).json(dwnServerError);
          } else {
            console.log('Error handling registration request:', error);
            res.status(500).json({ success: false });
          }
        }
      });
    }
  }

  async start(port: number, callback?: () => void): Promise<http.Server> {
    this.#listen(port, callback);
    return this.#server;
  }
}
