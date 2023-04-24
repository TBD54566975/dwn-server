import http from 'node:http';

import { expect } from 'chai';
import { base64url } from 'multiformats/bases/base64';
import { WebSocket } from 'ws';
import { DataStream } from '@tbd54566975/dwn-sdk-js';
import { v4 as uuidv4 } from 'uuid';

import { wsServer } from '../src/ws-server.js';
import { createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { dataStore, eventLog, messageStore } from '../src/dwn.js';
import { createProfile, createRecordsWriteMessage } from './utils.js';

let server: http.Server;

describe('websocket messages', function() {
  before(async function () {
    server = http.createServer();

    // pass control to wsServer whenever an http connection is upgraded
    server.on('upgrade', (req, socket, firstPacket) => {
      wsServer.handleUpgrade(req, socket, firstPacket, (socket) => {
        wsServer.emit('connection', socket, req);
      });
    });

    server.listen(9001, '127.0.0.1');
  });

  afterEach(async function() {
    await dataStore.clear();
    await eventLog.clear();
    await messageStore.clear();
  });

  after(function() {
    server.close();
    server.closeAllConnections();
  });

  it('handles RecordsWrite messages', async function() {
    const alice = await createProfile();
    const { recordsWrite, dataStream } = await createRecordsWriteMessage(alice);
    const dataBytes = await DataStream.toBytes(dataStream);
    const encodedData = base64url.baseEncode(dataBytes);

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message : recordsWrite.toJSON(),
      target  : alice.did,
      encodedData
    });

    const socket = new WebSocket('ws://127.0.0.1:9001');

    socket.onmessage = event => {
      // TODO: add assertions
      socket.terminate();
    };

    socket.onopen = (_event) => {
      socket.send(JSON.stringify(dwnRequest));
    };
  });
});