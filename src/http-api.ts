import type { RecordsReadReply } from '@tbd54566975/dwn-sdk-js';
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

import type { DwnServerConfig } from './config.js';
import type { DwnServerError } from './dwn-error.js';
import type { RegistrationManager } from './registration/registration-manager.js';
import { config } from './config.js';
import { jsonRpcRouter } from './json-rpc-api.js';
import { Web5ConnectServer } from './web5-connect/web5-connect-server.js';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes } from './lib/json-rpc.js';
import { requestCounter, responseHistogram } from './metrics.js';
import { Convert } from '@web5/common';


export class HttpApi {
  #config: DwnServerConfig;
  #packageInfo: { version?: string, sdkVersion?: string, server: string };
  #api: Express;
  #server: http.Server;
  web5ConnectServer: Web5ConnectServer;
  registrationManager: RegistrationManager;
  dwn: Dwn;

  private constructor() { }

  public static async create(config: DwnServerConfig, dwn: Dwn, registrationManager?: RegistrationManager): Promise<HttpApi> {
    const httpApi = new HttpApi();

    log.info(config);

    httpApi.#packageInfo = {
      server: config.serverName,
    };
    
    try {
      // We populate the `version` and `sdkVersion` properties from the `package.json` file.
      const packageJson = JSON.parse(readFileSync(config.packageJsonPath).toString());
      httpApi.#packageInfo.version = packageJson.version;
      httpApi.#packageInfo.sdkVersion = packageJson.dependencies ? packageJson.dependencies['@tbd54566975/dwn-sdk-js'] : undefined;
    } catch (error: any) {
      log.info('could not read `package.json` for version info', error);
    }

    httpApi.#config = config;
    httpApi.#api = express();
    httpApi.#server = http.createServer(httpApi.#api);
    httpApi.dwn = dwn;

    if (registrationManager !== undefined) {
      httpApi.registrationManager = registrationManager;
    }

    // create the Web5 Connect Server
    httpApi.web5ConnectServer = await Web5ConnectServer.create({
      baseUrl: config.baseUrl,
      sqlTtlCacheUrl: config.ttlCacheUrl,
    });

    httpApi.#setupMiddleware();
    httpApi.#setupRoutes();

    return httpApi;
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

    // We enable the formData middleware to handle multipart/form-data requests.
    // This is necessary for the endpoints used by the Web5 Connect Server/OIDC flow.
    this.#api.use(express.urlencoded({ extended: true }));
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

