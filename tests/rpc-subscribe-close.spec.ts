import { expect } from 'chai';
import sinon from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import type { RequestContext } from '../src/lib/json-rpc-router.js';
import { JsonRpcErrorCodes, createJsonRpcRequest, createJsonRpcSubscriptionRequest } from '../src/lib/json-rpc.js';
import { getTestDwn } from './test-dwn.js';
import { handleSubscriptionsClose } from '../src/json-rpc-handlers/subscription/close.js';
import { SocketConnection } from '../src/connection/socket-connection.js';
import { DwnServerError, DwnServerErrorCode } from '../src/dwn-error.js';

describe('handleDwnProcessMessage', function () {
  it('should return an error if no socket connection exists', async function () {
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'rpc.subscribe.close', { });

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws' };

    const { jsonRpcResponse } = await handleSubscriptionsClose(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InvalidRequest);
    expect(jsonRpcResponse.error.message).to.equal('socket connection does not exist');
  });

  it('should return an error if no subscribe options exist', async function () {
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'rpc.subscribe.close', { });
    const socketConnection = sinon.createStubInstance(SocketConnection);

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws', socketConnection };

    const { jsonRpcResponse } = await handleSubscriptionsClose(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InvalidRequest);
    expect(jsonRpcResponse.error.message).to.equal('subscribe options do not exist');
  });

  it('should return an error if close subscription throws ConnectionSubscriptionJsonRpcIdNotFound', async function () {
    const requestId = uuidv4();
    const id = 'some-id';
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.close', {}, id);
    const socketConnection = sinon.createStubInstance(SocketConnection);
    socketConnection.closeSubscription.throws(new DwnServerError(
      DwnServerErrorCode.ConnectionSubscriptionJsonRpcIdNotFound,
      ''
    ));

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws', socketConnection };

    const { jsonRpcResponse } = await handleSubscriptionsClose(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InvalidParams);
    expect(jsonRpcResponse.error.message).to.equal(`subscription ${id} does not exist.`);
  });

  it('should return an error if close subscription throws ConnectionSubscriptionJsonRpcIdNotFound', async function () {
    const requestId = uuidv4();
    const id = 'some-id';
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.close', {}, id);
    const socketConnection = sinon.createStubInstance(SocketConnection);
    socketConnection.closeSubscription.throws(new Error('unknown error'));

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws', socketConnection };

    const { jsonRpcResponse } = await handleSubscriptionsClose(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InternalError);
    expect(jsonRpcResponse.error.message).to.equal(`unknown subscription close error for ${id}: unknown error`);
  });

  it('should return a success', async function () {
    const requestId = uuidv4();
    const id = 'some-id';
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.close', {}, id);
    const socketConnection = sinon.createStubInstance(SocketConnection);

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws', socketConnection };

    const { jsonRpcResponse } = await handleSubscriptionsClose(
      dwnRequest,
      context,
    );
    expect(jsonRpcResponse.error).to.not.exist;
  });

  it('handler should generate a request Id if one is not provided with the request', async function () {
    const requestId = uuidv4();
    const id = 'some-id';
    const dwnRequest = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.close', {}, id);
    delete dwnRequest.id; // delete request id

    const socketConnection = sinon.createStubInstance(SocketConnection);

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws', socketConnection };

    const { jsonRpcResponse } = await handleSubscriptionsClose(
      dwnRequest,
      context,
    );
    expect(jsonRpcResponse.error).to.not.exist;
    expect(jsonRpcResponse.id).to.exist;
    expect(jsonRpcResponse.id).to.not.equal(id);
  });
});
