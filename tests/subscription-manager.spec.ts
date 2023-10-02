import http from 'node:http';
import type { AddressInfo } from 'ws';
import { WebSocket, type WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import {
  DataStream,
  DidKeyResolver,
  SubscriptionRequest,
} from '@tbd54566975/dwn-sdk-js';

import { Jws } from '@tbd54566975/dwn-sdk-js';
import { assert } from 'chai';
import { createProfile, createRecordsWriteMessage } from './utils.js';
import type { Profile } from './utils.js';
import { WsApi } from '../src/ws-api.js';
import { createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { clear as clearDwn, dwn } from './test-dwn.js';
import { base64url } from 'multiformats/bases/base64';
import { EventType } from '@tbd54566975/dwn-sdk-js';
import { DwnInterfaceName } from '@tbd54566975/dwn-sdk-js';
import { DwnMethodName } from '@tbd54566975/dwn-sdk-js';

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
        filter: {
          eventType: EventType.Operation,
        },
      });

      const port = (wsServer.address() as AddressInfo).port;
      const ip = (wsServer.address() as AddressInfo).address;
      const addr = `ws://${ip}:${port}`;
      const socket = new WebSocket(addr);
      let receivedCount = 0;

      const socketPromise = new Promise<any>((resolve, reject) => {
        // set up lisetner...
        socket.onmessage = (event): Promise<void> => {
          try {
            const resp = JSON.parse(event.data.toString());
            if (resp.error) {
              throw new Error(resp.error.message);
            }
            receivedCount += 1;
            if (
              resp.result?.descriptor?.eventDescriptor?.interface ===
                DwnInterfaceName.Records &&
              resp.result?.descriptor?.eventDescriptor?.method ===
                DwnMethodName.Write
            ) {
              resolve(event);
              socket.close();
            }
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
          // on open
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
          try {
            const { recordsWrite, dataStream } =
              await createRecordsWriteMessage(alice);
            const dataBytes = await DataStream.toBytes(dataStream);
            const encodedData = base64url.baseEncode(dataBytes);

            const requestId = uuidv4();
            const dwnRequest = createJsonRpcRequest(
              requestId,
              'dwn.processMessage',
              {
                message: recordsWrite.toJSON(),
                target: alice.did,
                encodedData,
              },
            );
            socket.send(JSON.stringify(dwnRequest));
          } catch (error) {
            reject(error);
          }
          return;
        };
      });
      await socketPromise;
      assert.equal(receivedCount, 2, 'received count');
    } catch (error) {
      assert.fail(error, undefined, 'failed to register subscription' + error);
    }
  });
});
