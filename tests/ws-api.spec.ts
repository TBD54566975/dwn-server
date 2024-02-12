import type { Dwn, GenericMessage } from '@tbd54566975/dwn-sdk-js';
import { DataStream, Message, TestDataGenerator } from '@tbd54566975/dwn-sdk-js';

import { expect } from 'chai';
import { base64url } from 'multiformats/bases/base64';
import type { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { type WebSocketServer } from 'ws';

import {
  createJsonRpcRequest,
  JsonRpcErrorCodes,
} from '../src/lib/json-rpc.js';
import { config } from '../src/config.js';
import { WsApi } from '../src/ws-api.js';
import { getTestDwn } from './test-dwn.js';
import { createRecordsWriteMessage, sendWsMessage, sendHttpMessage, subscriptionRequest } from './utils.js';
import { HttpApi } from '../src/http-api.js';

let server: Server;
let wsServer: WebSocketServer;
let dwn: Dwn;

describe('websocket api', function () {
  before(async function () {
    dwn = await getTestDwn({ withEvents: true });

    // set up http api for issuing writes within the tests
    const httpApi = new HttpApi(config, dwn);
    server = await httpApi.start(9002);

    const wsApi = new WsApi(server, dwn);
    wsServer = wsApi.start();
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

  it('RecordsWrite messages are not supported', async function () {
    const alice = await TestDataGenerator.generateDidKeyPersona();

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
    expect(resp.error).to.not.be.undefined;
    expect(resp.error.code).to.equal(JsonRpcErrorCodes.MethodNotFound);
    expect(resp.error.message).to.include('RecordsWrite is not supported via ws');
  });

  it('subscribes to records and receives updates', async () => {
    const alice = await TestDataGenerator.generateDidKeyPersona();

    const { message } = await TestDataGenerator.generateRecordsSubscribe({
      author: alice,
      filter: {
        schema: 'foo/bar'
      }
    });

    const records: string[] = [];
    const subscriptionHandler = async (message: GenericMessage): Promise<void> => {
      records.push(await Message.getCid(message));
    };

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: message,
      target: alice.did,
    });

    const response = await subscriptionRequest('ws://127.0.0.1:9002', dwnRequest, subscriptionHandler);
    expect(response.status.code).to.equal(200);
    expect(response.subscription).to.not.be.undefined;

    const write1Message = await TestDataGenerator.generateRecordsWrite({
      author     : alice,
      schema     : 'foo/bar',
      dataFormat : 'text/plain'
    });

    const writeResult1 = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : write1Message.message,
      data      : write1Message.dataBytes,
    });
    expect(writeResult1.status.code).to.equal(202);

    const write2Message = await TestDataGenerator.generateRecordsWrite({
      author     : alice,
      schema     : 'foo/bar',
      dataFormat : 'text/plain'
    });

    const writeResult2 = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : write2Message.message,
      data      : write2Message.dataBytes, 
    }) 
    expect(writeResult2.status.code).to.equal(202);

    // close the subscription
    await response.subscription.close();

    await new Promise(resolve => setTimeout(resolve, 500)); // wait for records to be processed
    expect(records).to.have.members([
      await Message.getCid(write1Message.message),
      await Message.getCid(write2Message.message)
    ]);
  });

  it('stops receiving updates when subscription is closed', async () => {
    const alice = await TestDataGenerator.generateDidKeyPersona();

    const { message } = await TestDataGenerator.generateRecordsSubscribe({
      author: alice,
      filter: {
        schema: 'foo/bar'
      }
    });

    const records: string[] = [];
    const subscriptionHandler = async (message: GenericMessage): Promise<void> => {
      records.push(await Message.getCid(message));
    };

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: message,
      target: alice.did,
    });
    const response = await subscriptionRequest('ws://127.0.0.1:9002', dwnRequest, subscriptionHandler);
    expect(response.status.code).to.equal(200);
    expect(response.subscription).to.not.be.undefined;

    const write1Message = await TestDataGenerator.generateRecordsWrite({
      author     : alice,
      schema     : 'foo/bar',
      dataFormat : 'text/plain'
    });

    const writeResult1 = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : write1Message.message,
      data      : write1Message.dataBytes,
    });
    expect(writeResult1.status.code).to.equal(202);

    // close the subscription after only 1 message
    await response.subscription.close();

    // write more messages that won't show up in the subscription
    const write2Message = await TestDataGenerator.generateRecordsWrite({
      author     : alice,
      schema     : 'foo/bar',
      dataFormat : 'text/plain'
    });

    const writeResult2 = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : write2Message.message,
      data      : write2Message.dataBytes, 
    }) 
    expect(writeResult2.status.code).to.equal(202);

    const write3Message = await TestDataGenerator.generateRecordsWrite({
      author     : alice,
      schema     : 'foo/bar',
      dataFormat : 'text/plain'
    });

    const writeResult3 = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : write3Message.message,
      data      : write3Message.dataBytes, 
    }) 
    expect(writeResult3.status.code).to.equal(202);

    await new Promise(resolve => setTimeout(resolve, 500)); // wait for records to be processed
    expect(records).to.have.members([ await Message.getCid(write1Message.message) ]);
  });
});
