import type { JsonRpcSuccessResponse } from '../../src/lib/json-rpc.js';
import type { Readable } from 'readable-stream';

import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';
import DataStoreSqlite from '../plugins/data-store-sqlite.js';
import fetch from 'node-fetch';
import sinon from 'sinon';

import { config } from '../../src/config.js';
import { createJsonRpcRequest } from '../../src/lib/json-rpc.js';
import { DwnServer } from '../../src/dwn-server.js';
import { getFileAsReadStream } from '../utils.js';
import { v4 as uuidv4 } from 'uuid';

import { Cid, DwnConstant, Jws, ProtocolsConfigure, RecordsRead, RecordsWrite, TestDataGenerator } from '@tbd54566975/dwn-sdk-js';
import { DidDht, DidKey, UniversalResolver } from '@web5/dids';

// node.js 18 and earlier needs globalThis.crypto polyfill
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

chai.use(chaiAsPromised);

describe('Dynamic DWN plugin loading', function () {
  let dwnServer: DwnServer;

  afterEach(async () => {
    // clock.restore();
    if (dwnServer !== undefined) {
      await dwnServer.stop();
    }
  });

  it('should fail dynamically loading a non-existent plugin', async () => {
    const dwnServerConfigCopy = { ...config }; // not touching the original config
    dwnServerConfigCopy.dataStore = './non-existent-plugin.js';

    const invalidDwnServer = new DwnServer({ config: dwnServerConfigCopy });
    await expect(invalidDwnServer.start()).to.be.rejectedWith('Failed to load component at ./non-existent-plugin.js');
  });

  it('should be able to dynamically load and use custom data store implementation', async () => {
    // Scenario:
    // 1. Configure DWN to load a custom data store plugin.
    // 2. Validate that the constructor of the plugin is called.
    // 3. Validate that the DWN instance is using the custom data store plugin.

    // NOTE: was not able to spy on constructor directly, so spying on a method that is called in the constructor
    const customDataStoreConstructorSpy = sinon.spy(DataStoreSqlite, 'spyingTheConstructor');

    // 1. Configure DWN to load a custom data store plugin.
    const dwnServerConfigCopy = { ...config }; // not touching the original config
    dwnServerConfigCopy.registrationStoreUrl = undefined; // allow all traffic
    dwnServerConfigCopy.messageStore = 'sqlite://';
    dwnServerConfigCopy.dataStore = '../tests/plugins/data-store-sqlite.js';
    dwnServerConfigCopy.eventLog = 'sqlite://';

    // 2. Validate that the constructor of the plugin is called.
    // CRITICAL: We need to create a custom DID resolver that does not use a LevelDB based cache (which is the default cache used in `DWN`)
    // otherwise we will receive a `Database is not open` coming from LevelDB.
    // This is likely due to the fact that LevelDB is the default cache used in `DWN`, and we have tests creating default DWN instances,
    // so here we have to create a DWN that does not use the same LevelDB cache to avoid hitting LevelDB locked issues.
    // Long term we should investigate and unify approach of DWN instantiation taken by tests to avoid this "workaround" entirely. 
    const didResolver = new UniversalResolver({
      didResolvers : [DidDht, DidKey],
    });
    dwnServer = new DwnServer({ config: dwnServerConfigCopy, didResolver });
    await dwnServer.start();
    expect(customDataStoreConstructorSpy.calledOnce).to.be.true;

    // 3. Validate that the DWN instance is using the custom data store plugin.
    const dwnUrl = `${dwnServerConfigCopy.baseUrl}:${dwnServerConfigCopy.port}`;
    await sanityTestDwnReadWrite(dwnUrl);
  });
});

/**
 * Sanity test RecordsWrite and RecordsRead on the DWN instance.
 */
