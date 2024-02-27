import { expect } from 'chai';
import sinon from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import { handleDwnProcessMessage } from '../src/json-rpc-handlers/dwn/process-message.js';
import type { RequestContext } from '../src/lib/json-rpc-router.js';
import { JsonRpcErrorCodes, createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { getTestDwn } from './test-dwn.js';
import { createRecordsWriteMessage } from './utils.js';
import { TestDataGenerator } from '@tbd54566975/dwn-sdk-js';

describe('handleDwnProcessMessage', function () {
  it('returns a JSON RPC Success Response when DWN returns a 2XX status code', async function () {
    const alice = await TestDataGenerator.generateDidKeyPersona();

    // Construct a well-formed DWN Request that will be successfully processed.
    const { recordsWrite, dataStream } = await createRecordsWriteMessage(alice);
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: recordsWrite.toJSON(),
      target: alice.did,
    });

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'http', dataStream };

    const { jsonRpcResponse } = await handleDwnProcessMessage(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.not.exist;
    const { reply } = jsonRpcResponse.result;
    expect(reply.status.code).to.equal(202);
    expect(reply.status.detail).to.equal('Accepted');
    await dwn.close();
  });

  it('returns a JSON RPC Success Response when DWN returns a 4XX/5XX status code', async function () {
    // Construct a DWN Request that is missing the descriptor `method` property to ensure
    // that `dwn.processMessage()` will return an error status.
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: {
        descriptor: { interface: 'Records' },
      },
      target: 'did:key:abc1234',
    });

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'http' };

    const { jsonRpcResponse } = await handleDwnProcessMessage(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.not.exist;
    const { reply } = jsonRpcResponse.result;
    expect(reply.status.code).to.equal(400);
    expect(reply.status.detail).to.exist;
    expect(reply.data).to.be.undefined;
    expect(reply.entries).to.be.undefined;
    await dwn.close();
  });

  it('should fail if no subscriptionRequest context exists for a `Subscribe` message', async function () {
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: {
        descriptor: { interface: 'Records', method: 'Subscribe' },
      },
      target: 'did:key:abc1234',
    });

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'ws' };

    const { jsonRpcResponse } = await handleDwnProcessMessage(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InvalidRequest);
    expect(jsonRpcResponse.error.message).to.equal('subscribe methods must contain a subscriptionRequest context');
    await dwn.close();
  });

  it('should fail on http requests for a `Subscribe` message', async function () {
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: {
        descriptor: { interface: 'Records', method: 'Subscribe' },
      },
      target: 'did:key:abc1234',
    });

    const dwn = await getTestDwn();
    const context: RequestContext = { dwn, transport: 'http', subscriptionRequest: { id: 'test', subscriptionHandler: () => {}} };

    const { jsonRpcResponse } = await handleDwnProcessMessage(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InvalidParams);
    expect(jsonRpcResponse.error.message).to.equal('subscriptions are not supported via http');
    await dwn.close();
  });

  it('should return a JsonRpc Internal Error for an unexpected thrown error within the handler', async function () {
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: {
        descriptor: { interface: 'Records' },
      },
      target: 'did:key:abc1234',
    });

    const dwn = await getTestDwn();
    sinon.stub(dwn, 'processMessage').throws(new Error('unexpected error'));
    const context: RequestContext = { dwn, transport: 'http' };

    const { jsonRpcResponse } = await handleDwnProcessMessage(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.exist;
    expect(jsonRpcResponse.error.code).to.equal(JsonRpcErrorCodes.InternalError);
    expect(jsonRpcResponse.error.message).to.equal('unexpected error');
    await dwn.close();
  });
});
