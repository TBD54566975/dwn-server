import { type Dwn, DateSort, RecordsRead, RecordsQuery, ProtocolsQuery } from '@tbd54566975/dwn-sdk-js';

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
import { jsonRpcRouter } from './json-rpc-api.js';
import { requestCounter, responseHistogram } from './metrics.js';
import type { RegistrationManager } from './registration/registration-manager.js';


export class HttpApi {
  #config: DwnServerConfig;
  #packageInfo: { version?: string, sdkVersion?: string, server: string };
  #api: Express;
  #server: http.Server;
  registrationManager: RegistrationManager;
  dwn: Dwn;

  constructor(config: DwnServerConfig, dwn: Dwn, registrationManager?: RegistrationManager) {
    console.log(config);

    this.#packageInfo = {
      server: config.serverName,
    };
    
    try {
      // We populate the `version` and `sdkVersion` properties from the `package.json` file.
      const packageJson = JSON.parse(readFileSync(config.packageJsonPath).toString());
      this.#packageInfo.version = packageJson.version;
      this.#packageInfo.sdkVersion = packageJson.dependencies ? packageJson.dependencies['@tbd54566975/dwn-sdk-js'] : undefined;
    } catch (error: any) {
      log.error('could not read `package.json` for version info', error);
    }

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

  /**
   * Configures the HTTP server's request handlers.
   */
  #setupRoutes(): void {

    const leadTailSlashRegex = /^\/|\/$/;

    function readReplyHandler(res, reply): any {
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
    }

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

    // Returns the data for the most recently published record under a given protocol path collection, if one is present
    this.#api.get('/:did/read/protocols/:protocol/*', async (req, res) => {
      if (!req.params[0]) {
        return res.status(400).send('protocol path is required');
      }

      const protocolPath = req.params[0].replace(leadTailSlashRegex, '');
      const protocol = req.params.protocol;

      const query = await RecordsQuery.create({
        filter: {
          protocol,
          protocolPath,
        },
        pagination: { limit: 1 },
        dateSort: DateSort.PublishedDescending
      });

      const { entries, status } = await this.dwn.processMessage(req.params.did, query.message);

      if (status.code === 200) {
        if (entries[0]) {
          const record = await RecordsRead.create({
            filter: { recordId: entries[0].recordId },
          });
          const reply = await this.dwn.processMessage(req.params.did, record.toJSON());
          return readReplyHandler(res, reply);
        } else {
          return res.sendStatus(404);
        }
      } else if (status.code === 401) {
        return res.sendStatus(404);
      } else {
        return res.sendStatus(status.code);
      }
    })

    this.#api.get('/:did/read/protocols/:protocol', async (req, res) => {
      const query = await ProtocolsQuery.create({
        filter: { protocol: req.params.protocol }
      });
      const { entries, status } = await this.dwn.processMessage(req.params.did, query.message);
      if (status.code === 200) {
        if (entries.length) {
          res.status(status.code);
          res.json(entries[0]);
        } else {
          return res.sendStatus(404);
        }
      } else if (status.code === 401) {
        return res.sendStatus(404);
      } else {
        return res.sendStatus(status.code);
      }
    })

    const recordsReadHandler = async (req, res): Promise<any> => {
      const record = await RecordsRead.create({
        filter: { recordId: req.params.id },
      });
      const reply = await this.dwn.processMessage(req.params.did, record.message);
      return readReplyHandler(res, reply);
    }

    this.#api.get('/:did/read/records/:id', recordsReadHandler);
    this.#api.get('/:did/records/:id', recordsReadHandler);

    this.#api.get('/:did/query/protocols', async (req, res) => {
      const query = await ProtocolsQuery.create({});
      const { entries, status } = await this.dwn.processMessage(req.params.did, query.message);
      if (status.code === 200) {
        res.status(status.code);
        res.json(entries);
      } else if (status.code === 401) {
        return res.sendStatus(404);
      } else {
        return res.sendStatus(status.code);
      }
    });

    this.#api.get('/:did/query', async (req, res) => {
      
      try {
        // builds a nested object from flat keys with dot notation which may share the same parent path
        // e.g. "did:dht:123/query?filter.protocol=foo&filter.protocolPath=bar" becomes
        // {
        //   filter: {
        //     protocol: 'foo',
        //     protocolPath: 'bar'
        //   }
        // }
        const recordsQueryOptions = {} as any;
        for (const param in req.query) {
          const keys = param.split('.');
          const lastKey = keys.pop();
          const lastLevelObject = keys.reduce((obj, key) => obj[key] = obj[key] || {}, recordsQueryOptions)
          lastLevelObject[lastKey] = req.query[param];
        }
    
        const recordsQuery = await RecordsQuery.create({
          filter: recordsQueryOptions.filter,
          pagination: recordsQueryOptions.pagination,
          dateSort: recordsQueryOptions.dateSort,
        });

        // should always return a 200 status code with a JSON response
        const reply = await this.dwn.processMessage(req.params.did, recordsQuery.message);

        res.setHeader('content-type', 'application/json');
        return res.json(reply);
      } catch (error) {
        // error should only occur when we are unable to create the RecordsQuery message internally, making it a client error
        return res.status(400).send(error);
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
      const { jsonRpcResponse, dataStream: responseDataStream } = await jsonRpcRouter.handle(dwnRpcRequest, requestContext as RequestContext);

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
        server                   : this.#packageInfo.server,
        maxFileSize              : config.maxRecordDataSize,
        registrationRequirements : registrationRequirements,
        version                  : this.#packageInfo.version,
        sdkVersion               : this.#packageInfo.sdkVersion,
        webSocketSupport         : config.webSocketSupport,
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
