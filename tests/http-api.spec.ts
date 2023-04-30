import fetch from 'node-fetch';
import request from 'supertest';

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { base64url } from 'multiformats/bases/base64';

import { HttpApi } from '../src/http-api.js';
import { dwn, clear as clearDwn } from './test-dwn.js';
import { Cid, DataStream, RecordsRead } from '@tbd54566975/dwn-sdk-js';
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

  it('responds with a 400 if content-type request header is missing', async function() {
    const response = await request(httpApi.api)
      .post('/')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.equal('content-type is required.');
  });

  it('responds with a 400 if no dwn request is provided in body when content type is application/json', async function() {
    const response = await request(httpApi.api)
      .post('/')
      .set('content-type', 'application/json')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.equal('request payload required.');
  });

  it('responds with a 400 if no dwn-request header is provided when content type is application/octet-stream', async function() {
    const response = await request(httpApi.api)
      .post('/')
      .set('content-type', 'application/octet-stream')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.equal('request payload required.');
  });

  it('responds with a 400 if parsing dwn request fails', async function() {
    const response = await request(httpApi.api)
      .post('/')
      .set('content-type', 'application/json')
      .send(';;;;@!#@!$$#!@%');

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.include('JSON');
  });

  describe('RecordsWrite', function() {
    it('handles RecordsWrite with message in body', async function() {
      const alice = await createProfile();
      const { recordsWrite, dataStream } = await createRecordsWriteMessage(alice);
      const dataBytes = await DataStream.toBytes(dataStream);
      const encodedData = base64url.baseEncode(dataBytes);

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message : recordsWrite.toJSON(),
        target  : alice.did,
        encodedData
      });

      const response = await request(httpApi.api)
        .post('/')
        .set('content-type', 'application/json')
        .send(dwnRequest);

      expect(response.statusCode).to.equal(200);

      const body = response.body as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);
    });

    it('handles RecordsWrite with message in header and data in body as application/octet-stream', async function() {
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
          'content-type' : 'application/octet-stream',
          'dwn-request'  : JSON.stringify(dwnRequest)
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
          'content-type': 'application/json'
        },
        body: JSON.stringify(dwnRequest)
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

