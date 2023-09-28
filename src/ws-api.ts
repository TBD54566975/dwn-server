import { base64url } from 'multiformats/bases/base64';
import { v4 as uuidv4 } from 'uuid';
import { DataStream, type Dwn } from '@tbd54566975/dwn-sdk-js';
import { type IncomingMessage, type Server } from 'http';
import { type AddressInfo, type WebSocket, WebSocketServer } from 'ws';

import { jsonRpcApi } from './json-rpc-api.js';
import type { RequestContext } from './lib/json-rpc-router.js';
import { requestCounter } from './metrics.js';
import {
  createJsonRpcErrorResponse,
  JsonRpcErrorCodes,
  type JsonRpcResponse,
} from './lib/json-rpc.js';
import {
  SubscriptionManager,
  type SubscriptionController,
} from './subscription-manager.js';

const SOCKET_ISALIVE_SYMBOL = Symbol('isAlive');
const HEARTBEAT_INTERVAL = 30_000;

export class WsApi {
  #wsServer: WebSocketServer;
  dwn: Dwn;
  #subscriptionManager: SubscriptionController;

  constructor(server: Server, dwn: Dwn) {
    this.dwn = dwn;
    this.#wsServer = new WebSocketServer({ server });
    this.#subscriptionManager = new SubscriptionManager({
      dwn: dwn,
      tenant: 'asdf',
      wss: this.#wsServer,
    });
  }

  // TODO: github.com/TBD54566975/dwn-server/issues/49 Add code coverage tracker, similar to either dwn-sdk-js or to web5-js
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
    const dwn = this.dwn;

    socket[SOCKET_ISALIVE_SYMBOL] = true;

    // Pong messages are automatically sent in response to ping messages as required by
    // the websocket spec. So, no need to send explicit pongs from browser
    socket.on('pong', function () {
      this[SOCKET_ISALIVE_SYMBOL] = true;
    });

    socket.on('close', function () {
      // Clean up event listeners
      socket.removeAllListeners();
    });

    socket.on('error', function (error) {
      console.error('WebSocket error:', error);
      // Close the socket and remove all event listeners
      socket.terminate();
      socket.removeAllListeners();
    });

    socket.on('message', async function (dataBuffer) {
      let dwnRequest;
      try {
        // deserialize bytes into JSON object
        dwnRequest = dataBuffer.toString();
        if (!dwnRequest) {
          const jsonRpcResponse = createJsonRpcErrorResponse(
            uuidv4(),
            JsonRpcErrorCodes.BadRequest,
            'request payload required.',
          );

          const responseBuffer = WsApi.jsonRpcResponseToBuffer(jsonRpcResponse);
          return socket.send(responseBuffer);
        }
        dwnRequest = JSON.parse(dwnRequest);
      } catch (e) {
        const jsonRpcResponse = createJsonRpcErrorResponse(
          uuidv4(),
          JsonRpcErrorCodes.BadRequest,
          e.message,
        );
        const responseBuffer = WsApi.jsonRpcResponseToBuffer(jsonRpcResponse);
        return socket.send(responseBuffer);
      }

      // Check whether data was provided in the request
      const { encodedData } = dwnRequest.params;
      const requestDataStream = encodedData
        ? DataStream.fromBytes(base64url.baseDecode(encodedData))
        : undefined;

      const requestContext: RequestContext = {
        dwn,
        transport: 'ws',
        dataStream: requestDataStream,
      };

      const { jsonRpcResponse } = await jsonRpcApi.handle(
        dwnRequest,
        requestContext,
      );

      if (jsonRpcResponse.error) {
        requestCounter.inc({ method: dwnRequest.method, error: 1 });
      } else {
        requestCounter.inc({
          method: dwnRequest.method,
          status: jsonRpcResponse?.result?.reply?.status?.code || 0,
        });
      }

      const responseBuffer = WsApi.jsonRpcResponseToBuffer(jsonRpcResponse);
      return socket.send(responseBuffer);
    });
  }

  #setupHeartbeat(): NodeJS.Timer {
    // Sometimes connections between client <-> server can get borked in such a way that
    // leaves both unaware of the borkage. ping messages can be used as a means to verify
    // that the remote endpoint is still responsive. Server will ping each socket every 30s
    // if a pong hasn't received from a socket by the next ping, the server will terminate
    // the socket connection
    return setInterval(() => {
      this.#wsServer.clients.forEach(function (socket) {
        if (socket[SOCKET_ISALIVE_SYMBOL] === false) {
          return socket.terminate();
        }

        socket[SOCKET_ISALIVE_SYMBOL] = false;
        socket.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }

  #setupWebSocket(): void {
    this.#wsServer.on('connection', this.#handleConnection.bind(this));
    const heartbeatInterval = this.#setupHeartbeat();
    this.#wsServer.on('close', function close() {
      clearInterval(heartbeatInterval);
    });
  }

  start(callback?: () => void): WebSocketServer {
    this.#setupWebSocket();
    callback?.();
    return this.#wsServer;
  }

  close(): void {
    this.#wsServer.close();
  }

  static jsonRpcResponseToBuffer(jsonRpcResponse: JsonRpcResponse): Buffer {
    const str = JSON.stringify(jsonRpcResponse);
    return Buffer.from(str);
  }
}
