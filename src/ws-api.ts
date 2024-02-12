import type { AddressInfo, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';

import log from 'loglevel';
import { WebSocketServer } from 'ws';

import type {
  Dwn,
  GenericMessage,
  MessageSubscription,
} from '@tbd54566975/dwn-sdk-js'

import { DwnMethodName } from '@tbd54566975/dwn-sdk-js';

import type { RequestContext } from './lib/json-rpc-router.js';
import type { JsonRpcErrorResponse, JsonRpcId, JsonRpcRequest, JsonRpcResponse } from './lib/json-rpc.js';

import { jsonRpcApi } from './json-rpc-api.js';
import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes
} from './lib/json-rpc.js';
import { requestCounter } from './metrics.js';
import { DwnServerError, DwnServerErrorCode } from './dwn-error.js';


const SOCKET_ISALIVE_SYMBOL = Symbol('isAlive');
const HEARTBEAT_INTERVAL = 30_000;

export interface SubscriptionManager {
  subscribe: (target: string, subscription: MessageSubscription) => Promise<void>;
  close: (target: string, id: string) => Promise<void>;
  closeAll: () => Promise<void>;
}

class Manager {
  constructor(private subscriptions: Map<string, Map<string, MessageSubscription>> = new Map()){};
  async subscribe(target: string, subscription: MessageSubscription): Promise<void> {
    let targetSubscriptions = this.subscriptions.get(target);
    if (targetSubscriptions === undefined) {
      targetSubscriptions = new Map();
      this.subscriptions.set(target, targetSubscriptions);
    }
    targetSubscriptions.set(subscription.id, subscription);
  }

  async close(target: string, id: string): Promise<void> {
    const targetSubscriptions = this.subscriptions.get(target);
    if (targetSubscriptions !== undefined) {
      const subscription = targetSubscriptions.get(id);
      if (subscription !== undefined) {
        targetSubscriptions.delete(id);
        await subscription.close();
        return;
      }
    }

    // if it reached here no subscription to close
    throw new DwnServerError(
      DwnServerErrorCode.SubscriptionManagerSubscriptionNotFound,
      `subscription ${id} was not found`
    )
  }

  async closeAll(): Promise<void> {
    const closePromises = [];
    for (const [target, subscriptions] of this.subscriptions) {
      this.subscriptions.delete(target);
      for (const [id, subscription] of subscriptions) {
        subscriptions.delete(id);
        closePromises.push(subscription.close());
      }
    }

    await Promise.all(closePromises);
  }
}

export class SocketConnection {
  constructor(
    private socket: WebSocket,
    private dwn: Dwn,
    private subscriptions: SubscriptionManager = new Manager(),
  ){
    socket.on('close', this.close.bind(this));
    socket.on('pong', this.pong.bind(this));
    socket.on('error', this.error.bind(this));
    socket.on('message', this.message.bind(this));
    socket[SOCKET_ISALIVE_SYMBOL] = true;
  }

  get isAlive(): boolean {
    return this.socket[SOCKET_ISALIVE_SYMBOL];
  }

  /**
   * Closes the existing connection and cleans up any listeners or subscriptions.
   */
  async close(): Promise<void> {
    // clean up all socket event listeners
    this.socket.removeAllListeners();

    // close all of the associated subscriptions
    await this.subscriptions.closeAll();
  }

  ping(): void {
    this.socket[SOCKET_ISALIVE_SYMBOL] = false;
    this.socket.ping();
  }

  /**
   * Pong messages are automatically sent in response to ping messages as required by
   * the websocket spec. So, no need to send explicit pongs from browser
   */
  private pong(): void {
    this.socket[SOCKET_ISALIVE_SYMBOL] = true;
  }

  private async error(error?:Error): Promise<void>{
    if (error !== undefined) {
      log.error('WebSocket', this.socket.url, error);
      this.socket.terminate();
      await this.close()
    }
  }

