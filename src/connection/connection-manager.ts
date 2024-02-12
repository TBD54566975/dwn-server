import type { Dwn } from "@tbd54566975/dwn-sdk-js";

import type { WebSocket } from 'ws';

import { SocketConnection } from "./socket-connection.js";
import { InMemorySubscriptionManager } from "../subscription-manager.js";

export interface ConnectionManager {
  connect(socket: WebSocket): Promise<void>;
  close(): Promise<void>
}

export class InMemoryConnectionManager implements ConnectionManager {
  constructor(private dwn: Dwn, private connections: Map<WebSocket, SocketConnection> = new Map()) {}

  /**
   * Handler for opening websocket event - `connection`.
   * Sets listeners for `message`, `pong`, `close`, and `error` events.
   */
  async connect(socket: WebSocket): Promise<void> {
    const connection = new SocketConnection(socket, this.dwn, new InMemorySubscriptionManager());
    this.connections.set(socket, connection);
    // attach to the socket's close handler to clean up this connection.
    socket.on('close', () => {
      // the connection internally already cleans itself up upon a socket close event, we just ned to remove it from our set.
      this.connections.delete(socket);
    });
  }

  async close(): Promise<void> {
    const closePromises = [];
    this.connections.forEach(connection => closePromises.push(connection.close()));
    await Promise.all(closePromises);
  }
}