import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import { v4 as uuidv4 } from 'uuid';
import sinon from 'sinon';
import { WebSocketServer } from 'ws';

import type { JsonRpcId, JsonRpcRequest, JsonRpcSuccessResponse } from '../src/lib/json-rpc.js';

import { JsonRpcSocket } from '../src/json-rpc-socket.js';
import { JsonRpcErrorCodes, createJsonRpcErrorResponse, createJsonRpcRequest, createJsonRpcSubscriptionRequest, createJsonRpcSuccessResponse } from '../src/lib/json-rpc.js';
import log from 'loglevel';

chai.use(chaiAsPromised);

describe('JsonRpcSocket', () => {
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

  it('removes listener if subscription json rpc is rejected ', async () => {
    wsServer.addListener('connection', (socket) => {
      socket.on('message', (dataBuffer: Buffer) => {
        const request = JSON.parse(dataBuffer.toString()) as JsonRpcRequest;
        // initial response
        const response = createJsonRpcErrorResponse(request.id, JsonRpcErrorCodes.BadRequest, 'bad request');
        socket.send(Buffer.from(JSON.stringify(response)));
      });
    });

    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003', { responseTimeout: 5 });
    const requestId = uuidv4();
    const subscribeId = uuidv4();
    const request = createJsonRpcSubscriptionRequest(
      requestId,
      'rpc.subscribe.test.method',
      { param1: 'test-param1', param2: 'test-param2' },
      subscribeId,
    );

    const responseListener = (_response: JsonRpcSuccessResponse): void => {}

    const subscription = await client.subscribe(request, responseListener);
    expect(subscription.response.error).to.not.be.undefined;
    expect(client['socket'].listenerCount('message')).to.equal(0);
  });

  it('opens a subscription', async () => {
    wsServer.addListener('connection', (socket) => {
      socket.on('message', (dataBuffer: Buffer) => {
        const request = JSON.parse(dataBuffer.toString()) as JsonRpcRequest;
        // initial response 
        const response = createJsonRpcSuccessResponse(request.id, { reply: {} })
        socket.send(Buffer.from(JSON.stringify(response)));
        const { subscription } = request;
        // send 3 messages
        for (let i = 0; i < 3; i++) {
          const response = createJsonRpcSuccessResponse(subscription.id, { count: i });
          socket.send(Buffer.from(JSON.stringify(response)));
        }
      });
    });

    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003', { responseTimeout: 5 });
    const requestId = uuidv4();
    const subscribeId = uuidv4();
    const request = createJsonRpcSubscriptionRequest(
      requestId,
      'rpc.subscribe.test.method',
      { param1: 'test-param1', param2: 'test-param2' },
      subscribeId,
    );

    let responseCounter = 0;
    const responseListener = (response: JsonRpcSuccessResponse): void => {
      expect(response.id).to.equal(subscribeId);
      const { count } = response.result;
      expect(count).to.equal(responseCounter);
      responseCounter++;
    }

    const subscription = await client.subscribe(request, responseListener);
    expect(subscription.response.error).to.be.undefined;
    // wait for the messages to arrive
    await new Promise((resolve) => setTimeout(resolve, 5));
    // the original response 
    expect(responseCounter).to.equal(3);
    await subscription.close();
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

  it('closes subscription upon receiving a JsonRpc Error for a long running subscription', async () => {
    let closed = true; 
    wsServer.addListener('connection', (socket) => {
      closed = false;
      socket.on('message', (dataBuffer: Buffer) => {
        const request = JSON.parse(dataBuffer.toString()) as JsonRpcRequest;
        if (request.method.startsWith('rpc.subscribe') && request.method !== 'rpc.subscribe.close') {
          // initial response 
          const response = createJsonRpcSuccessResponse(request.id, { reply: {} })
          socket.send(Buffer.from(JSON.stringify(response)));
          const { subscription } = request;

          // send 1 valid message
          const message1 = createJsonRpcSuccessResponse(subscription.id, { message: 1 });
          socket.send(Buffer.from(JSON.stringify(message1)));

          // send a json rpc error
          const jsonRpcError = createJsonRpcErrorResponse(subscription.id, JsonRpcErrorCodes.InternalError, 'some error');
          socket.send(Buffer.from(JSON.stringify(jsonRpcError)));

          // send a 2nd message that shouldn't be handled
          const message2 = createJsonRpcSuccessResponse(subscription.id, { message: 2 });
          socket.send(Buffer.from(JSON.stringify(message2)));
        } else if (request.method === 'rpc.subscribe.close') {
          closed = true;
        }
      });
    });

    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003', { responseTimeout: 5 });
    const requestId = uuidv4();
    const subscribeId = uuidv4();
    const request = createJsonRpcSubscriptionRequest(
      requestId,
      'rpc.subscribe.test.method',
      { param1: 'test-param1', param2: 'test-param2' },
      subscribeId,
    );

    let responseCounter = 0;
    let errorCounter = 0;
    const responseListener = (response: JsonRpcSuccessResponse): void => {
      expect(response.id).to.equal(subscribeId);
      if (response.error) {
        errorCounter++;
      }

      if (response.result) {
        responseCounter++;
      }
    }

    const subscription = await client.subscribe(request, responseListener);
    expect(subscription.response.error).to.be.undefined;
    // wait for the messages to arrive
    await new Promise((resolve) => setTimeout(resolve, 5));
    // the original response 
    expect(responseCounter).to.equal(1);
    expect(errorCounter).to.equal(1);
    expect(closed).to.equal(true);
  });

  it('only JSON RPC Methods prefixed with `rpc.subscribe.` are accepted for a subscription', async () => {
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'test.method', { param1: 'test-param1', param2: 'test-param2' }); 
    const subscribePromise = client.subscribe(request, () => {});
    await expect(subscribePromise).to.eventually.be.rejectedWith('subscribe rpc requests must include the `rpc.subscribe` prefix');
  });

  it('subscribe methods must contain a subscribe object within the request which contains the subscription JsonRpcId', async () => {
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'rpc.subscribe.test.method', { param1: 'test-param1', param2: 'test-param2' }); 
    const subscribePromise = client.subscribe(request, () => {});
    await expect(subscribePromise).to.eventually.be.rejectedWith('subscribe rpc requests must include subscribe options');
  });

  it('calls onclose handler', async () => {
    // test injected handler
    const onCloseHandler = { onclose: ():void => {} };
    const onCloseSpy = sinon.spy(onCloseHandler, 'onclose');
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003', { onclose: onCloseHandler.onclose });
    client.close();

    await new Promise((resolve) => setTimeout(resolve, 5)); // wait for close event to arrive
    expect(onCloseSpy.callCount).to.equal(1);

    // test default logger
    const logInfoSpy = sinon.spy(log, 'info');
    const defaultClient = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    defaultClient.close();

    await new Promise((resolve) => setTimeout(resolve, 5)); // wait for close event to arrive
    expect(logInfoSpy.callCount).to.equal(1);

    // extract log message from argument
    const logMessage:string = logInfoSpy.args[0][0]!;
    expect(logMessage).to.equal('JSON RPC Socket close ws://127.0.0.1:9003');
  });

  it('calls onerror handler', async () => {
    // test injected handler
    const onErrorHandler = { onerror: ():void => {} };
    const onErrorSpy = sinon.spy(onErrorHandler, 'onerror');
    const client = await JsonRpcSocket.connect('ws://127.0.0.1:9003', { onerror: onErrorHandler.onerror });
    client['socket'].emit('error', 'some error');

    await new Promise((resolve) => setTimeout(resolve, 5)); // wait for close event to arrive
    expect(onErrorSpy.callCount).to.equal(1, 'error');

    // test default logger
    const logInfoSpy = sinon.spy(log, 'error');
    const defaultClient = await JsonRpcSocket.connect('ws://127.0.0.1:9003');
    defaultClient['socket'].emit('error', 'some error');

    await new Promise((resolve) => setTimeout(resolve, 5)); // wait for close event to arrive
    expect(logInfoSpy.callCount).to.equal(1, 'log');

    // extract log message from argument
    const logMessage:string = logInfoSpy.args[0][0]!;
    expect(logMessage).to.equal('JSON RPC Socket error ws://127.0.0.1:9003');
  });
});
