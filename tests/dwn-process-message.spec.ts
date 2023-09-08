import type { RequestContext } from '../src/lib/json-rpc-router.js';

import { createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { expect } from 'chai';
import { handleDwnProcessMessage } from '../src/json-rpc-handlers/dwn/process-message.js';
import { v4 as uuidv4 } from 'uuid';
import { clear as clearDwn, dwn } from './test-dwn.js';
import { createProfile, createRecordsWriteMessage } from './utils.js';

describe('handleDwnProcessMessage', function () {
  afterEach(async function () {
    await clearDwn();
  });

  it('returns a JSON RPC Success Response when DWN returns a 2XX status code', async function () {
    const alice = await createProfile();

    // Construct a well-formed DWN Request that will be successfully processed.
    const { recordsWrite, dataStream } = await createRecordsWriteMessage(alice);
    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: recordsWrite.toJSON(),
      target: alice.did,
    });

    const context: RequestContext = { dwn, transport: 'http', dataStream };

    const { jsonRpcResponse } = await handleDwnProcessMessage(
      dwnRequest,
      context,
    );

    expect(jsonRpcResponse.error).to.not.exist;
    const { reply } = jsonRpcResponse.result;
    expect(reply.status.code).to.equal(202);
    expect(reply.status.detail).to.equal('Accepted');
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
  });
});
