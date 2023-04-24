import request from 'supertest';

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { base64url } from 'multiformats/bases/base64';

import { httpApi } from '../src/http-api.js';
import { Cid, DataStream, RecordsRead } from '@tbd54566975/dwn-sdk-js';
import { dataStore, eventLog, messageStore } from '../src/dwn.js';
import { JsonRpcErrorCodes, JsonRpcErrorResponse, JsonRpcResponse, createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { createProfile, createRecordsWriteMessage, getFileAsReadStream, streamHttpRequest } from './utils.js';

describe('http api', function() {
  afterEach(async function() {
    await dataStore.clear();
    await eventLog.clear();
    await messageStore.clear();
  });

  it('responds with a 400 if no dwn request is provided in header or body', async function() {
    const response = await request(httpApi)
      .post('/')
      .send();

    expect(response.statusCode).to.equal(400);

    const body = response.body as JsonRpcErrorResponse;
    expect(body.error.code).to.equal(JsonRpcErrorCodes.BadRequest);
    expect(body.error.message).to.equal('request payload required.');
  });

  it('responds with a 400 if parsing dwn request fails', async function() {
    const response = await request(httpApi)
      .post('/')
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

      const response = await request(httpApi)
        .post('/')
        .send(dwnRequest);

      expect(response.statusCode).to.equal(200);

      const body = response.body as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);
    });

    it('handles RecordsWrite with message in header and data in body as multipart/form-data', async function() {
      const filePath = './fixtures/test.jpeg';
      const { cid, size, stream } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, { dataCid: cid, dataSize: size });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message : recordsWrite.toJSON(),
        target  : alice.did,
      });

      const response = await request(httpApi)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .attach('file', stream, { filename: 'toto.jpeg', contentType: 'image/jpeg' })
        .timeout(10_000);

      expect(response.statusCode).to.equal(200);

      const body = response.body as JsonRpcResponse;
      expect(body.id).to.equal(requestId);
      expect(body.error).to.not.exist;

      const { reply } = body.result;
      expect(reply.status.code).to.equal(202);
    });

    it('handles RecordsWrite with message in header and no data in body', async function () {
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

      const response = await request(httpApi)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

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
      const filePath = './fixtures/test.jpeg';
      const { cid: expectedCid, size, stream } = await getFileAsReadStream(filePath);

      const alice = await createProfile();
      const { recordsWrite } = await createRecordsWriteMessage(alice, { dataCid: expectedCid, dataSize: size });

      let requestId = uuidv4();
      let dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message : recordsWrite.toJSON(),
        target  : alice.did,
      });

      let response = await request(httpApi)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .attach('file', stream, { filename: 'toto.jpeg', contentType: 'image/jpeg' })
        .timeout(10_000);

      expect(response.statusCode).to.equal(200);

      const body = response.body as JsonRpcResponse;
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

      response = await request(httpApi)
        .post('/')
        .send(JSON.stringify(dwnRequest));

      expect(response.statusCode).to.equal(200);
      const { headers } = response;

      expect(headers['dwn-response']).to.exist;
      const jsonRpcResponse = JSON.parse(headers['dwn-response']) as JsonRpcResponse;

      expect(jsonRpcResponse.id).to.equal(requestId);
      expect(jsonRpcResponse.error).to.not.exist;

      const { reply: recordsReadReply } = jsonRpcResponse.result;
      expect(recordsReadReply.status.code).to.equal(200);
      expect(recordsReadReply.record).to.exist;


      expect(headers['content-type']).to.exist;
      expect(headers['content-type']).to.equal('application/octet-stream');

      // can't get response as stream from supertest :(
      const cid = await Cid.computeDagPbCidFromBytes(response.body);
      expect(cid).to.equal(expectedCid);
    });
  });
});

