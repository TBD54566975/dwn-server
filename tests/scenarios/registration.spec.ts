// node.js 18 and earlier,  needs globalThis.crypto polyfill
import {
  DataStream,
  DidKeyResolver,
} from '@tbd54566975/dwn-sdk-js';
import type { Dwn, Persona } from '@tbd54566975/dwn-sdk-js';

import { expect } from 'chai';
import { readFileSync } from 'fs';
import type { Server } from 'http';
import fetch from 'node-fetch';
import { webcrypto } from 'node:crypto';
import { useFakeTimers } from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../../src/config.js';
import { HttpApi } from '../../src/http-api.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
} from '../../src/lib/json-rpc.js';
import {
  createJsonRpcRequest,
} from '../../src/lib/json-rpc.js';
import { ProofOfWork } from '../../src/registration/proof-of-work.js';
import { getTestDwn } from '../test-dwn.js';
import {
  createRecordsWriteMessage,
} from '../utils.js';
import type { ProofOfWorkChallengeModel } from '../../src/registration/proof-of-work-types.js';
import type { RegistrationData, RegistrationRequest } from '../../src/registration/registration-types.js';
import { RegistrationManager } from '../../src/registration/registration-manager.js';
import { DwnServerErrorCode } from '../../src/dwn-error.js';
import { ProofOfWorkManager } from '../../src/registration/proof-of-work-manager.js';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

