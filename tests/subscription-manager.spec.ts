import http from 'node:http';
import type { AddressInfo } from 'ws';
import { WebSocket, type WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { DidKeyResolver, SubscriptionRequest } from '@tbd54566975/dwn-sdk-js';

import { Jws } from '@tbd54566975/dwn-sdk-js';
import { assert } from 'chai';
import { createProfile } from './utils.js';
import type { Profile } from './utils.js';
import { WsApi } from '../src/ws-api.js';
import { createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { clear as clearDwn, dwn } from './test-dwn.js';

describe('Subscription Manager Test', async () => {
  let server: http.Server;
  let wsServer: WebSocketServer;
  let alice: Profile;
  let socket: WebSocket;

  before(async () => {
    // create listeners...
    server = http.createServer();
    server.listen(9002, '127.0.0.1');

    const wsApi = new WsApi(server, dwn);
    wsServer = wsApi.start();
    alice = await createProfile();
    // starts the ws server
    // create subscription manager...
    return;
  });

  // before each, clear the subscriptions
  beforeEach(async () => {
    // subscriptionManager.clear();
  });

  afterEach(async () => {
    await clearDwn();
  });

  // close at the end
  after(async () => {
    //await subscriptionManager.close();
    wsServer.close();
    server.close();
    server.closeAllConnections();
    if (socket) {
      socket.close();
    }
  });

  it('test subscription manager registration', async () => {
    try {
      const signer = await DidKeyResolver.generate();
      const req = await SubscriptionRequest.create({
        signer: Jws.createSigner(signer),
      });

      const port = (wsServer.address() as AddressInfo).port;
      const ip = (wsServer.address() as AddressInfo).address;
      const addr = `ws://${ip}:${port}`;
      const socket = new WebSocket(addr);

      const socketPromise = new Promise<any>((resolve, reject) => {
        // set up lisetner...
        socket.onmessage = (event): Promise<void> => {
          try {
            console.log('got message');
            resolve(event);
            return;
          } catch (error) {
            reject(error);
          }
        };

        socket.onerror = (error): void => {
          reject(error); // Reject the promise if there's an error with the socket
        };

        socket.onclose = (event): void => {
          if (event.wasClean) {
            console.log(
              `Connection closed cleanly, code=${event.code}, reason=${event.reason}`,
            );
          } else {
            console.error(`Connection abruptly closed`);
          }
          reject(new Error(`Connection closed: ${event.reason}`)); // Reject the promise on socket close
        };

        socket.onopen = async (): Promise<void> => {
          const requestId = uuidv4();
          const dwnRequest = createJsonRpcRequest(
            requestId,
            'dwn.processMessage',
            {
              message: req.toJSON(),
              target: alice.did,
            },
          );
          try {
            if (socket.readyState !== WebSocket.OPEN) {
              reject(new Error('socket not open'));
            }
            socket.send(JSON.stringify(dwnRequest));
          } catch (error) {
            reject(error);
          }
          return;
        };
      });
      await socketPromise;
    } catch (error) {
      assert.fail(error, undefined, 'failed to register subscription' + error);
    }
  });
});
