import type { EventStream } from '@tbd54566975/dwn-sdk-js';
import { Dwn, EventEmitterStream } from '@tbd54566975/dwn-sdk-js';

import type { ProcessHandlers } from './process-handlers.js';
import type { Server } from 'http';
import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import { type WebSocketServer } from 'ws';

import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';

import { type DwnServerConfig, config as defaultConfig } from './config.js';
import { HttpApi } from './http-api.js';
import { setProcessHandlers, unsetProcessHandlers } from './process-handlers.js';
import { getDWNConfig } from './storage.js';
import { WsApi } from './ws-api.js';
import { RegistrationManager } from './registration/registration-manager.js';

export type DwnServerOptions = {
  dwn?: Dwn;
  config?: DwnServerConfig;
};

export enum DwnServerState {
  Stopped,
  Started
}

export class DwnServer {
  serverState = DwnServerState.Stopped;
  processHandlers: ProcessHandlers;
  dwn?: Dwn;
  config: DwnServerConfig;
  #httpServerShutdownHandler: HttpServerShutdownHandler;
  #httpApi: HttpApi;
  #wsApi: WsApi;

  /**
   * @param options.dwn - Dwn instance to use as an override. Registration endpoint will not be enabled if this is provided.
   */
  constructor(options: DwnServerOptions = {}) {
    this.config = options.config ?? defaultConfig;
    this.dwn = options.dwn;

    log.setLevel(this.config.logLevel as log.LogLevelDesc);

    prefix.reg(log);
    prefix.apply(log);
  }

  /**
   * Starts the DWN server.
   */
  async start(): Promise<void> {
    if (this.serverState === DwnServerState.Started) {
      return;
    }

    await this.#setupServer();
    this.processHandlers = setProcessHandlers(this);
    this.serverState = DwnServerState.Started;
  }

  /**
   * Function to setup the servers (HTTP and WebSocket)
   * The DWN creation is secondary and only happens if it hasn't already been done.
   */
  async #setupServer(): Promise<void> {

    let registrationManager: RegistrationManager;
    if (!this.dwn) {
      // undefined registrationStoreUrl is used as a signal that there is no need for tenant registration, DWN is open for all.
      registrationManager = await RegistrationManager.create({
        registrationStoreUrl: this.config.registrationStoreUrl,
        termsOfServiceFilePath: this.config.termsOfServiceFilePath,
        proofOfWorkChallengeNonceSeed: this.config.registrationProofOfWorkSeed,
        proofOfWorkInitialMaximumAllowedHash: this.config.registrationProofOfWorkInitialMaxHash,
      });

      let eventStream: EventStream | undefined;
      if (this.config.webSocketSupport) {
        // setting `EventEmitterStream` as default the default `EventStream
        // if an alternate implementation is needed, instantiate a `Dwn` with a custom `EventStream` and add it to server options. 
        eventStream = new EventEmitterStream();
      }

      this.dwn = await Dwn.create(getDWNConfig(this.config, {
        tenantGate: registrationManager,
        eventStream,
      }));
    }

    this.#httpApi = await HttpApi.create(this.config, this.dwn, registrationManager);

    await this.#httpApi.start(this.config.port);
    log.info(`HttpServer listening on port ${this.config.port}`);

    this.#httpServerShutdownHandler = new HttpServerShutdownHandler(
      this.#httpApi.server,
    );

    if (this.config.webSocketSupport) {
      this.#wsApi = new WsApi(this.#httpApi.server, this.dwn);
      this.#wsApi.start();
      log.info('WebSocketServer ready...');
    }
  }

  /**
   * Stops the DWN server.
   */
  async stop(): Promise<void> {
    if (this.serverState === DwnServerState.Stopped) {
      return;
    }

    // F YEAH!
    if (this.dwn['didResolver']['cache']['cache']) {
      await this.dwn['didResolver']['cache']['cache']['close']();
    }

    await this.dwn.close();
    await this.#httpApi.stop();

    // close WebSocket server if it was initialized
    if (this.#wsApi !== undefined) {
      await this.#wsApi.close();
    }

    await new Promise<void>((resolve) => {
      this.#httpServerShutdownHandler.stop(() => {
        resolve();
      });
    });

    unsetProcessHandlers(this.processHandlers);

    this.serverState = DwnServerState.Stopped;
  }

  get httpServer(): Server {
    return this.#httpApi.server;
  }

  get wsServer(): WebSocketServer | undefined {
    return this.#wsApi?.server;
  }

  /**
   * Gets the RegistrationManager for testing purposes.
   */
  get registrationManager(): RegistrationManager {
    return this.#httpApi.registrationManager;
  }
}
