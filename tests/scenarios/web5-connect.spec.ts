import fetch from 'node-fetch';
import sinon from 'sinon';
import { config } from '../../src/config.js';
import { DwnServer } from '../../src/dwn-server.js';
import { expect } from 'chai';
import { Poller } from '@tbd54566975/dwn-sdk-js';
import { useFakeTimers } from 'sinon';
import { Web5ConnectServer } from '../../src/web5-connect/web5-connect-server.js';
import { randomUUID, webcrypto } from 'node:crypto';

// node.js 18 and earlier needs globalThis.crypto polyfill
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

describe('Web5 Connect scenarios', function () {
  const web5ConnectBaseUrl = 'http://localhost:3000';

  let clock: sinon.SinonFakeTimers;
  let dwnServer: DwnServer;
  const dwnServerConfig = { ...config } // not touching the original config

  before(async function () {

    // NOTE: using SQL to workaround an issue where multiple instances of DwnServer cannot be started using LevelDB in the same test run,
    // and dwn-server.spec.ts already uses LevelDB.
    dwnServerConfig.messageStore = 'sqlite://',
    dwnServerConfig.dataStore = 'sqlite://',
    dwnServerConfig.resumableTaskStore = 'sqlite://',
    dwnServerConfig.eventLog = 'sqlite://',

    dwnServer =  new DwnServer({ config: dwnServerConfig });
  });

  after(async () => {
    await dwnServer.stop();
  });

  beforeEach(async () => {
    sinon.restore(); // wipe all previous stubs/spies/mocks/fakes/clock

    // IMPORTANT: MUST be called AFTER `sinon.restore()` because `sinon.restore()` resets fake timers
    clock = useFakeTimers({ shouldAdvanceTime: true });
    await dwnServer.start();
  });

  afterEach(async () => {
    clock.restore();
    await dwnServer.stop();
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
    const regex = /^http:\/\/localhost:3000\/connect\/authorize\/[a-zA-Z0-9\-]{21,}\.jwt$/;
    expect(requestUrl).to.match(regex);

    let getWeb5ConnectRequestResult;
    await Poller.pollUntilSuccessOrTimeout(async () => {
      console.log('Polling for Web5 Connect Request object...')
      getWeb5ConnectRequestResult = await fetch(requestUrl, { method: 'GET' });
      expect(getWeb5ConnectRequestResult.status).to.equal(200);
    });

    const fetchedRequest = await getWeb5ConnectRequestResult.json();
    expect(fetchedRequest).to.deep.equal(requestBody.request);

    // 3. Should receive 404 if fetching the same Web5 Connect Request again
    await Poller.pollUntilSuccessOrTimeout(async () => {
      const getWeb5ConnectRequestResult2 = await fetch(requestUrl, { method: 'GET' });
      expect(getWeb5ConnectRequestResult2.status).to.equal(404);
    });

    // 4. Identity Provider (wallet) should receive 400 if sending an incomplete response.
    const incompleteResponseBody = {
      id_token : { dummyToken: 'dummyToken' },
      // state    : 'dummyState', // intentionally missing
    };
    const postIncompleteWeb5ConnectResponseResult = await fetch(`${web5ConnectBaseUrl}/connect/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incompleteResponseBody),
    });
    expect(postIncompleteWeb5ConnectResponseResult.status).to.equal(400);

    const state = `dummyState-${randomUUID()}`;
    // 5. Identity Provider (wallet) sends the Web5 Connect Response object to the Web5 Connect server.
    const web5ConnectResponseBody = {
      id_token : { dummyToken: 'dummyToken' },
      state
    };
    const postWeb5ConnectResponseResult = await fetch(`${web5ConnectBaseUrl}/connect/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(web5ConnectResponseBody),
    });
    expect(postWeb5ConnectResponseResult.status).to.equal(201);

    // 6. App fetches the Web5 Connect Response object from the Web5 Connect server.
    const web5ConnectResponseUrl = `${web5ConnectBaseUrl}/connect/token/${web5ConnectResponseBody.state}.jwt`;

    let getWeb5ConnectResponseResult;
    await Poller.pollUntilSuccessOrTimeout(async () => {
      getWeb5ConnectResponseResult = await fetch(web5ConnectResponseUrl, { method: 'GET' });
      expect(getWeb5ConnectResponseResult.status).to.equal(200);
    });
  
    const fetchedResponse = await getWeb5ConnectResponseResult.json();
    expect(fetchedResponse).to.deep.equal(web5ConnectResponseBody.id_token);

    // 7. Should receive 404 if fetching the same Web5 Connect Response object again.
    await Poller.pollUntilSuccessOrTimeout(async () => {
      const getWeb5ConnectResponseResult2 = await fetch(web5ConnectResponseUrl, { method: 'GET' });
      expect(getWeb5ConnectResponseResult2.status).to.equal(404);
    });
  });

  it('should clean up objects that are expired', async () => {
    // Scenario:
    // 1. App sends the Web5 Connect Request object to the Web5 Connect server.
    // 2. Time passes and the Web5 Connect Request object is expired.
    // 3. Should receive 404 when fetching  Web5 Connect Request.

    // 1. App sends the Web5 Connect Request object to the Web5 Connect server.
    const requestBody = { request: { dummyProperty: 'dummyValue' } };
    const postWeb5ConnectRequestResult = await fetch(`${web5ConnectBaseUrl}/connect/par`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    expect(postWeb5ConnectRequestResult.status).to.equal(201);

    // 2. Time passes and the Web5 Connect Request object is expired.
    await clock.tickAsync(Web5ConnectServer.ttlInSeconds * 1000);

    // 3. Should receive 404 when fetching the expired Web5 Connect Request.
    const requestUrl = (await postWeb5ConnectRequestResult.json() as any).request_uri;
    const getWeb5ConnectRequestResult = await fetch(requestUrl, {
      method: 'GET',
    });
    expect(getWeb5ConnectRequestResult.status).to.equal(404);
  });
});
