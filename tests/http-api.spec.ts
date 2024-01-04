// node.js 18 and earlier,  needs globalThis.crypto polyfill
import {
  Cid,
  DataStream,
  DidKeyResolver,
  RecordsQuery,
  RecordsRead,
  Time,
} from '@tbd54566975/dwn-sdk-js';
import type { Dwn } from '@tbd54566975/dwn-sdk-js';

import { expect } from 'chai';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import type { Server } from 'http';
import fetch from 'node-fetch';
import { webcrypto } from 'node:crypto';
import { useFakeTimers } from 'sinon';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../src/config.js';
import { HttpApi } from '../src/http-api.js';
import type {
  JsonRpcErrorResponse,
  JsonRpcResponse,
} from '../src/lib/json-rpc.js';
import {
  createJsonRpcRequest,
  JsonRpcErrorCodes,
} from '../src/lib/json-rpc.js';
import type { RegisteredTenantGate } from '../src/registered-tenant-gate.js';
import { getTestDwn } from './test-dwn.js';
import type { Profile } from './utils.js';
import {
  createRecordsWriteMessage,
  getFileAsReadStream,
  streamHttpRequest,
  checkNonce,
  generateNonce,
} from './utils.js';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

describe('http api', function () {
  let httpApi: HttpApi;
  let server: Server;
  let profile: Profile;
  let tenantGate: RegisteredTenantGate;
  let dwn: Dwn;
  let clock;

  before(async function () {
    clock = useFakeTimers({ shouldAdvanceTime: true });

    config.registrationProofOfWorkEnabled = true;
    config.termsOfServiceFilePath = './tests/fixtures/terms-of-service.txt';
    const testDwn = await getTestDwn(true, true);
    dwn = testDwn.dwn;
    tenantGate = testDwn.tenantGate;

    httpApi = new HttpApi(dwn, tenantGate);

    await tenantGate.initialize();
    profile = await DidKeyResolver.generate();
    await tenantGate.authorizeTenantProofOfWork(profile.did);
    await tenantGate.authorizeTenantTermsOfService(profile.did);
  });

  beforeEach(async function () {
    server = await httpApi.start(3000);
  });

  afterEach(async function () {
    server.close();
    server.closeAllConnections();
  });

  after(function () {
    clock.restore();
  });

  describe('/register/proof-of-work', function () {
    const proofOfWorkUrl = 'http://localhost:3000/register/proof-of-work';

    it('returns a register challenge', async function () {
      const response = await fetch(proofOfWorkUrl);
      expect(response.status).to.equal(200);
      const body = (await response.json()) as {
        challenge: string;
        complexity: number;
      };
      expect(body.challenge.length).to.equal(16);
      expect(body.complexity).to.equal(5);
    });

    it('accepts a correct registration challenge', async function () {
      const challengeResponse = await fetch(proofOfWorkUrl);
      expect(challengeResponse.status).to.equal(200);
      const body = (await challengeResponse.json()) as {
        challenge: string;
        complexity: number;
      };
      expect(body.challenge.length).to.equal(16);
      expect(body.complexity).to.equal(5);

      // solve the challenge
      let response = '';
      while (!checkNonce(body.challenge, response, body.complexity)) {
        response = generateNonce(5);
      }

      const p = await DidKeyResolver.generate();
      const submitResponse = await fetch(proofOfWorkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: body.challenge,
          response: response,
          did: p.did,
        }),
      });

      expect(submitResponse.status).to.equal(200);

      await tenantGate.authorizeTenantTermsOfService(p.did);

      const recordsQuery = await RecordsQuery.create({
        filter: { schema: 'woosa' },
        signer: p.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: p.did,
      });

      const rpcResponse = await request(httpApi.api)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

      console.log(rpcResponse.body.result.reply.status);
      expect(rpcResponse.statusCode).to.equal(200);
      expect(rpcResponse.body.id).to.equal(requestId);
      expect(rpcResponse.body.result.reply.status.code).to.equal(200);
    }).timeout(30000);

    it('rejects a registration challenge 5 minutes after it was issued', async function () {
      const challengeResponse = await fetch(proofOfWorkUrl);
      expect(challengeResponse.status).to.equal(200);
      const body = (await challengeResponse.json()) as {
        challenge: string;
        complexity: number;
      };
      expect(body.challenge.length).to.equal(16);
      expect(body.complexity).to.equal(5);

      clock.tick(5 * 60 * 1000);
      clock.runToLast();

      // solve the challenge
      let response = '';
      while (!checkNonce(body.challenge, response, body.complexity)) {
        response = generateNonce(5);
      }

      const p = await DidKeyResolver.generate();
      const submitResponse = await fetch(proofOfWorkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: body.challenge,
          response: response,
          did: p.did,
        }),
      });

      expect(submitResponse.status).to.equal(401);
    }).timeout(30000);

    it('increase complexity as more challenges are completed', async function () {
      for (let i = 1; i <= 60; i++) {
        tenantGate.authorizeTenantProofOfWork(
          (await DidKeyResolver.generate()).did,
        );
      }

      const p = await DidKeyResolver.generate();
      const challengeResponse = await fetch(proofOfWorkUrl);
      expect(challengeResponse.status).to.equal(200);
      const body = (await challengeResponse.json()) as {
        challenge: string;
        complexity: number;
      };
      expect(body.challenge.length).to.equal(16);

      // solve the challenge
      let response = '';
      let iterations = 0;
      const start = Date.now();
      while (!checkNonce(body.challenge, response, body.complexity)) {
        response = generateNonce(5);
        iterations++;
        if (iterations % 10000000 == 0) {
          console.log(
            'complexity:',
            body.complexity,
            'iteration count:',
            iterations,
            'duration:',
            Date.now() - start,
            'ms',
          );
        }
      }

      console.log(
        'complexity:',
        body.complexity,
        'iteration count:',
        iterations,
        'duration:',
        Date.now() - start,
        'ms',
      );

      const submitResponse = await fetch(proofOfWorkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: body.challenge,
          response: response,
          did: p.did,
        }),
      });

      expect(submitResponse.status).to.equal(200);
    }).timeout(120000);

    it('rejects an invalid nonce', async function () {
      const challengeResponse = await fetch(proofOfWorkUrl);
      expect(challengeResponse.status).to.equal(200);
      const body = (await challengeResponse.json()) as {
        challenge: string;
        complexity: number;
      };
      expect(body.challenge.length).to.equal(16);

      // generate a nonce
      let response = generateNonce(5);
      // make sure the nonce is INVALID
      // loop continues until checkNonce returns false, which is will probably do on the first iteration
      while (checkNonce(body.challenge, response, body.complexity)) {
        response = generateNonce(5);
      }

      const p = await DidKeyResolver.generate();
      const submitResponse = await fetch(proofOfWorkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: body.challenge,
          response: response,
          did: p.did,
        }),
      });

      expect(submitResponse.status).to.equal(401);
    });

    it('rejects a challenge it did not issue', async function () {
      const challenge = generateNonce(10);

      // solve the challenge
      let response = '';
      while (!checkNonce(challenge, response, 2)) {
        response = generateNonce(5);
      }

      const p = await DidKeyResolver.generate();
      const submitResponse = await fetch(proofOfWorkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: challenge,
          response: response,
          did: p.did,
        }),
      });

      expect(submitResponse.status).to.equal(401);
    });

    it('rejects tenants that have not accepted the terms of use and have not completed proof-of-work', async function () {
      const unauthorized = await DidKeyResolver.generate();
      const recordsQuery = await RecordsQuery.create({
        filter: { schema: 'woosa' },
        signer: unauthorized.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: unauthorized.did,
      });

      const response = await request(httpApi.api)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

      expect(response.statusCode).to.equal(200);
      expect(response.body.id).to.equal(requestId);
      expect(response.body.result.reply.status.code).to.equal(401);
    });

    it('rejects tenants that have accepted the terms of use but not completed proof-of-work', async function () {
      const unauthorized = await DidKeyResolver.generate();
      await tenantGate.authorizeTenantTermsOfService(unauthorized.did);
      const recordsQuery = await RecordsQuery.create({
        filter: { schema: 'woosa' },
        signer: unauthorized.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: unauthorized.did,
      });

      const response = await request(httpApi.api)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

      expect(response.statusCode).to.equal(200);
      expect(response.body.id).to.equal(requestId);
      expect(response.body.result.reply.status.code).to.equal(401);
    });
  });

  describe('/register/terms-of-service', function () {
    it('allow tenant that after accepting the terms of service', async function () {
      const response = await fetch(
        'http://localhost:3000/register/terms-of-service',
      );
      expect(response.status).to.equal(200);

      const terms = await response.text();

      expect(terms).to.equal(
        readFileSync('./tests/fixtures/terms-of-service.txt').toString(),
      );

      const hash = createHash('sha256');
      hash.update(terms);

      const p = await DidKeyResolver.generate();

      const acceptResponse = await fetch(
        'http://localhost:3000/register/terms-of-service',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            did: p.did,
            termsOfServiceHash: hash.digest('hex'),
          }),
        },
      );
      expect(acceptResponse.status).to.equal(200);
      await tenantGate.authorizeTenantProofOfWork(p.did);

      const recordsQuery = await RecordsQuery.create({
        filter: { schema: 'woosa' },
        signer: p.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: p.did,
      });

      const rpcResponse = await request(httpApi.api)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

      console.log(rpcResponse.body.result.reply.status);
      expect(rpcResponse.statusCode).to.equal(200);
      expect(rpcResponse.body.id).to.equal(requestId);
      expect(rpcResponse.body.result.reply.status.code).to.equal(200);
    });

    it('rejects tenants that have completed proof-of-work but have not accepted the terms of use', async function () {
      const unauthorized = await DidKeyResolver.generate();
      await tenantGate.authorizeTenantProofOfWork(unauthorized.did);
      const recordsQuery = await RecordsQuery.create({
        filter: { schema: 'woosa' },
        signer: unauthorized.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: unauthorized.did,
      });

      const response = await request(httpApi.api)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

      expect(response.statusCode).to.equal(200);
      expect(response.body.id).to.equal(requestId);
      expect(response.body.result.reply.status.code).to.equal(401);
    });

    it('rejects terms of use acceptance with incorrect hash', async function () {
      const hash = createHash('sha256');
      hash.update('i do not agree');

      const p = await DidKeyResolver.generate();

      const acceptResponse = await fetch(
        'http://localhost:3000/register/terms-of-service',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            did: p.did,
            termsOfServiceHash: hash.digest('hex'),
          }),
        },
      );
      expect(acceptResponse.status).to.equal(400);
      await tenantGate.authorizeTenantProofOfWork(p.did);

      const recordsQuery = await RecordsQuery.create({
        filter: { schema: 'woosa' },
        signer: p.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: p.did,
      });

      const rpcResponse = await request(httpApi.api)
        .post('/')
        .set('dwn-request', JSON.stringify(dwnRequest))
        .send();

      console.log(rpcResponse.body.result.reply.status);
      expect(rpcResponse.statusCode).to.equal(200);
      expect(rpcResponse.body.id).to.equal(requestId);
      expect(rpcResponse.body.result.reply.status.code).to.equal(401);
    });
  });

  describe('/ (rpc)', function () {
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
      const { recordsWrite, dataStream } =
        await createRecordsWriteMessage(profile);

      // Intentionally delete a required property to produce an invalid RecordsWrite message.
      const message = recordsWrite.toJSON();
      delete message['descriptor']['interface'];

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: message,
        target: profile.did,
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
      expect(response.headers).to.have.property(
        'access-control-expose-headers',
      );

      // Check if the 'dwn-response' header is listed in 'access-control-expose-headers'
      const exposedHeaders = response.headers['access-control-expose-headers'];
      expect(exposedHeaders).to.include('dwn-response');
    });

    it('works fine when no request body is provided', async function () {
      const recordsQuery = await RecordsQuery.create({
        filter: {
          schema: 'woosa',
        },
        signer: profile.signer,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsQuery.toJSON(),
        target: profile.did,
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
  });

  describe('RecordsWrite', function () {
    it('handles RecordsWrite with request body', async function () {
      const filePath = './fixtures/test.jpeg';
      const { cid, size, stream } = await getFileAsReadStream(filePath);

      const { recordsWrite } = await createRecordsWriteMessage(profile, {
        dataCid: cid,
        dataSize: size,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: profile.did,
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
      const p = await DidKeyResolver.generate();
      await tenantGate.authorizeTenantProofOfWork(p.did);
      await tenantGate.authorizeTenantTermsOfService(p.did);

      // First RecordsWrite that creates the record.
      const { recordsWrite: initialWrite, dataStream } =
        await createRecordsWriteMessage(p);
      const dataBytes = await DataStream.toBytes(dataStream);
      let requestId = uuidv4();
      let dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: initialWrite.toJSON(),
        target: p.did,
      });

      const responseInitialWrite = await fetch('http://localhost:3000', {
        method: 'POST',
        headers: {
          'dwn-request': JSON.stringify(dwnRequest),
        },
        body: new Blob([dataBytes]),
      });

      expect(responseInitialWrite.status).to.equal(200);

      // Waiting for minimal time to make sure subsequent RecordsWrite has a later timestamp.
      await Time.minimalSleep();

      // Subsequent RecordsWrite that mutates the published property of the record.
      const { recordsWrite: overWrite } = await createRecordsWriteMessage(p, {
        recordId: initialWrite.message.recordId,
        dataCid: initialWrite.message.descriptor.dataCid,
        dataSize: initialWrite.message.descriptor.dataSize,
        dateCreated: initialWrite.message.descriptor.dateCreated,
        published: true,
      });

      requestId = uuidv4();
      dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: overWrite.toJSON(),
        target: p.did,
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
      console.log(reply);
      expect(reply.status.code).to.equal(202);
    });

    it('handles a RecordsWrite tombstone', async function () {
      const { recordsWrite: tombstone } =
        await createRecordsWriteMessage(profile);

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: tombstone.toJSON(),
        target: profile.did,
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

      const { recordsWrite } = await createRecordsWriteMessage(profile, {
        dataCid: expectedCid,
        dataSize: size,
      });

      let requestId = uuidv4();
      let dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: profile.did,
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
        signer: profile.signer,
        filter: {
          recordId: recordsWrite.message.recordId,
        },
      });

      requestId = uuidv4();
      dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        target: profile.did,
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

      const { recordsWrite } = await createRecordsWriteMessage(profile, {
        dataCid: expectedCid,
        dataSize: size,
        published: true,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: profile.did,
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
        `http://localhost:3000/${profile.did}/records/${recordsWrite.message.recordId}`,
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

      const { recordsWrite } = await createRecordsWriteMessage(profile, {
        dataCid: expectedCid,
        dataSize: size,
      });

      const requestId = uuidv4();
      const dwnRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
        message: recordsWrite.toJSON(),
        target: profile.did,
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
        `http://localhost:3000/${profile.did}/records/${recordsWrite.message.recordId}`,
      );

      expect(response.status).to.equal(404);
    });

    it('returns a 404 if record doesnt exist', async function () {
      const { recordsWrite } = await createRecordsWriteMessage(profile);

      const response = await fetch(
        `http://localhost:3000/${profile.did}/records/${recordsWrite.message.recordId}`,
      );
      expect(response.status).to.equal(404);
    });

    it('returns a 404 for invalid or unauthorized did', async function () {
      const unauthorized = await DidKeyResolver.generate();
      const { recordsWrite } = await createRecordsWriteMessage(unauthorized);

      const response = await fetch(
        `http://localhost:3000/${unauthorized.did}/records/${recordsWrite.message.recordId}`,
      );
      expect(response.status).to.equal(404);
    });

    it('returns a 404 for invalid record id', async function () {
      const response = await fetch(
        `http://localhost:3000/${profile.did}/records/kaka`,
      );
      expect(response.status).to.equal(404);
    });
  });

  describe('/info.json', function () {
    it('verify /info.json has some of the fields it is supposed to have', async function () {
      const resp = await fetch(`http://localhost:3000/info.json`);
      expect(resp.status).to.equal(200);

      const info = await resp.json();
      expect(info['server']).to.equal('@web5/dwn-server');
      expect(info['registrationRequirements']).to.include('terms-of-service');
      expect(info['registrationRequirements']).to.include(
        'proof-of-work-sha256-v0',
      );
    });
  });
});
