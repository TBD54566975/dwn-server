import type { Dwn } from "@tbd54566975/dwn-sdk-js";

import type { IncomingMessage } from "http";
import type { WebSocket } from 'ws';

import { SocketConnection } from "./socket-connection.js";

/**
 * Interface for managing `WebSocket` connections as they arrive.
 */
export interface ConnectionManager {
  /** connect handler used for the `WebSockets` `'connection'` event. */
  connect(socket: WebSocket, request?: IncomingMessage): Promise<void>;
  /** closes all of the connections */
  closeAll(): Promise<void>
}

/**
 * A Simple In Memory ConnectionManager implementation.
 * It uses a `Map<WebSocket, SocketConnection>` to manage connections.
 */
export class InMemoryConnectionManager implements ConnectionManager {
  constructor(private dwn: Dwn, private connections: Map<WebSocket, SocketConnection> = new Map()) {}

  async connect(socket: WebSocket): Promise<void> {
    const connection = new SocketConnection(socket, this.dwn);
    this.connections.set(socket, connection);
    // attach to the socket's close handler to clean up this connection.
    socket.on('close', () => {
      // the connection internally already cleans itself up upon a socket close event, we just ned to remove it from our set.
      this.connections.delete(socket);
    });
  }

  async closeAll(): Promise<void> {
    const closePromises = [];
    this.connections.forEach(connection => closePromises.push(connection.close()));
    await Promise.all(closePromises);
  }
}