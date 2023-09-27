import http from 'node:http';
import { WebSocket, type WebSocketServer } from 'ws';

import {
  DataStoreLevel,
  DidKeyResolver,
  Dwn,
  EventLogLevel,
  MessageStoreLevel,
  SubscriptionRequest,
} from '@tbd54566975/dwn-sdk-js';

import { Jws } from '@tbd54566975/dwn-sdk-js';
import type { SubscriptionController } from '../src/subscription-manager.js';
import { SubscriptionManager } from '../src/subscription-manager.js';
import { assert } from 'chai';
import { createProfile } from './utils.js';
import type { Profile } from './utils.js';
import { WsApi } from '../src/ws-api.js';

describe('Subscription Manager Test', async () => {
  let subscriptionManager: SubscriptionController;
  let wsServer: WebSocketServer;
  let server: http.Server;
  let dataStore: DataStoreLevel;
  let eventLog: EventLogLevel;
  let messageStore: MessageStoreLevel;
  let alice: Profile;
  let dwn: Dwn;
  let socket: WebSocket;

  before(async () => {
    // Setup data stores...
    dataStore = new DataStoreLevel({
      blockstoreLocation: 'data/DATASTORE',
    });
    eventLog = new EventLogLevel({ location: 'data/EVENTLOG' });
    messageStore = new MessageStoreLevel({
      blockstoreLocation: 'data/MESSAGESTORE',
      indexLocation: 'data/INDEX',
    });

    // create profile
    alice = await createProfile();
    // create Dwn
    dwn = await Dwn.create({ eventLog, dataStore, messageStore });

    // create listeners...
    server = http.createServer();
    server.listen(9002, '127.0.0.1');
    const wsApi = new WsApi(server, dwn);
    wsServer = wsApi.start();

    // create subscription manager...
    subscriptionManager = new SubscriptionManager({
      dwn: dwn,
      messageStore: messageStore,
      tenant: alice.did,
      wss: wsServer,
    });
    return;
  });

  // before each, clear the subscriptions
  beforeEach(async () => {
    subscriptionManager.clear();
    await dataStore.clear();
    await eventLog.clear();
    await messageStore.clear();
  });

  // close at the end
  after(async () => {
    await subscriptionManager.close();
    wsServer.close();
    server.close();
    server.closeAllConnections();
    socket.close();
  });

  it('test subscription manager registration', async () => {
    try {
      const signer = await DidKeyResolver.generate();

      // create a subscription request
      const req = await SubscriptionRequest.create({
        signer: Jws.createSigner(signer),
      });

      // setup a socket connection to wsServer
      const socket = new WebSocket(wsServer.address.toString());
      socket.onopen = async (): Promise<void> => {
        console.log('sending req', req);
        // send a subscription request
        // const subscription = await subscriptionManager.subscribe({
        //   from: alice.did,
        //   subscriptionRequestMessage: req,
        //   permissionGrant: 'asdf',
        // });
        socket.send('subscription request');
        return;
      };

      socket.onmessage = (event): Promise<void> => {
        console.log('got message', event);
        return;
      };
    } catch (error) {
      assert.fail(error, undefined, 'failed to register subscription');
    }
  });
});
