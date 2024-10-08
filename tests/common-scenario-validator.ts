import type { JsonRpcSuccessResponse } from '../src/lib/json-rpc.js';
import type { Persona } from '@tbd54566975/dwn-sdk-js';
import type { Readable } from 'readable-stream';

import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';
import fetch from 'node-fetch';

import { createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { getFileAsReadStream } from './utils.js';
import { v4 as uuidv4 } from 'uuid';
import { webcrypto } from 'node:crypto';

import { Cid, DwnConstant, Jws, ProtocolsConfigure, RecordsRead, RecordsWrite, TestDataGenerator } from '@tbd54566975/dwn-sdk-js';

// node.js 18 and earlier needs globalThis.crypto polyfill
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

chai.use(chaiAsPromised);

/**
 * Validator of common scenarios.
 */
export default class CommonScenarioValidator {
  /**
   * Sanity test RecordsWrite and RecordsRead on the DWN instance.
   */
  public static async sanityTestDwnReadWrite(dwnUrl: string, persona?: Persona): Promise<void> {
    const alice = persona || await TestDataGenerator.generateDidKeyPersona();
    const aliceSigner = Jws.createSigner(alice);

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
    expect(recordsReadJsonRpcResponse.result.reply.entry.recordsWrite).to.exist;

    // can't get response as stream from supertest :(
    const cid = await Cid.computeDagPbCidFromStream(recordsReadResponse.body as Readable);
    expect(cid).to.equal(dataCid);
  }
}
