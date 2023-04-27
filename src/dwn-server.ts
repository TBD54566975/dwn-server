import type { Config } from './config.js';

import { Dwn, DataStoreLevel, EventLogLevel, MessageStoreLevel } from '@tbd54566975/dwn-sdk-js';

import { WsApi } from './ws-api.js';
import { HttpApi } from './http-api.js';
import { config as defaultConfig } from './config.js';
import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';

export type DwnServerOptions = {
  dwn?: Dwn;
  config?: Config;
};

export class DwnServer {
  dwn: Dwn;
  config: Config;
  httpServerShutdownHandler: HttpServerShutdownHandler;

  constructor(options: DwnServerOptions = {}) {
    this.config = options.config ?? defaultConfig;
    this.dwn = options.dwn;
  }

  async listen(): Promise<void> {
    if (!this.dwn) {
      const dataStore = new DataStoreLevel({ blockstoreLocation: 'data/DATASTORE' });
      const eventLog = new EventLogLevel({ location: 'data/EVENTLOG' });
      const messageStore = new MessageStoreLevel({
        blockstoreLocation : 'data/MESSAGESTORE',
        indexLocation      : 'data/INDEX'
      });

      this.dwn = await Dwn.create({ eventLog, dataStore, messageStore });
    }

    const httpApi = new HttpApi(this.dwn);
    const httpServer = httpApi.listen(this.config.port, () => {
      console.log(`server listening on port ${this.config.port}`);
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