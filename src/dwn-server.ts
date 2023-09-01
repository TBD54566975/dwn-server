import type { Config } from './config.js';
import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';

import { Dwn } from '@tbd54566975/dwn-sdk-js';

import { WsApi } from './ws-api.js';
import { HttpApi } from './http-api.js';
import { config as defaultConfig } from './config.js';
import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';
import { setProcessHandlers } from './process-handlers.js';
import { getDWNConfig } from './storage.js';

export type DwnServerOptions = {
  dwn?: Dwn;
  config?: Config;
};

export class DwnServer {
  dwn?: Dwn;
  config: Config;
  httpServerShutdownHandler: HttpServerShutdownHandler;

  constructor(options: DwnServerOptions = {}) {
    this.config = options.config ?? defaultConfig;
    this.dwn = options.dwn;
    log.setLevel(this.config.logLevel as log.LogLevelDesc);
    prefix.reg(log);
    prefix.apply(log);
  }

  async start() : Promise<void> {
    await this.listen();
    setProcessHandlers(this);
  }

  async listen(): Promise<void> {
    if (!this.dwn) {
      this.dwn = await Dwn.create(getDWNConfig(this.config));
    }

    const httpApi = new HttpApi(this.dwn);
    const httpServer = httpApi.listen(this.config.port, () => {
      log.info(`server listening on port ${this.config.port}`);
    });

    this.httpServerShutdownHandler = new HttpServerShutdownHandler(httpServer);

    if (this.config.webSocketServerEnabled) {
      const wsServer = new WsApi(httpServer, this.dwn);
      wsServer.listen();
    }
  }

  stop(callback: () => void) {
    this.httpServerShutdownHandler.stop(callback);
  }
}