import {
  Cid,
  DataStream,
  RecordsQuery,
  RecordsRead,
} from '@tbd54566975/dwn-sdk-js';
import {
  JsonRpcErrorCodes,
  createJsonRpcRequest,
} from '../src/lib/json-rpc.js';
import type {
  JsonRpcErrorResponse,
  JsonRpcResponse,
} from '../src/lib/json-rpc.js';
import { clear as clearDwn, dwn } from './test-dwn.js';
import {
  createProfile,
  createRecordsWriteMessage,
  getFileAsReadStream,
  streamHttpRequest,
} from './utils.js';

import { HttpApi } from '../src/http-api.js';
import type { Server } from 'http';
import { expect } from 'chai';
import fetch from 'node-fetch';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
// node.js 18 and earlier,  needs globalThis.crypto polyfill
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

describe('http api', function () {
  let httpApi: HttpApi;
  let server: Server;

  before(async function () {
    httpApi = new HttpApi(dwn);
  });

  beforeEach(async function () {
    server = httpApi.start(3000);
  });

  afterEach(async function () {
    server.close();
    server.closeAllConnections();
    await clearDwn();
  });

  it('responds with a 400 if no dwn-request header is provided', async function () {
    const response = await request(httpApi.api).post('/').send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.equal('request payload required.');
  });

  it('responds with a 400 if parsing dwn request fails', async function () {
    const response = await request(httpApi.api)
      .post('/')
      .set('dwn-request', ';;;;@!#@!$$#!@%')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.include('JSON');
  });

  it('responds with a 2XX HTTP status if JSON RPC handler returns 4XX/5XX DWN status code', async function () {
    const alice = await createProfile();
    const { recordsWrite, dataStream } = await createRecordsWriteMessage(alice);

    // Intentionally delete a required property to produce an invalid RecordsWrite message.
    const message = recordsWrite.toJSON();
    delete message['descriptor']['interface'];

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: message,
      target: alice.did,
    });

    const dataBytes = await DataStream.toBytes(dataStream);

    // Attempt an initial RecordsWrite with the invalid message to ensure the DWN returns an error.
    const responseInitialWrite = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify(dwnRequest),
      },
      body: new Blob([dataBytes]),
    });

    expect(responseInitialWrite.status).to.equal(200);

    const body = (await responseInitialWrite.json()) as JsonRpcResponse;
    expect(body.id).to.equal(requestId);
    expect(body.error).to.not.exist;

    const { reply } = body.result;
    expect(reply.status.code).to.equal(400);
    expect(reply.status.detail).to.include(
      'Both interface and method must be present',
    );
  });

  it('exposes dwn-response header', async function () {
    // This test verifies that the Express web server includes `dwn-response` in the list of
    // `access-control-expose-headers` returned in each HTTP response. This is necessary to enable applications
    // that have CORS enabled to read and parse DWeb Messages that are returned as Response headers, particularly
    // in the case of RecordsRead messages.

    // TODO: github.com/TBD54566975/dwn-server/issues/50
    // Consider replacing this test with a more robust method of testing, such as writing Playwright tests
    // that run in a browser to verify that the `dwn-response` header can be read from the `fetch()` response
    // when CORS mode is enabled.
    const response = await request(httpApi.api).post('/').send();

    // Check if the 'access-control-expose-headers' header is present
    expect(response.headers).to.have.property('access-control-expose-headers');

    // Check if the 'dwn-response' header is listed in 'access-control-expose-headers'
    const exposedHeaders = response.headers['access-control-expose-headers'];
    expect(exposedHeaders).to.include('dwn-response');
  });

  it('works fine when no request body is provided', async function () {
    const alice = await createProfile();
    const recordsQuery = await RecordsQuery.create({
      filter: {
        schema: 'woosa',
      },
      authorizationSigner: alice.signer,
    });

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message: recordsQuery.toJSON(),
      target: alice.did,
    });

    const response = await request(httpApi.api)
      .post('/')
      .set('dwn-request', JSON.stringify(dwnRequest))
      .send();

    expect(response.statusCode).to.equal(200);
    expect(response.body.id).to.equal(requestId);
    expect(response.body.error).to.not.exist;
    expect(response.body.result.reply.status.code).to.equal(200);
  });

  describe('RecordsWrite', function () {
    it('handles RecordsWrite with request body', async function () {
      const filePath = './fixtures/test.jpeg';
      const { cid, size, stream } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, {
        dataCid: cid,
        dataSize: size,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: alice.did,
      });

      const resp = await streamHttpRequest(
        'http://localhost:3000',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'dwn-request': JSON.stringify(dwnRequest),
          },
        },
        stream,
      );

      expect(resp.status).to.equal(200);

      const body = JSON.parse(resp.body) as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);
    });

    it('handles RecordsWrite overwrite that does not mutate data', async function () {
      const alice = await createProfile();

      // First RecordsWrite that creates the record.
      const { recordsWrite: initialWrite, dataStream } =
        await createRecordsWriteMessage(alice);
      const dataBytes = await DataStream.toBytes(dataStream);
      let requestId = uuidv4();
      let dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: initialWrite.toJSON(),
        target: alice.did,
      });

      const responseInitialWrite = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
        body: new Blob([dataBytes]),
      });

      expect(responseInitialWrite.status).to.equal(200);

      // Subsequent RecordsWrite that mutates the published property of the record.
      const { recordsWrite: overWrite } = await createRecordsWriteMessage(
        alice,
        {
          recordId: initialWrite.message.recordId,
          dataCid: initialWrite.message.descriptor.dataCid,
          dataSize: initialWrite.message.descriptor.dataSize,
          dateCreated: initialWrite.message.descriptor.dateCreated,
          published: true,
        },
      );

      requestId = uuidv4();
      dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: overWrite.toJSON(),
        target: alice.did,
      });
      const responseOverwrite = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
      });

      expect(responseOverwrite.status).to.equal(200);

      const body = (await responseOverwrite.json()) as JsonRpcResponse;
      expect(body.error).to.not.exist;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);
    });

    it('handles a RecordsWrite tombstone', async function () {
      const alice = await createProfile();
      const { recordsWrite: tombstone } =
        await createRecordsWriteMessage(alice);

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: tombstone.toJSON(),
        target: alice.did,
      });

      const responeTombstone = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
      });

      expect(responeTombstone.status).to.equal(200);
    });
  });

  describe('health check', function () {
    it('returns a health check', async function () {
      const response = await fetch('http://localhost:3000/health', {
        method: 'GET',
      });
      expect(response.status).to.equal(200);
    });
  });

  describe('default http get response', function () {
    it('returns returns a default message', async function () {
      const response = await fetch('http://localhost:3000/', {
        method: 'GET',
      });
      expect(response.status).to.equal(200);
    });
  });

  describe('RecordsRead', function () {
    it('returns message in response header and data in body', async function () {
      const filePath = './fixtures/test.jpeg';
      const {
        cid: expectedCid,
        size,
        stream,
      } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, {
        dataCid: expectedCid,
        dataSize: size,
      });

      let requestId = uuidv4();
      let dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: alice.did,
      });

      let response = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
        body: stream,
      });

      expect(response.status).to.equal(200);

      const body = (await response.json()) as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);

      const recordsRead = await RecordsRead.create({
        authorizationSigner: alice.signer,
        filter: {
          recordId: recordsWrite.message.recordId,
        },
      });

      requestId = uuidv4();
      dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        target: alice.did,
        message: recordsRead.toJSON(),
      });

      response = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
      });

      expect(response.status).to.equal(200);

      const { headers } = response;

      const contentType = headers.get('content-type');
      expect(contentType).to.not.be.undefined;
      expect(contentType).to.equal('application/octet-stream');

      const dwnResponse = headers.get('dwn-response');
      expect(dwnResponse).to.not.be.undefined;

      const jsonRpcResponse = JSON.parse(dwnResponse) as JsonRpcResponse;

      expect(jsonRpcResponse.id).to.equal(requestId);
      expect(jsonRpcResponse.error).to.not.exist;

      const { reply: recordsReadReply } = jsonRpcResponse.result;
      expect(recordsReadReply.status.code).to.equal(200);
      expect(recordsReadReply.record).to.exist;

      // can't get response as stream from supertest :(
      const cid = await Cid.computeDagPbCidFromStream(response.body as any);
      expect(cid).to.equal(expectedCid);
    });
  });

  describe('/:did/records/:id', function () {
    it('returns record data if record is published', async function () {
      const filePath = './fixtures/test.jpeg';
      const {
        cid: expectedCid,
        size,
        stream,
      } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, {
        dataCid: expectedCid,
        dataSize: size,
        published: true,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: alice.did,
      });

      let response = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
        body: stream,
      });

      expect(response.status).to.equal(200);

      const body = (await response.json()) as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);

      response = await fetch(
        `http://localhost:3000/${alice.did}/records/${recordsWrite.message.recordId}`,
      );
      const blob = await response.blob();

      expect(blob.size).to.equal(size);
    });

    it('returns a 404 if an unpublished record is requested', async function () {
      const filePath = './fixtures/test.jpeg';
      const {
        cid: expectedCid,
        size,
        stream,
      } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, {
        dataCid: expectedCid,
        dataSize: size,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: alice.did,
      });

      let response = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
        body: stream,
      });

      expect(response.status).to.equal(200);

      const body = (await response.json()) as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);

      response = await fetch(
        `http://localhost:3000/${alice.did}/records/${recordsWrite.message.recordId}`,
      );

      expect(response.status).to.equal(404);
    });

    it('returns a 404 if record doesnt exist', async function () {
      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice);

      const response = await fetch(
        `http://localhost:3000/${alice.did}/records/${recordsWrite.message.recordId}`,
      );
      expect(response.status).to.equal(404);
    });

    it('returns a 404 for invalid did', async function () {
      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice);

      const response = await fetch(
        `http://localhost:3000/1234567892345678/records/${recordsWrite.message.recordId}`,
      );
      expect(response.status).to.equal(404);
    });

    it('returns a 404 for invalid record id', async function () {
      const alice = await createProfile();
      const response = await fetch(
        `http://localhost:3000/${alice.did}/records/kaka`,
      );
      expect(response.status).to.equal(404);
    });
  });
});
