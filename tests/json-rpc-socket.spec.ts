import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';

import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse } from '../src/lib/json-rpc.js';

import { JsonRpcSocket } from '../src/json-rpc-socket.js';
import { createJsonRpcRequest, createJsonRpcSuccessResponse } from '../src/lib/json-rpc.js';

chai.use(chaiAsPromised);

describe('JSONRPCSocket', () => {
  let wsServer: WebSocketServer;

  before(async () => {
    wsServer = new WebSocketServer({
      port: 9003,
    });
  });

  beforeEach(() => {
   wsServer.removeAllListeners();
  });

  it('connects to a url', async () => {
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    expect(wsServer.clients.size).to.equal(1);
    client.close();

    // give time for the connection to close on the server.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(wsServer.clients.size).to.equal(0);
  });

  it('resolves a request with given params', async () => {
    wsServer.addListener('connection', (socket) => {
      socket.on('message', (dataBuffer: Buffer) => {
        const request = JSON.parse(dataBuffer.toString()) as JsonRpcRequest;
        const { param1, param2 } = request.params;
        expect(param1).to.equal('test-param1');
        expect(param2).to.equal('test-param2');

        // send response passed tests
        const response = createJsonRpcSuccessResponse(request.id, {});
        socket.send(Buffer.from(JSON.stringify(response)));
      });
    });
   
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'test.method', { param1: 'test-param1', param2: 'test-param2' });
    const response = await client.request(request);
    expect(response.id).to.equal(request.id);
  });

  it('request times out', async () => {
    // time out after 1 ms
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003', { responseTimeout: 1 });
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'test.method', { param1: 'test-param1', param2: 'test-param2' });
    const requestPromise = client.request(request);

    await expect(requestPromise).to.eventually.be.rejectedWith('timed out');
  });

  it('opens a subscription', async () => {
    wsServer.addListener('connection', (socket) => {
      socket.on('message', (dataBuffer: Buffer) => {
        const request = JSON.parse(dataBuffer.toString()) as JsonRpcRequest;
        // send 3 messages
        for (let i = 0; i < 3; i++) {
          const response = createJsonRpcSuccessResponse(request.id, { count: i });
          socket.send(Buffer.from(JSON.stringify(response)));
        }
      });
    });
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'test.method', { param1: 'test-param1', param2: 'test-param2' });

    let responseCounter = 0;
    const responseListener = (response: JsonRpcResponse): void => {
      expect(response.id).to.equal(request.id);
      const { count } = response.result;
      expect(count).to.equal(responseCounter);
      responseCounter++;
    }

    const subscription = client.subscribe(request, responseListener);
    // wait for the messages to arrive
    await new Promise((resolve) => setTimeout(resolve, 5));
    // the original response 
    expect(responseCounter).to.equal(3);
    subscription.close();
  });

  it('sends message', async () => {
    const receivedPromise = new Promise<{ reply: { id?: JsonRpcId }}>((resolve) => {
      wsServer.addListener('connection', (socket) => {
        socket.on('message', (dataBuffer: Buffer) => {
          const request = JSON.parse(dataBuffer.toString()) as JsonRpcRequest;
          const { param1, param2 } = request.params;
          expect(param1).to.equal('test-param1');
          expect(param2).to.equal('test-param2');
          resolve({ reply: { id: request.id }});
        });
      });
    });
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'test.method', { param1: 'test-param1', param2: 'test-param2' });
    client.send(request);
    await expect(receivedPromise).to.eventually.eql({ reply: { id: request.id }});
  });

  xit('calls onerror handler', async () => {
  });

  xit('calls onclose handler', async () => {
  });
});