    function readReplyHandler(res, reply: RecordsReadReply): any {
      if (reply.status.code === 200) {
        if (reply?.entry?.data) {
          const stream = reply.entry.data;

          res.setHeader('content-type', reply.entry.recordsWrite.descriptor.dataFormat);
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

      // wrap request in a try-catch block to handle any unexpected errors
      try {
        const queryOptions = { filter: {} } as any;
        for (const param in req.query) {
          const keys = param.split('.');
          const lastKey = keys.pop();
          const lastLevelObject = keys.reduce((obj, key) => obj[key] = obj[key] || {}, queryOptions)
          lastLevelObject[lastKey] = req.query[param];
        }

        // the protocol path segment is base64url encoded, as the actual protocol is a URL
        // we decode it here in order to filter for the correct protocol
        const protocol = Convert.base64Url(req.params.protocol).toString()
        queryOptions.filter.protocol = protocol;
        queryOptions.filter.protocolPath = req.params[0].replace(leadTailSlashRegex, '');

        const query = await RecordsQuery.create({
          filter: queryOptions.filter,
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
      } catch(error) {
        log.error(`Error processing request: ${decodeURI(req.url)}`, error);
        return res.sendStatus(400);
      }
    })

    this.#api.get('/:did/read/protocols/:protocol', async (req, res) => {
      // wrap request in a try-catch block to handle any unexpected errors
      try {

        // the protocol segment is base64url encoded, as the actual protocol is a URL
        // we decode it here in order to filter for the correct protocol
        const protocol = Convert.base64Url(req.params.protocol).toString()
        const query = await ProtocolsQuery.create({
          filter: { protocol }
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
      } catch(error) {
        log.error(`Error processing request: ${decodeURI(req.url)}`, error);
        return res.sendStatus(400);
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
      const dwnRpcRequestString = req.headers['dwn-request'] as string;

      if (!dwnRpcRequestString) {
        const reply = createJsonRpcErrorResponse(uuidv4(), JsonRpcErrorCodes.BadRequest, 'request payload required.');

        return res.status(400).json(reply);
      }

      let dwnRpcRequest: JsonRpcRequest;
      try {
        dwnRpcRequest = JSON.parse(dwnRpcRequestString);
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
        url                      : config.baseUrl,
        server                   : this.#packageInfo.server,
        maxFileSize              : config.maxRecordDataSize,
        registrationRequirements : registrationRequirements,
        version                  : this.#packageInfo.version,
        sdkVersion               : this.#packageInfo.sdkVersion,
        webSocketSupport         : config.webSocketSupport,
      });
    });

    this.#setupWeb5ConnectServerRoutes();
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
        log.info('Registration request:', requestBody);

        try {
          await this.registrationManager.handleRegistrationRequest(requestBody);
          res.status(200).json({ success: true });
        } catch (error) {
          const dwnServerError = error as DwnServerError;

          if (dwnServerError.code !== undefined) {
            res.status(400).json(dwnServerError);
          } else {
            log.info('Error handling registration request:', error);
            res.status(500).json({ success: false });
          }
        }
      });
    }
  }

  #setupWeb5ConnectServerRoutes(): void {
    /**
    * Endpoint allows a Client app (RP) to submit an Authorization Request.
    * The Authorization Request is stored on the server, and a unique `request_uri` is returned to the Client app.
    * The Client app can then provide this `request_uri` to the Provider app (wallet).
    * The Provider app uses the `request_uri` to retrieve the stored Authorization Request.
    */
    this.#api.post('/connect/par', async (req, res) => {
      log.info('Storing Pushed Authorization Request (PAR) request...');

    // TODO: Add validation for request too large HTTP 413: https://github.com/TBD54566975/dwn-server/issues/146
    // TODO: Add validation for too many requests HTTP 429: https://github.com/TBD54566975/dwn-server/issues/147

      if (!req.body.request) {
        return res.status(400).json({
          ok: false,
          status: {
            code: 400,
            message: "Bad Request: Missing 'request' parameter",
          },
        });
      }

      // Validate that `request_uri` was NOT provided
      if (req.body?.request?.request_uri) {
        return res.status(400).json({
          ok: false,
          status: {
            code: 400,
            message: "Bad Request: 'request_uri' parameter is not allowed in PAR",
          },
        });
      }

      const result = await this.web5ConnectServer.setWeb5ConnectRequest(req.body.request);
      res.status(201).json(result);
    });

    /**
    * Endpoint for the Provider to retrieve the Authorization Request from the request_uri
    */
    this.#api.get('/connect/authorize/:requestId.jwt', async (req, res) => {
      log.info(`Retrieving Web5 Connect Request object of ID: ${req.params.requestId}...`);

      // Look up the request object based on the requestId.
      const requestObjectJwt = await this.web5ConnectServer.getWeb5ConnectRequest(req.params.requestId);

      if (!requestObjectJwt) {
        res.status(404).json({
          ok     : false,
          status : { code: 404, message: 'Not Found' }
        });
      } else {
        res.set('Content-Type', 'application/jwt');
        res.send(requestObjectJwt);
      }
    });

    /**
    * Endpoint that the Provider sends the Authorization Response to
    */
    this.#api.post('/connect/callback', async (req, res) => {
      log.info('Storing Identity Provider (wallet) pushed response with ID token...');

      // Store the ID token.
      const idToken = req.body.id_token;
      const state = req.body.state;

      if (idToken !== undefined && state != undefined) {

        await this.web5ConnectServer.setWeb5ConnectResponse(state, idToken);

        res.status(201).json({
          ok     : true,
          status : { code: 201, message: 'Created' }
        });

      } else {
        res.status(400).json({
          ok     : false,
          status : { code: 400, message: 'Bad Request' }
        });
      }
    });

    /**
    * Endpoint for the connecting Client to retrieve the Authorization Response
    */
    this.#api.get('/connect/token/:state.jwt', async (req, res) => {
      log.info(`Retrieving ID token for state: ${req.params.state}...`);

      // Look up the ID token.
      const idToken = await this.web5ConnectServer.getWeb5ConnectResponse(req.params.state);

      if (!idToken) {
        res.status(404).json({
          ok     : false,
          status : { code: 404, message: 'Not Found' }
        });
      } else {
        res.set('Content-Type', 'application/jwt');
        res.send(idToken);
      }
    });
  }

  /**
   * Starts the HTTP API endpoint on the given port.
   * @returns The HTTP server instance.
   */
  async start(port: number): Promise<void> {
    // promisify http.Server.listen() and await on it
    await new Promise<void>((resolve) => {
      this.#server.listen(port, () => {
        resolve();
      });
    });
  }

  /**
   * Stops the HTTP API endpoint.
   */
  async close(): Promise<void> {
    // promisify http.Server.close() and await on it
    await new Promise<void>((resolve, reject) => {
      this.#server.close((err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.server.closeAllConnections();
  }
}
