import { Dwn } from '@tbd54566975/dwn-sdk-js';
import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import type { Server } from 'http';
import { type WebSocketServer } from 'ws';

import { getDWNConfig } from './storage.js';
import { HttpApi } from './http-api.js';
import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';
import { setProcessHandlers } from './process-handlers.js';
import { WsApi } from './ws-api.js';
import { type Config, config as defaultConfig } from './config.js';

export type DwnServerOptions = {
  dwn?: Dwn;
  config?: Config;
};

export class DwnServer {
  dwn?: Dwn;
  config: Config;
  #httpServerShutdownHandler: HttpServerShutdownHandler;
  #httpApi: HttpApi;
  #wsApi: WsApi;

  constructor(options: DwnServerOptions = {}) {
    this.config = options.config ?? defaultConfig;
    this.dwn = options.dwn;

    log.setLevel(this.config.logLevel as log.LogLevelDesc);

    prefix.reg(log);
    prefix.apply(log);
  }

  async start(callback?: () => void): Promise<void> {
    await this.#setupServer();
    setProcessHandlers(this);
    callback?.();
  }

  async #setupServer(): Promise<void> {
    if (!this.dwn) {
      this.dwn = await Dwn.create(getDWNConfig(this.config));
    }

    this.#httpApi = new HttpApi(this.dwn);
    this.#httpApi.start(this.config.port, () => {
      log.info(`HttpServer listening on port ${this.config.port}`);
    });

    this.#httpServerShutdownHandler = new HttpServerShutdownHandler(
      this.#httpApi.server,
    );

    if (this.config.webSocketServerEnabled) {
      this.#wsApi = new WsApi(this.#httpApi.server, this.dwn);
      this.#wsApi.start(() => log.info(`WebSocketServer ready...`));
    }
  }

  stop(callback: () => void): void {
    this.#httpServerShutdownHandler.stop(callback);
  }

  get httpServer(): Server {
    return this.#httpApi.server;
  }

  get wsServer(): WebSocketServer {
    return this.#wsApi.server;
  }
}