describe('Registration scenarios', function () {
  const dwnMessageEndpoint = 'http://localhost:3000';
  const termsOfUseEndpoint = 'http://localhost:3000/registration/terms-of-service';
  const proofOfWorkEndpoint = 'http://localhost:3000/registration/proof-of-work';
  const registrationEndpoint = 'http://localhost:3000/registration';

  let httpApi: HttpApi;
  let server: Server;
  let alice: Persona;
  let registrationManager: RegistrationManager;
  let dwn: Dwn;
  let clock;

  before(async function () {
    clock = useFakeTimers({ shouldAdvanceTime: true });

    config.registrationStoreUrl = 'sqlite://';
    config.registrationProofOfWorkEnabled = true;
    config.termsOfServiceFilePath = './tests/fixtures/terms-of-service.txt';
    config.registrationProofOfWorkInitialMaxHash = '0FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'; // 1 in 16 chance of solving

    // RegistrationManager creation
    const registrationStoreUrl = config.registrationStoreUrl;
    const termsOfServiceFilePath = config.termsOfServiceFilePath;
    const initialMaximumAllowedHashValue = config.registrationProofOfWorkInitialMaxHash;
    registrationManager = await RegistrationManager.create({ registrationStoreUrl, termsOfServiceFilePath, initialMaximumAllowedHashValue });

    dwn = await getTestDwn(registrationManager);

    httpApi = new HttpApi(config, dwn, registrationManager);

    alice = await DidKeyResolver.generate();
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

  it('should facilitate tenant registration with terms-of-service and proof-or-work turned on', async () => {
    // Scenario:
    // 1. Alice fetches the terms-of-service.
    // 2. Alice fetches the proof-of-work challenge.
    // 3. Alice creates registration data based on the hash of the terms-of-service and her DID.
    // 4. Alice computes the proof-of-work response nonce based on the the proof-of-work challenge and the registration data.
    // 5. Alice sends the registration request to the server and is now registered.
    // 6. Alice can now write to the DWN.
    // 7. Sanity test that another non-tenant is NOT authorized to write.

    // 1. Alice fetches the terms-of-service.
    const termsOfServiceGetResponse = await fetch(termsOfUseEndpoint, {
      method: 'GET',
    });
    const termsOfServiceFetched = await termsOfServiceGetResponse.text();
    expect(termsOfServiceGetResponse.status).to.equal(200);
    expect(termsOfServiceFetched).to.equal(readFileSync(config.termsOfServiceFilePath).toString());

    // 2. Alice fetches the proof-of-work challenge.
    const proofOfWorkChallengeGetResponse = await fetch(proofOfWorkEndpoint, {
      method: 'GET',
    });
    const { challengeNonce, maximumAllowedHashValue} = await proofOfWorkChallengeGetResponse.json() as ProofOfWorkChallengeModel;
    expect(proofOfWorkChallengeGetResponse.status).to.equal(200);
    expect(challengeNonce.length).to.equal(64);
    expect(ProofOfWorkManager.isHexString(challengeNonce)).to.be.true;
    expect(ProofOfWorkManager.isHexString(maximumAllowedHashValue)).to.be.true;

    // 3. Alice creates registration data based on the hash of the terms-of-service and her DID.
    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([termsOfServiceFetched]),
    };

    // 4. Alice computes the proof-of-work response nonce based on the the proof-of-work challenge and the registration data.
    const responseNonce = ProofOfWork.findQualifiedResponseNonce({
      challengeNonce,
      maximumAllowedHashValue,
      requestData: JSON.stringify(registrationData),
    });

    // 5. Alice sends the registration request to the server and is now registered.
    const registrationRequest: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce,
        responseNonce,
      },
    };

    const registrationResponse = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    expect(registrationResponse.status).to.equal(200);

    // 6. Alice can now write to the DWN.
    const { jsonRpcRequest, dataBytes } = await generateRecordsWriteJsonRpcRequest(alice);
    const writeResponse = await fetch(dwnMessageEndpoint, {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify(jsonRpcRequest),
      },
      body: new Blob([dataBytes]),
    });
    const writeResponseBody = await writeResponse.json() as JsonRpcResponse;
    expect(writeResponse.status).to.equal(200);
    expect(writeResponseBody.result.reply.status.code).to.equal(202);

    // 7. Sanity test that another non-tenant is NOT authorized to write.
    const nonTenant = await DidKeyResolver.generate();
    const nonTenantJsonRpcRequest = await generateRecordsWriteJsonRpcRequest(nonTenant);
    const nonTenantJsonRpcResponse = await fetch(dwnMessageEndpoint, {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify(nonTenantJsonRpcRequest.jsonRpcRequest),
      },
      body: new Blob([nonTenantJsonRpcRequest.dataBytes]),
    });
    const nonTenantJsonRpcResponseBody = await nonTenantJsonRpcResponse.json() as JsonRpcResponse;
    expect(nonTenantJsonRpcResponse.status).to.equal(200);
    expect(nonTenantJsonRpcResponseBody.result.reply.status.code).to.equal(401);
    expect(nonTenantJsonRpcResponseBody.result.reply.status.detail).to.equal('Not a registered tenant.');
  });

  it('should reject a registration request that has proof-or-work that does not meet the difficulty requirement.', async function () {
    // Scenario:
    // 0. Assume Alice fetched the terms-of-service and proof-of-work challenge.
    // 1. Alice computes the proof-of-work response nonce that is insufficient to meet the difficulty requirement.
    // 2. Alice sends the registration request to the server and is rejected.

    // 0. Assume Alice fetched the terms-of-service and proof-of-work challenge.
    const termsOfService = registrationManager.getTermsOfService();
    const { challengeNonce } = registrationManager.getProofOfWorkChallenge();

    // Force the difficulty to be practically impossible.
    const originalMaximumAllowedHashValueAsBigInt = registrationManager['proofOfWorkManager']['currentMaximumAllowedHashValueAsBigInt']; // for restoring later below
    registrationManager['proofOfWorkManager']['currentMaximumAllowedHashValueAsBigInt'] = BigInt('0x0000000000000000000000000000000000000000000000000000000000000001');

    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([termsOfService]),
    };

    // 1. Alice computes the proof-of-work response nonce that is insufficient to meet the difficulty requirement.
    const responseNonce = ProofOfWork.findQualifiedResponseNonce({
      challengeNonce,
      maximumAllowedHashValue: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', // any hash value will always be less or equal to this value
      requestData: JSON.stringify(registrationData),
    });

    // 2. Alice sends the registration request to the server and is rejected.
    const registrationRequest: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce,
        responseNonce,
      },
    };
    
    const registrationResponse = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    const registrationResponseBody = await registrationResponse.json() as any;
    expect(registrationResponse.status).to.equal(400);
    expect(registrationResponseBody.code).to.equal(DwnServerErrorCode.ProofOfWorkInsufficientSolutionNonce);

    // Restoring original difficulty for subsequent tests.
    registrationManager['proofOfWorkManager']['currentMaximumAllowedHashValueAsBigInt'] = originalMaximumAllowedHashValueAsBigInt;
  });

  it('should reject a registration request that uses an invalid/outdated terms-of-service hash', async () => {
    // Scenario:
    // 0. Assume Alice fetched the proof-of-work challenge.
    // 1. Alice constructs the registration data with an invalid/outdated terms-of-service hash.
    // 2. Alice sends the registration request to the server and it is rejected.

    // 0. Assume Alice fetched the proof-of-work challenge.
    const { challengeNonce, maximumAllowedHashValue } = registrationManager.getProofOfWorkChallenge();

    // 1. Alice constructs the registration data with an invalid/outdated terms-of-service hash.
    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString(['invalid-or-outdated-terms-of-service']),
    };

    const responseNonce = ProofOfWork.findQualifiedResponseNonce({
      challengeNonce,
      maximumAllowedHashValue,
      requestData: JSON.stringify(registrationData),
    });

    // 2. Alice sends the registration request to the server and it is rejected.
    const registrationRequest: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce,
        responseNonce,
      },
    };
    
    const registrationResponse = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    const registrationResponseBody = await registrationResponse.json() as any;
    expect(registrationResponse.status).to.equal(400);
    expect(registrationResponseBody.code).to.equal(DwnServerErrorCode.RegistrationManagerInvalidOrOutdatedTermsOfServiceHash);
  });

  it('should reject registration request that reuses a response nonce that is already used a short-time earlier', async () => {
    // Scenario:
    // 0. Assume Alice fetched the proof-of-work challenge and the terms-of-service.
    // 1. Alice sends the registration request to the server and it is accepted.
    // 2. Alice sends the same registration request which uses the same response nonce to the server again and it is rejected.

    // 0. Assume Alice fetched the proof-of-work challenge and the terms-of-service.
    const { challengeNonce, maximumAllowedHashValue } = registrationManager.getProofOfWorkChallenge();
    const termsOfService = registrationManager.getTermsOfService();

    // 1. Alice sends the registration request to the server and it is accepted.
    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([termsOfService]),
    };

    const responseNonce = ProofOfWork.findQualifiedResponseNonce({
      challengeNonce,
      maximumAllowedHashValue,
      requestData: JSON.stringify(registrationData),
    });

    const registrationRequest: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce,
        responseNonce,
      },
    };
    
    const registrationResponse = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    expect(registrationResponse.status).to.equal(200);

    // 2. Alice sends the same registration request which uses the same response nonce to the server again and it is rejected.
    const registration2Response = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    const registration2ResponseBody = await registration2Response.json() as any;
    expect(registration2Response.status).to.equal(400);
    expect(registration2ResponseBody.code).to.equal(DwnServerErrorCode.ProofOfWorkManagerResponseNonceReused);
  });

  it('should reject an invalid nonce that is not a HEX string representing a 256 bit value.', async function () {

    // Assume Alice fetched the terms-of-service.
    const termsOfService = registrationManager.getTermsOfService();
    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([termsOfService]),
    };

    const registrationRequest1: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce: 'unused',
        responseNonce: 'not-a-hex-string',
      },
    };
    
    const registrationResponse1 = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest1),
    });
    const registrationResponseBody1 = await registrationResponse1.json() as any;
    expect(registrationResponse1.status).to.equal(400);
    expect(registrationResponseBody1.code).to.equal(DwnServerErrorCode.ProofOfWorkManagerInvalidResponseNonceFormat);

    const registrationRequest2: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce: 'unused',
        responseNonce: 'FFFF', // HEX string too short
      },
    };
    
    const registrationResponse2 = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest2),
    });
    const registrationResponseBody2 = await registrationResponse2.json() as any;
    expect(registrationResponse2.status).to.equal(400);
    expect(registrationResponseBody2.code).to.equal(DwnServerErrorCode.ProofOfWorkManagerInvalidResponseNonceFormat);
  });

  it('should reject a registration request that uses an expired challenge nonce', async () => {
    // Scenario:
    // 0. Assume Alice fetched the terms-of-service and proof-of-work challenge.
    // 1. A long time has passed since Alice fetched the proof-of-work challenge and the challenge nonce has expired.
    // 2. Alice computes the proof-of-work response nonce based on the the proof-of-work challenge and the registration data.
    // 3. Alice sends the registration request to the server and it is rejected.

    // 0. Assume Alice fetched the terms-of-service and proof-of-work challenge.
    const termsOfService = registrationManager.getTermsOfService();
    const { challengeNonce, maximumAllowedHashValue } = registrationManager.getProofOfWorkChallenge();

    // 1. A long time has passed since Alice fetched the proof-of-work challenge and the challenge nonce has expired.
    clock.tick(10 * 60 * 1000); // 10 minutes has passed
    clock.runToLast(); // triggers all scheduled timers

    // 2. Alice computes the proof-of-work response nonce based on the the proof-of-work challenge and the registration data.
    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([termsOfService]),
    };

    const responseNonce = ProofOfWork.findQualifiedResponseNonce({
      challengeNonce,
      maximumAllowedHashValue,
      requestData: JSON.stringify(registrationData),
    });

    // 3. Alice sends the registration request to the server and it is rejected.
    const registrationRequest: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce,
        responseNonce,
      },
    };
    
    const registrationResponse = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    const registrationResponseBody = await registrationResponse.json() as any;
    expect(registrationResponse.status).to.equal(400);
    expect(registrationResponseBody.code).to.equal(DwnServerErrorCode.ProofOfWorkManagerInvalidChallengeNonce);
  });

  it('should reject a DWN message for an existing tenant who agreed to an outdated terms-of-service.', async () => {
    // Scenario:
    // 1. Alice is a registered tenant and is able to write to the DWN.
    // 2. DWN server administrator updates the terms-of-service.
    // 3. Alice no longer can write to the DWN because she has not agreed to the new terms-of-service.
    // 4. Alice fetches the new terms-of-service and proof-of-work challenge 
    // 5. Alice agrees to the new terms-of-service.
    // 6. Alice can now write to the DWN again.

    // 1. Alice is a registered tenant and is able to write to the DWN.
    // Shortcut to register Alice.
    registrationManager.recordTenantRegistration({
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([registrationManager.getTermsOfService()])
    });

    // Sanity test that Alice can write to the DWN after registration.
    const write1 = await generateRecordsWriteJsonRpcRequest(alice);
    const write1Response = await fetch(dwnMessageEndpoint, {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify(write1.jsonRpcRequest),
      },
      body: new Blob([write1.dataBytes]),
    });
    const write1ResponseBody = await write1Response.json() as JsonRpcResponse;
    expect(write1Response.status).to.equal(200);
    expect(write1ResponseBody.result.reply.status.code).to.equal(202);

    // 2. DWN server administrator updates the terms-of-service.
    const newTermsOfService = 'new terms of service';
    registrationManager.updateTermsOfService(newTermsOfService);

    // 3. Alice no longer can write to the DWN because she has not agreed to the new terms-of-service.
    const write2 = await generateRecordsWriteJsonRpcRequest(alice);
    const write2Response = await fetch(dwnMessageEndpoint, {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify(write2.jsonRpcRequest),
      },
      body: new Blob([write2.dataBytes]),
    });
    const write2ResponseBody = await write2Response.json() as JsonRpcResponse;
    expect(write2Response.status).to.equal(200);
    expect(write2ResponseBody.result.reply.status.code).to.equal(401);
    expect(write2ResponseBody.result.reply.status.detail).to.equal('Agreed terms-of-service is outdated.');

    // 4. Alice fetches the new terms-of-service and proof-of-work challenge 
    const termsOfServiceGetResponse = await fetch(termsOfUseEndpoint, {
      method: 'GET',
    });
    const termsOfServiceFetched = await termsOfServiceGetResponse.text();
    expect(termsOfServiceGetResponse.status).to.equal(200);
    expect(termsOfServiceFetched).to.equal(newTermsOfService);

    const proofOfWorkChallengeGetResponse = await fetch(proofOfWorkEndpoint, {
      method: 'GET',
    });
    const { challengeNonce, maximumAllowedHashValue} = await proofOfWorkChallengeGetResponse.json() as ProofOfWorkChallengeModel;

    // 5. Alice agrees to the new terms-of-service.
    const registrationData: RegistrationData = {
      did: alice.did,
      termsOfServiceHash: ProofOfWork.hashAsHexString([newTermsOfService]),
    };

    const responseNonce = ProofOfWork.findQualifiedResponseNonce({
      challengeNonce,
      maximumAllowedHashValue,
      requestData: JSON.stringify(registrationData),
    });

    const registrationRequest: RegistrationRequest = {
      registrationData,
      proofOfWork: {
        challengeNonce,
        responseNonce,
      },
    };

    const registrationResponse = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationRequest),
    });
    expect(registrationResponse.status).to.equal(200);

    // 6. Alice can now write to the DWN again.
    const { jsonRpcRequest, dataBytes } = await generateRecordsWriteJsonRpcRequest(alice);
    const write3Response = await fetch(dwnMessageEndpoint, {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify(jsonRpcRequest),
      },
      body: new Blob([dataBytes]),
    });
    const write3ResponseBody = await write3Response.json() as JsonRpcResponse;
    expect(write3Response.status).to.equal(200);
    expect(write3ResponseBody.result.reply.status.code).to.equal(202);

  });
});

async function generateRecordsWriteJsonRpcRequest(persona: Persona): Promise<{ jsonRpcRequest: JsonRpcRequest, dataBytes: Uint8Array }> {
  const { recordsWrite, dataStream } = await createRecordsWriteMessage(persona);

  const requestId = uuidv4();
  const jsonRpcRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
    message: recordsWrite.toJSON(),
    target: persona.did,
  });

  const dataBytes = await DataStream.toBytes(dataStream);
  return { jsonRpcRequest, dataBytes };
}
