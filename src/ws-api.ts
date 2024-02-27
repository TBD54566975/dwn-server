
import type {
  Dwn,
} from '@tbd54566975/dwn-sdk-js';

import type { Server } from 'http';

import { WebSocketServer } from 'ws';

import type { ConnectionManager } from './connection/connection-manager.js';
import { InMemoryConnectionManager } from './connection/connection-manager.js';

export class WsApi {
  #wsServer: WebSocketServer;
  dwn: Dwn;
  #connectionManager: ConnectionManager

  constructor(server: Server, dwn: Dwn, connectionManager?: ConnectionManager) {
    this.dwn = dwn;
    this.#connectionManager = connectionManager || new InMemoryConnectionManager(dwn);
    this.#wsServer = new WebSocketServer({ server });
  }

  get server(): WebSocketServer {
    return this.#wsServer;
  }

  /**
   * Handler for starting a WebSocket.
   * Sets listeners for `connection`, `close` events.
   */
  #setupWebSocket(): void {
    this.#wsServer.on('connection', (socket, request) => this.#connectionManager.connect(socket, request));
    this.#wsServer.on('close', () => this.#connectionManager.closeAll());
  }

  start(): WebSocketServer {
    this.#setupWebSocket();
    return this.#wsServer;
  }

  async close(): Promise<void> {
    this.#wsServer.close();
    await this.#connectionManager.closeAll();
  }
}
