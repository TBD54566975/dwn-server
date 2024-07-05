
import type { Dwn, MessageEvent } from '@tbd54566975/dwn-sdk-js';
import { DataStream, Message, TestDataGenerator } from '@tbd54566975/dwn-sdk-js';

import { expect } from 'chai';
import { base64url } from 'multiformats/bases/base64';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import {
  createJsonRpcRequest,
  createJsonRpcSubscriptionRequest,
  JsonRpcErrorCodes,
} from '../src/lib/json-rpc.js';
import { config } from '../src/config.js';
import { WsApi } from '../src/ws-api.js';
import { getTestDwn } from './test-dwn.js';
import { createRecordsWriteMessage, sendWsMessage, sendHttpMessage } from './utils.js';
import { HttpApi } from '../src/http-api.js';
import { JsonRpcSocket } from '../src/json-rpc-socket.js';


describe('websocket api', function () {
  let httpApi: HttpApi;
  let wsApi: WsApi;
  let dwn: Dwn;
  let clock: SinonFakeTimers;

  before(() => {
    clock = useFakeTimers({ shouldAdvanceTime: true });
  });

  after(() => {
    clock.restore();
  });

  beforeEach(async function () {
    dwn = await getTestDwn({ withEvents: true });
    httpApi =  await HttpApi.create(config, dwn);
    await httpApi.start(9002);
    wsApi = new WsApi(httpApi.server, dwn);
    wsApi.start();
  });

  afterEach(async function () {
    await wsApi.close();
    await httpApi.stop();
    await dwn.close();
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

    const connection = await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    const response = await connection.request(dwnRequest);
    
    expect(response.id).to.equal(requestId);
    expect(response.error).to.not.be.undefined;
    expect(response.error.code).to.equal(JsonRpcErrorCodes.InvalidParams);
    expect(response.error.message).to.include('RecordsWrite is not supported via ws');
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
    const subscriptionHandler = async (event: MessageEvent): Promise<void> => {
      const { message } = event
      records.push(await Message.getCid(message));
    };

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.dwn.processMessage', {
      message: message,
      target: alice.did,
    });

    const connection = await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    const { response, close } = await connection.subscribe(dwnRequest, (response) => {
      const { event } = response.result;
      subscriptionHandler(event);
    });
    
    expect(response.error).to.be.undefined;
    expect(response.result.reply.status.code).to.equal(200);
    expect(close).to.not.be.undefined;

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
    await close();

    await new Promise(resolve => setTimeout(resolve, 5)); // wait for records to be processed
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
    const subscriptionHandler = async (event: MessageEvent): Promise<void> => {
      const { message } = event;
      records.push(await Message.getCid(message));
    };

    const requestId = uuidv4();
    const subscribeId = uuidv4();
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.dwn.processMessage', {
      message: message,
      target: alice.did,
    }, subscribeId);

    const connection = await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    const { response, close } = await connection.subscribe(dwnRequest, (response) => {
      const { event } = response.result;
      subscriptionHandler(event);
    });

    expect(response.error).to.be.undefined;
    expect(response.result.reply.status.code).to.equal(200);
    expect(close).to.not.be.undefined;

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
    await close();

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

    await new Promise(resolve => setTimeout(resolve, 5)); // wait for records to be processed
    expect(records).to.have.members([ await Message.getCid(write1Message.message) ]);
  });

  it('should fail to add subscription using a `JsonRpcId` that already exists for a subscription in that socket', async () => {
    const alice = await TestDataGenerator.generateDidKeyPersona();

    const { message } = await TestDataGenerator.generateRecordsSubscribe({
      author: alice,
      filter: {
        schema: 'foo/bar'
      }
    });

    const records: string[] = [];
    const subscriptionHandler = async (event: MessageEvent): Promise<void> => {
      const { message } = event
      records.push(await Message.getCid(message));
    };

    const requestId = uuidv4();
    const subscribeId = uuidv4();
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.dwn.processMessage', {
      message: message,
      target: alice.did
    }, subscribeId);

    const connection = await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    const { close } = await connection.subscribe(dwnRequest, (response) => {
      const { event } = response.result;
      subscriptionHandler(event);
    });

    const { message: message2 } = await TestDataGenerator.generateRecordsSubscribe({ filter: { schema: 'bar/baz' }, author: alice });

    // We are checking for the subscription Id not the request Id
    const request2Id = uuidv4();
    const dwnRequest2 = createJsonRpcSubscriptionRequest(request2Id, 'rpc.subscribe.dwn.processMessage', {
      message: message2,
      target: alice.did
    }, subscribeId);

    const { response: response2 } = await connection.subscribe(dwnRequest2, (response) => {
      const { event } = response.result;
      subscriptionHandler(event);
    });

    expect(response2.error.code).to.equal(JsonRpcErrorCodes.InvalidParams);
    expect(response2.error.message).to.contain(`${subscribeId} is in use by an active subscription`);

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
    await close();

    await new Promise(resolve => setTimeout(resolve, 5)); // wait for records to be processed
    expect(records).to.have.members([
      await Message.getCid(write1Message.message),
      await Message.getCid(write2Message.message)
    ]);
  });

  it('should receive an updated message as well as the initial write when subscribing to a record', async () => {
    const alice = await TestDataGenerator.generateDidKeyPersona();

    // write an initial message
    const initialWrite = await TestDataGenerator.generateRecordsWrite({
      author     : alice,
      schema     : 'foo/bar',
      dataFormat : 'text/plain'
    });

    const writeResult1 = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : initialWrite.message,
      data      : initialWrite.dataBytes,
    });
    expect(writeResult1.status.code).to.equal(202);

    // subscribe to 'foo/bar' messages
    const { message } = await TestDataGenerator.generateRecordsSubscribe({
      author: alice,
      filter: {
        schema: 'foo/bar'
      }
    });

    const records: string[] = [];
    const subscriptionHandler = async (event: MessageEvent): Promise<void> => {
      const { message, initialWrite } = event
      if (initialWrite)  {
        records.push(await Message.getCid(initialWrite));
      }
      records.push(await Message.getCid(message));
    };

    const requestId = uuidv4();
    const subscribeId = uuidv4();
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.dwn.processMessage', {
      message: message,
      target: alice.did
    }, subscribeId);

    const connection = await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    const { close } = await connection.subscribe(dwnRequest, (response) => {
      const { event } = response.result;
      subscriptionHandler(event);
    });

    // wait for potential records to process and confirm that initial write has not been processed
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(records.length).length.to.equal(0);

    // update the initial message
    const updatedMessage = await TestDataGenerator.generateFromRecordsWrite({
      author        : alice,
      existingWrite : initialWrite.recordsWrite,
    });

    const updateResult = await sendHttpMessage({
      url       : 'http://localhost:9002',
      target    : alice.did,
      message   : updatedMessage.message,
      data      : updatedMessage.dataBytes,
    });
    expect(updateResult.status.code).to.equal(202);

    await close();

    await new Promise(resolve => setTimeout(resolve, 5)); // wait for records to be processed

    // both initial and update should exist now
    expect(records).to.have.members([
      await Message.getCid(initialWrite.message),
      await Message.getCid(updatedMessage.message)
    ]);
  });
});
