import fetch from 'node-fetch';
import { config } from '../../src/config.js';
import { DwnServer } from '../../src/dwn-server.js';
import { expect } from 'chai';
import { webcrypto } from 'node:crypto';

// node.js 18 and earlier needs globalThis.crypto polyfill
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

describe('Web5 Connect scenarios', function () {
  const web5ConnectBaseUrl = 'http://localhost:3000';

  let dwnServer: DwnServer;
  const dwnServerConfig = { ...config } // not touching the original config

  before(async function () {

    // NOTE: using SQL to workaround an issue where multiple instances of DwnServer can be started using LevelDB in the same test run,
    // and dwn-server.spec.ts already uses LevelDB.
    dwnServerConfig.messageStore = 'sqlite://',
    dwnServerConfig.dataStore = 'sqlite://',
    dwnServerConfig.eventLog = 'sqlite://',

    dwnServer =  new DwnServer({ config: dwnServerConfig });
    await dwnServer.start();
  });

  after(function () {
    dwnServer.stop(() => { });
  });

  beforeEach(function () {
    dwnServer.start();
  });

  afterEach(function () {
    dwnServer.stop(() => {});
  });

  it('should be able to set and get Web5 Connect Request & Response objects', async () => {
    // Scenario:
    // 1. App sends the Web5 Connect Request object to the Web5 Connect server.
    // 2. Identity Provider (wallet) fetches the Web5 Connect Request object from the Web5 Connect server.
    // 3. Should receive 404 if fetching the same Web5 Connect Request again
    // 4. Identity Provider (wallet) should receive 400 if sending an incomplete response.
    // 5. Identity Provider (wallet) sends the Web5 Connect Response object to the Web5 Connect server.
    // 6. App fetches the Web5 Connect Response object from the Web5 Connect server.
    // 7. Should receive 404 if fetching the same Web5 Connect Response object again.

    // 1. App sends the Web5 Connect Request object to the Web5 Connect server.
    const requestBody = { request: { dummyProperty: 'dummyValue' } };
    const postWeb5ConnectRequestResult = await fetch(`${web5ConnectBaseUrl}/connect/par`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    expect(postWeb5ConnectRequestResult.status).to.equal(201);

    // 2. Identity Provider (wallet) fetches the Web5 Connect Request object from the Web5 Connect server.
    const requestUrl = (await postWeb5ConnectRequestResult.json() as any).request_uri;
    const getWeb5ConnectRequestResult = await fetch(requestUrl, {
      method: 'GET',
    });
    const fetchedRequest = await getWeb5ConnectRequestResult.json();
    expect(getWeb5ConnectRequestResult.status).to.equal(200);
    expect(fetchedRequest).to.deep.equal(requestBody.request);

    // 3. Should receive 404 if fetching the same Web5 Connect Request again
    const getWeb5ConnectRequestResult2 = await fetch(requestUrl, {
      method: 'GET',
    });
    expect(getWeb5ConnectRequestResult2.status).to.equal(404);

    // 4. Identity Provider (wallet) should receive 400 if sending an incomplete response.
    const incompleteResponseBody = {
      id_token : { dummyToken: 'dummyToken' },
      // state    : 'dummyState', // intentionally missing
    };
    const postIncompleteWeb5ConnectResponseResult = await fetch(`${web5ConnectBaseUrl}/connect/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incompleteResponseBody),
    });
    expect(postIncompleteWeb5ConnectResponseResult.status).to.equal(400);

    // 5. Identity Provider (wallet) sends the Web5 Connect Response object to the Web5 Connect server.
    const web5ConnectResponseBody = {
      id_token : { dummyToken: 'dummyToken' },
      state    : 'dummyState',
    };
    const postWeb5ConnectResponseResult = await fetch(`${web5ConnectBaseUrl}/connect/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(web5ConnectResponseBody),
    });
    expect(postWeb5ConnectResponseResult.status).to.equal(201);

    // 6. App fetches the Web5 Connect Response object from the Web5 Connect server.
    const web5ConnectResponseUrl = `${web5ConnectBaseUrl}/connect/sessions/${web5ConnectResponseBody.state}.jwt`;
    const getWeb5ConnectResponseResult = await fetch(web5ConnectResponseUrl, {
      method: 'GET',
    });
    const fetchedResponse = await getWeb5ConnectResponseResult.json();
    expect(getWeb5ConnectResponseResult.status).to.equal(200);
    expect(fetchedResponse).to.deep.equal(web5ConnectResponseBody.id_token);

    // 7. Should receive 404 if fetching the same Web5 Connect Response object again.
    const getWeb5ConnectResponseResult2 = await fetch(web5ConnectResponseUrl, {
      method: 'GET',
    });
    expect(getWeb5ConnectResponseResult2.status).to.equal(404);
  });
});