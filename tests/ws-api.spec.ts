import http from 'node:http';

import { base64url } from 'multiformats/bases/base64';
import { DataStream } from '@tbd54566975/dwn-sdk-js';
import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { type WebSocketServer } from 'ws';

import { WsApi } from '../src/ws-api.js';
import { clear as clearDwn, dwn } from './test-dwn.js';
import {
  createJsonRpcRequest,
  JsonRpcErrorCodes,
} from '../src/lib/json-rpc.js';
import {
  createProfile,
  createRecordsWriteMessage,
  sendWsMessage,
} from './utils.js';

let server: http.Server;
let wsServer: WebSocketServer;

describe('websocket api', function () {
  before(async function () {
    server = http.createServer();
    server.listen(9002, '127.0.0.1');

    const wsApi = new WsApi(server, dwn);
    wsServer = wsApi.start();
  });

  afterEach(async function () {
    await clearDwn();
  });

  after(function () {
    wsServer.close();
    server.close();
    server.closeAllConnections();
  });

  it('returns an error response if no request payload is provided', async function () {
    const data = await sendWsMessage('ws://127.0.0.1:9002', Buffer.from(''));

    const resp = JSON.parse(data.toString());
    expect(resp.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(resp.error.message).to.equal('request payload required.');
  });

  it('returns an error response if parsing dwn request fails', async function () {
    const data = await sendWsMessage(
      'ws://127.0.0.1:9002',
      Buffer.from('@#$%^&*&%$#'),
    );

    const resp = JSON.parse(data.toString());
    expect(resp.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(resp.error.message).to.include('JSON');
  });

  it('handles RecordsWrite messages', async function () {
    const alice = await createProfile();
    const { recordsWrite, dataStream } = await createRecordsWriteMessage(alice);
    const dataBytes = await DataStream.toBytes(dataStream);
    const encodedData = base64url.baseEncode(dataBytes);

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: recordsWrite.toJSON(),
      target: alice.did,
      encodedData,
    });

    const data = await sendWsMessage(
      'ws://127.0.0.1:9002',
      JSON.stringify(dwnRequest),
    );
    const resp = JSON.parse(data.toString());
    expect(resp.id).to.equal(requestId);
    expect(resp.error).to.not.exist;

    const { reply } = resp.result;
    expect(reply.status.code).to.equal(202);
  });
});
