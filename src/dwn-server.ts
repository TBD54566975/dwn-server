import type { Config } from './config.js';

import { config as defaultConfig } from './config.js';
import { Dwn } from '@tbd54566975/dwn-sdk-js';
import { getDWNConfig } from './storage.js';
import { getJsonRpcApi } from './json-rpc-api.js';
import { HttpApi } from './http-api.js';
import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';
import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import { setProcessHandlers } from './process-handlers.js';
import { Web5Connect } from './json-rpc-handlers/connect/connect.js';
import { WsApi } from './ws-api.js';

export type DwnServerOptions = {
  dwn?: Dwn;
  connect?: Web5Connect;
  config?: Config;
};

export class DwnServer {
  dwn?: Dwn;
  config: Config;
  connect?: Web5Connect;
  httpServerShutdownHandler: HttpServerShutdownHandler;

  constructor(options: DwnServerOptions = {}) {
    this.config = options.config ?? defaultConfig;
    this.dwn = options.dwn;
    this.connect = options.connect;
    log.setLevel(this.config.logLevel as log.LogLevelDesc);
    prefix.reg(log);
    prefix.apply(log);
  }

  async start(): Promise<void> {
    await this.listen();
    setProcessHandlers(this);
  }

  async listen(): Promise<void> {
    if (!this.dwn) {
      this.dwn = await Dwn.create(getDWNConfig(this.config));
    }

    if (!this.connect && this.config.connectStore) {
      this.connect = await Web5Connect.WithStoreUrl(this.config.connectStore);
    }

    const rpcRouter = getJsonRpcApi(this.connect);

    const httpApi = new HttpApi(this.dwn, rpcRouter);
    const httpServer = httpApi.listen(this.config.port, () => {
      log.info(`server listening on port ${this.config.port}`);
    });

    this.httpServerShutdownHandler = new HttpServerShutdownHandler(httpServer);

    if (this.config.webSocketServerEnabled) {
      const wsServer = new WsApi(httpServer, this.dwn, rpcRouter);
      wsServer.listen();
    }
  }

  stop(callback: () => void): void {
    this.httpServerShutdownHandler.stop(callback);
    if (this.connect) {
      this.connect.shutdown();
    }
  }
}
