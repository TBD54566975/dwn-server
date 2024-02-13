
import type {
  Dwn,
} from '@tbd54566975/dwn-sdk-js';

import type { AddressInfo } from 'ws';
import type { Server } from 'http';

import { WebSocketServer } from 'ws';

import type { ConnectionManager } from './connection/connection-manager.js';
import { InMemoryConnectionManager } from './connection/connection-manager.js';

export class WsApi {
  #wsServer: WebSocketServer;
  dwn: Dwn;
  #connections: ConnectionManager

  constructor(server: Server, dwn: Dwn, connectionManager?: ConnectionManager) {
    this.dwn = dwn;
    this.#connections = connectionManager || new InMemoryConnectionManager(dwn);
    this.#wsServer = new WebSocketServer({ server });
  }

  get address(): AddressInfo | string {
    return this.#wsServer.address();
  }

  get server(): WebSocketServer {
    return this.#wsServer;
  }

  /**
   * Handler for starting a WebSocket.
   * Sets listeners for `connection`, `close` events.
   * It clears `heartbeatInterval` when a `close` event is made.
   */
  #setupWebSocket(): void {
    this.#wsServer.on('connection', this.#connections.connect.bind(this));
    this.#wsServer.on('close', this.#connections.close.bind(this));
  }

  start(callback?: () => void): WebSocketServer {
    this.#setupWebSocket();
    callback?.();
    return this.#wsServer;
  }

  async close(): Promise<void> {
    this.#wsServer.close();
    await this.#connections.closeAll();
  }
}