  private async message(dataBuffer: Buffer): Promise<void> {
    const requestData = dataBuffer.toString();
    if (!requestData) {
      return this.send(createJsonRpcErrorResponse(
        crypto.randomUUID(),
        JsonRpcErrorCodes.BadRequest,
        'request payload required.'
      ))
    }

    let jsonRequest: JsonRpcRequest;
    try {
      jsonRequest = JSON.parse(requestData);
    } catch(error) {
      const errorResponse = createJsonRpcErrorResponse(
        crypto.randomUUID(),
        JsonRpcErrorCodes.BadRequest,
        (error as Error).message
      );

      return this.send(errorResponse);
    };

    const requestContext = await this.buildRequestContext(jsonRequest);
    const { jsonRpcResponse } = await jsonRpcApi.handle(jsonRequest, requestContext);
    if (jsonRpcResponse.error) {
      requestCounter.inc({ method: jsonRequest.method, error: 1 });
    } else {
      requestCounter.inc({
        method: jsonRequest.method,
        status: jsonRpcResponse?.result?.reply?.status?.code || 0,
      });
    }

    this.send(jsonRpcResponse);
  }

  private send(response: JsonRpcResponse | JsonRpcErrorResponse): void {
    this.socket.send(Buffer.from(JSON.stringify(response)), this.error.bind(this));
  }

  private subscriptionHandler(id: JsonRpcId): (message: GenericMessage) => void {
    return (message) => {
      const response = createJsonRpcSuccessResponse(id, { reply: {
        record : message
      } });
      this.send(response);
    }
  }

  private async buildRequestContext(request: JsonRpcRequest): Promise<RequestContext> {
    const { id, params, method} = request;
    const requestContext: RequestContext = {
      transport           : 'ws',
      dwn                 : this.dwn,
      subscriptionManager : this.subscriptions,
    }

    if (method === 'dwn.processMessage') {
      const { message } = params as { message: GenericMessage };
      if (message.descriptor.method === DwnMethodName.Subscribe) {
        requestContext.subscriptionHandler = this.subscriptionHandler(id).bind(this);
      }
    }

    return requestContext;
  }
}

export class WsApi {
  #wsServer: WebSocketServer;
  dwn: Dwn;

  #heartbeatInterval: NodeJS.Timer | undefined;
  #connections: Map<WebSocket, SocketConnection> = new Map();

  constructor(server: Server, dwn: Dwn) {
    this.dwn = dwn;
    this.#wsServer = new WebSocketServer({ server });
  }

  get address(): AddressInfo | string {
    return this.#wsServer.address();
  }

  get server(): WebSocketServer {
    return this.#wsServer;
  }

  /**
   * Handler for opening websocket event - `connection`.
   * Sets listeners for `message`, `pong`, `close`, and `error` events.
   */
  #handleConnection(socket: WebSocket, _request: IncomingMessage): void {
    const connection = new SocketConnection(socket, this.dwn);
    this.#connections.set(socket, connection);
    // attach to the socket's close handler to clean up this connection.
    socket.on('close', () => {
      // the connection internally already cleans itself up upon a socket close event, we just ned to remove it from our set.
      this.#connections.delete(socket);
    });
  }
  /**
   * This handler returns an interval to ping clients' socket every 30s
   * if a pong hasn't received from a socket by the next ping, the server will terminate the socket connection.
   */
  #setupHeartbeat(): NodeJS.Timer {
    if (this.#heartbeatInterval) {
      return this.#heartbeatInterval;
    }
    // Sometimes connections between client <-> server can get borked in such a way that
    // leaves both unaware of the borkage. ping messages can be used as a means to verify
    // that the remote endpoint is still responsive. Server will ping each socket every 30s
    // if a pong hasn't received from a socket by the next ping, the server will terminate
    // the socket connection
    this.#heartbeatInterval = setInterval(() => {
      this.#connections.forEach(async (connection) => {
        if (connection.isAlive === false) {
          return await connection.close();
        }

        connection.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Handler for starting a WebSocket.
   * Sets listeners for `connection`, `close` events.
   * It clears `heartbeatInterval` when a `close` event is made.
   */
  #setupWebSocket(): void {
    this.#wsServer.on('connection', this.#handleConnection.bind(this));

    const heartbeatInterval = this.#setupHeartbeat();

    this.#wsServer.on('close', function close() {
      clearInterval(heartbeatInterval);
    });
  }

  start(): WebSocketServer {
    this.#setupWebSocket();
    return this.#wsServer;
  }

  async close(): Promise<void> {
    this.#wsServer.close();
    for (const [socket, connection] of this.#connections) {
      this.#connections.delete(socket);
      await connection.close()
    }
  }
}
