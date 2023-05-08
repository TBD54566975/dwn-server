import fetch from 'node-fetch';
import request from 'supertest';

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { HttpApi } from '../src/http-api.js';
import { dwn, clear as clearDwn } from './test-dwn.js';
import { Cid, RecordsRead, RecordsQuery } from '@tbd54566975/dwn-sdk-js';
import { JsonRpcErrorCodes, JsonRpcErrorResponse, JsonRpcResponse, createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { createProfile, createRecordsWriteMessage, getFileAsReadStream, streamHttpRequest } from './utils.js';

let httpApi: HttpApi;
describe('http api', function() {
  before(async function() {
    httpApi = new HttpApi(dwn);
  });

  afterEach(async function() {
    await clearDwn();
  });

  it('responds with a 400 if no dwn-request header is provided', async function() {
    const response = await request(httpApi.api)
      .post('/')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.equal('request payload required.');
  });

  it('responds with a 400 if parsing dwn request fails', async function() {
    const response = await request(httpApi.api)
      .post('/')
      .set('dwn-request', ';;;;@!#@!$$#!@%')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.include('JSON');
  });

  it('exposes dwn-response header', async function() {
    // This test verifies that the Express web server includes `dwn-response` in the list of
    // `access-control-expose-headers` returned in each HTTP response. This is necessary to enable applications
    // that have CORS enabled to read and parse DWeb Messages that are returned as Response headers, particularly
    // in the case of RecordsRead messages.

    // TODO: Consider replacing this test with a more robust method of testing, such as writing Playwright tests
    // that run in a browser to verify that the `dwn-response` header can be read from the `fetch()` response
    // when CORS mode is enabled.
    const response = await request(httpApi.api)
      .post('/')
      .send();

    // Check if the 'access-control-expose-headers' header is present
    expect(response.headers).to.have.property('access-control-expose-headers');

    // Check if the 'dwn-response' header is listed in 'access-control-expose-headers'
    const exposedHeaders = response.headers['access-control-expose-headers'];
    expect(exposedHeaders).to.include('dwn-response');
  });

  it('works fine when no request body is provided', async function() {
    const alice = await createProfile();
    const recordsQuery = await RecordsQuery.create({
      filter: {
        schema: 'woosa'
      },
      authorizationSignatureInput: alice.signatureInput
    });

    const requestId = uuidv4();
    const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
      message : recordsQuery.toJSON(),
      target  : alice.did,
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
    it('handles RecordsWrite', async function() {
      const server = httpApi.listen(3000);

      const filePath = './fixtures/test.jpeg';
      const { cid, size, stream } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, { dataCid: cid, dataSize: size });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message : recordsWrite.toJSON(),
        target  : alice.did,
      });

      const resp = await streamHttpRequest('http://localhost:3000', {
        method  : 'POST',
        headers : {
          'content-type' : 'application/octet-stream',
          'dwn-request'  : JSON.stringify(dwnRequest),
        }
      }, stream);

      expect(resp.status).to.equal(200);

      const body = JSON.parse(resp.body) as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);

      server.close();
      server.closeAllConnections();
    });
  });

  describe('health check', function() {
    it('returns a health check', async function() {
      const server = httpApi.listen(3000);
      let response = await fetch('http://localhost:3000/health', {
        method: 'GET',
      });
      expect(response.status).to.equal(200);
      server.close();
      server.closeAllConnections();

    });
  });

  describe('default http get response', function() {
    it('returns returns a default message', async function() {
      const server = httpApi.listen(3000);
      let response = await fetch('http://localhost:3000/', {
        method: 'GET',
      });
      expect(response.status).to.equal(200);
      server.close();
      server.closeAllConnections();

    });
  });



  describe('RecordsRead', function() {
    it('returns message in response header and data in body', async function() {
      const server = httpApi.listen(3000);

      const filePath = './fixtures/test.jpeg';
      const { cid: expectedCid, size, stream } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, { dataCid: expectedCid, dataSize: size });

      let requestId = uuidv4();
      let dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message : recordsWrite.toJSON(),
        target  : alice.did,
      });

      let response = await fetch('http://localhost:3000', {
        method  : 'POST',
        headers : {
          'dwn-request': JSON.stringify(dwnRequest)
        },
        body: stream
      });

      expect(response.status).to.equal(200);

      const body = await response.json() as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);

      const recordsRead = await RecordsRead.create({
        authorizationSignatureInput : alice.signatureInput,
        recordId                    : recordsWrite.message.recordId
      });

      requestId = uuidv4();
      dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        target  : alice.did,
        message : recordsRead.toJSON()
      });

      response = await fetch('http://localhost:3000', {
        method  : 'POST',
        headers : {
          'dwn-request': JSON.stringify(dwnRequest)
        }
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

      server.close();
      server.closeAllConnections();
    });
  });
});

