// node.js 18 and earlier,  needs globalThis.crypto polyfill
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}
import { config } from '../src/config.js';
import { expect } from 'chai';
import fetch from 'node-fetch';
import { HttpApi } from '../src/http-api.js';
import type { JsonRpcResponse } from '../src/lib/json-rpc.js';

import type { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { clear as clearDwn, dwn } from './test-dwn.js';
import {
  createJsonRpcRequest,
  JsonRpcErrorCodes,
} from '../src/lib/json-rpc.js';
import {
  initializeConnect,
  shutdownConnect,
} from '../src/json-rpc-handlers/connect/connect.js';

describe('connect rpc methods', function () {
  let httpApi: HttpApi;
  let server: Server;

  before(async function () {
    httpApi = new HttpApi(dwn);
    initializeConnect(config.connectStore);
  });

  after(async function () {
    await shutdownConnect();
  });

  beforeEach(async function () {
    server = httpApi.listen(3000);
  });

  afterEach(async function () {
    server.close();
    server.closeAllConnections();
    await clearDwn();
  });

  const connectID = uuidv4(); // this is also referred to as "connectId" some places, it seems
  const requestMessage =
    'VEhJUyBDWVBIRVJURVhUIEVOQ1JZUFRFRCBXSVRIIFJPVDI2LiBST1QyNiBJUyBUV0lDRSBBUyBTRUNVUkUgQVMgUk9UMTMK'; // real ciphertext is indistinguishable from random base64-encoded data

  it('404 from non-existant record', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.getRequest', {
      uuid: connectID,
    });
    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(500); // i guess all errors are 500

    const rpcResponse = (await resp.json()) as JsonRpcResponse;
    expect(rpcResponse.error.code).to.equal(JsonRpcErrorCodes.NotFound);
  });

  it('create request record', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.createRequest', {
      message: requestMessage,
      uuid: connectID,
    });

    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(200);
  });

  it('get request record', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.getRequest', {
      uuid: connectID,
    });
    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(200); // i guess all errors are 500, even when they're client request errors

    const rpcResponse = (await resp.json()) as JsonRpcResponse;
    expect(rpcResponse.result).to.equal(requestMessage);
  });

  it('refuse to create request record with same ID', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.createRequest', {
      message: requestMessage,
      uuid: connectID,
    });

    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(500);
    const rpcResponse = (await resp.json()) as JsonRpcResponse;
    expect(rpcResponse.error.code).to.equal(JsonRpcErrorCodes.Forbidden);
  });

  const grant =
    'dGhpcyBjaXBoZXJ0ZXh0IGVuY3J5cHRlZCB3aXRoIHJvdDI2LiByb3QyNiBpcyB0d2ljZSBhcyBzZWN1cmUgYXMgcm90MTMK';

  it('404 from non-existant grant', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.getGrant', {
      id: connectID,
    });
    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(500); // i guess all errors are 500, even when they're client request errors

    const rpcResponse = (await resp.json()) as JsonRpcResponse;
    expect(rpcResponse.error.code).to.equal(JsonRpcErrorCodes.NotFound);
  });

  it('create grant', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.createGrant', {
      message: grant,
      id: connectID,
    });

    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(200);
  });

  it('get grant', async function () {
    const rpcRequest = createJsonRpcRequest(uuidv4(), 'connect.getGrant', {
      id: connectID,
    });
    const resp = await fetch('http://localhost:3000', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dwn-request': JSON.stringify(rpcRequest),
      },
    });

    expect(resp.status).to.equal(200); // i guess all errors are 500, even when they're client request errors

    const rpcResponse = (await resp.json()) as JsonRpcResponse;
    expect(rpcResponse.result).to.equal(grant);
  });
});