async function sanityTestDwnReadWrite(dwnUrl: string): Promise<void> {
  const alice = await TestDataGenerator.generateDidKeyPersona();
  const aliceSigner = Jws.createSigner(alice);
  // await registrationManager.recordTenantRegistration({ did: alice.did, termsOfServiceHash: registrationManager.getTermsOfServiceHash()});

  // install minimal protocol on Alice's DWN
  const protocolDefinition = {
    protocol: 'http://minimal.xyz',
    published: false,
    types: {
      foo: {}
    },
    structure: {
      foo: {}
    }
  };

  const protocolsConfig = await ProtocolsConfigure.create({
    signer: aliceSigner,
    definition: protocolDefinition
  });

  const protocolConfigureRequestId = uuidv4();
  const protocolConfigureRequest = createJsonRpcRequest(protocolConfigureRequestId, 'dwn.processMessage', {
    target: alice.did,
    message: protocolsConfig.message,
  });
  const protocolConfigureResponse = await fetch(dwnUrl, {
    method: 'POST',
    headers: {
      'dwn-request': JSON.stringify(protocolConfigureRequest),
    }
  });
  const protocolConfigureResponseBody = await protocolConfigureResponse.json() as JsonRpcSuccessResponse;

  expect(protocolConfigureResponse.status).to.equal(200);
  expect(protocolConfigureResponseBody.result.reply.status.code).to.equal(202);

  // Alice writing a file larger than max data size allowed to be encoded directly in the DWN Message Store.
  const filePath = './fixtures/test.jpeg';
  const {
    cid: dataCid,
    size: dataSize,
    stream
  } = await getFileAsReadStream(filePath);
  expect(dataSize).to.be.greaterThan(DwnConstant.maxDataSizeAllowedToBeEncoded);

  const recordsWrite = await RecordsWrite.create({
    signer: aliceSigner,
    dataFormat: 'image/jpeg',
    dataCid,
    dataSize
  });

  const recordsWriteRequestId = uuidv4();
  const recordsWriteRequest = createJsonRpcRequest(recordsWriteRequestId, 'dwn.processMessage', {
    target: alice.did,
    message: recordsWrite.message,
  });
  const recordsWriteResponse = await fetch(dwnUrl, {
    method: 'POST',
    headers: {
      'dwn-request': JSON.stringify(recordsWriteRequest),
    },
    body: stream
  });
  const recordsWriteResponseBody = await recordsWriteResponse.json() as JsonRpcSuccessResponse;

  expect(recordsWriteResponse.status).to.equal(200);
  expect(recordsWriteResponseBody.result.reply.status.code).to.equal(202);

  // Alice reading the file back out.
  const recordsRead = await RecordsRead.create({
    signer: aliceSigner,
    filter: {
      recordId: recordsWrite.message.recordId,
    },
  });

  const recordsReadRequestId = uuidv4();
  const recordsReadRequest = createJsonRpcRequest(recordsReadRequestId, 'dwn.processMessage', {
    target: alice.did,
    message: recordsRead.message
  });

  const recordsReadResponse = await fetch(dwnUrl, {
    method: 'POST',
    headers: {
      'dwn-request': JSON.stringify(recordsReadRequest),
    },
  });

  expect(recordsReadResponse.status).to.equal(200);

  const { headers } = recordsReadResponse;
  const contentType = headers.get('content-type');
  expect(contentType).to.not.be.undefined;
  expect(contentType).to.equal('application/octet-stream');

  const recordsReadDwnResponse = headers.get('dwn-response');
  expect(recordsReadDwnResponse).to.not.be.undefined;

  const recordsReadJsonRpcResponse = JSON.parse(recordsReadDwnResponse) as JsonRpcSuccessResponse;
  expect(recordsReadJsonRpcResponse.id).to.equal(recordsReadRequestId);
  expect(recordsReadJsonRpcResponse.error).to.not.exist;
  expect(recordsReadJsonRpcResponse.result.reply.status.code).to.equal(200);
  expect(recordsReadJsonRpcResponse.result.reply.record).to.exist;

  // can't get response as stream from supertest :(
  const cid = await Cid.computeDagPbCidFromStream(recordsReadResponse.body as Readable);
  expect(cid).to.equal(dataCid);
}
