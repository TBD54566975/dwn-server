import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import type { RequestContext } from './lib/json-rpc-router.js';

import { Server } from 'http';

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import { DataStream } from '@tbd54566975/dwn-sdk-js';
import { base64url } from 'multiformats/bases/base64';

import { jsonRpcApi } from './json-rpc-api.js';
import { createJsonRpcErrorResponse, JsonRpcErrorCodes, JsonRpcResponse } from './lib/json-rpc.js';

const SOCKET_ISALIVE_SYMBOL = Symbol('isAlive');

export class WsApi {
  wsServer: WebSocketServer;
  dwn: Dwn;

  constructor(server: Server, dwn: Dwn) {
    this.dwn = dwn;
    this.wsServer = new WebSocketServer({ server: server });
  }

  get address() {
    return this.wsServer.address;
  }

  listen() {
    const dwn = this.dwn;
    this.wsServer.on('connection', function (socket: WebSocket, _request, _client) {
      socket[SOCKET_ISALIVE_SYMBOL] = true;

      // Pong messages are automatically sent in response to ping messages as required by
      // the websocket spec. So, no need to send explicit pongs from browser
      socket.on('pong', function() {
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

      socket.on('message', async function(dataBuffer) {
        let dwnRequest;

        try {
          // deserialize bytes into JSON object
          dwnRequest = dataBuffer.toString();
          if (!dwnRequest) {
            const jsonRpcResponse = createJsonRpcErrorResponse(uuidv4(),
              JsonRpcErrorCodes.BadRequest, 'request payload required.');

            const responseBuffer = WsApi.jsonRpcResponseToBuffer(jsonRpcResponse);
            return socket.send(responseBuffer);
          }

          dwnRequest = JSON.parse(dwnRequest);
        } catch (e) {
          const jsonRpcResponse = createJsonRpcErrorResponse(
            uuidv4(), JsonRpcErrorCodes.BadRequest, e.message);

          const responseBuffer = WsApi.jsonRpcResponseToBuffer(jsonRpcResponse);
          return socket.send(responseBuffer);
        }

        // Check whether data was provided in the request
        const { encodedData } = dwnRequest.params;
        const requestDataStream = encodedData ? DataStream.fromBytes(base64url.baseDecode(encodedData)) : undefined;

        const requestContext: RequestContext = { dwn, transport: 'ws', dataStream: requestDataStream };
        const { jsonRpcResponse } = await jsonRpcApi.handle(dwnRequest, requestContext);

        const responseBuffer = WsApi.jsonRpcResponseToBuffer(jsonRpcResponse);
        return socket.send(responseBuffer);
      });
    });

    // Sometimes connections between client <-> server can get borked in such a way that
    // leaves both unaware of the borkage. ping messages can be used as a means to verify
    // that the remote endpoint is still responsive. Server will ping each socket every 30s
    // if a pong hasn't received from a socket by the next ping, the server will terminate
    // the socket connection
    const heartbeatInterval = setInterval(() => {
      this.wsServer.clients.forEach(function (socket) {
        if (socket[SOCKET_ISALIVE_SYMBOL] === false) {
          return socket.terminate();
        }

        socket[SOCKET_ISALIVE_SYMBOL] = false;
        socket.ping();
      });
    }, 30_000);

    this.wsServer.on('close', function close() {
      clearInterval(heartbeatInterval);
    });
  }

  close() {
    this.wsServer.close();
  }

  private static jsonRpcResponseToBuffer(jsonRpcResponse: JsonRpcResponse) {
    const str = JSON.stringify(jsonRpcResponse);
    return Buffer.from(str);
  }
}