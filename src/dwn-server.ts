import type { DidResolver } from '@web5/dids';
import type { EventStream } from '@tbd54566975/dwn-sdk-js';
import type { ProcessHandlers } from './process-handlers.js';
import type { Server } from 'http';
import type { WebSocketServer } from 'ws';
import type { DwnServerConfig } from './config.js';

import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import { config as defaultConfig } from './config.js';
import { getDwnConfig } from './storage.js';
import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';
import { HttpApi } from './http-api.js';
import { RegistrationManager } from './registration/registration-manager.js';
import { WsApi } from './ws-api.js';
import { Dwn, EventEmitterStream } from '@tbd54566975/dwn-sdk-js';
import { removeProcessHandlers, setProcessHandlers } from './process-handlers.js';

/**
 * Options for the DwnServer constructor.
 * This is different to DwnServerConfig in that the DwnServerConfig defines configuration that come from environment variables so (more) user facing.
 * Where as DwnServerOptions wraps DwnServerConfig with additional overrides that can be used for testing.
 */
export type DwnServerOptions = {
  /**
   * A custom DID resolver to use in the DWN.
   * Mainly for testing purposes. Ignored if `dwn` is provided.
   */
  didResolver?: DidResolver;
  dwn?: Dwn;
  config?: DwnServerConfig;
};

/**
 * State of the DwnServer, either Stopped or Started, to help short-circuit start and stop logic.
 */
enum DwnServerState {
  Stopped,
  Started
}

export class DwnServer {
  serverState = DwnServerState.Stopped;
  processHandlers: ProcessHandlers;
  
  /**
   * A custom DID resolver to use in the DWN.
   * Mainly for testing purposes. Ignored if `dwn` is provided.
   */
  didResolver?: DidResolver;
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

    this.didResolver = options.didResolver;
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

      const dwnConfig = await getDwnConfig(this.config, {
        didResolver: this.didResolver,
        tenantGate: registrationManager,
        eventStream,
      })
      this.dwn = await Dwn.create(dwnConfig);
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

    await this.dwn.close();
    await this.#httpApi.close();

    // close WebSocket server if it was initialized
    if (this.#wsApi !== undefined) {
      await this.#wsApi.close();
    }

    await new Promise<void>((resolve) => {
      this.#httpServerShutdownHandler.stop(() => {
        resolve();
      });
    });

    removeProcessHandlers(this.processHandlers);

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
