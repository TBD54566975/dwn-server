import {
  DidKeyResolver,
  RecordsRead,
  RecordsWrite,
  Jws,
} from '@tbd54566975/dwn-sdk-js';

import { expect } from 'chai';

describe('http-api', () => {
  it('sends dwn-response header', async function () {
    // Some crypto functions used in key generation and signing,
    // work only under secure context.
    // Test code runs on secure context of http://dwn.localhost
    // by cors setup.
    const alice = await DidKeyResolver.generate();
    const encoder = new TextEncoder();
    const data = encoder.encode('Hello, World!');
    const recordsWrite = (
      await RecordsWrite.create({
        data,
        dataFormat: 'text/plalin',
        published: true,
        signer: Jws.createSigner(alice),
      })
    ).toJSON();
    const recordsRead = (
      await RecordsRead.create({
        filter: {
          recordId: recordsWrite.recordId,
        },
        signer: Jws.createSigner(alice),
      })
    ).toJSON();

    // Records Write
    const recordsWriteResponse = await fetch('http://dwn.localhost', {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify({
          method: 'dwn.processMessage',
          params: {
            target: alice.did,
            message: recordsWrite,
          },
        }),
      },
      body: data,
    });
    expect(recordsWriteResponse.status).to.equal(200);
    const recordsWriteResponseJson = await recordsWriteResponse.json();
    expect(recordsWriteResponseJson.result?.reply?.status?.code).to.equal(202);

    // Records Read
    const recordsReadResponse = await fetch('http://dwn.localhost', {
      method: 'POST',
      headers: {
        'dwn-request': JSON.stringify({
          method: 'dwn.processMessage',
          params: {
            target: alice.did,
            message: recordsRead,
          },
        }),
      },
    });
    expect(recordsReadResponse.status).to.equal(200);
    const recordsReadResponseJson = JSON.parse(
      recordsReadResponse.headers.get('dwn-response'),
    );
    expect(recordsReadResponseJson.result?.reply?.status?.code).to.equal(200);
    expect(await recordsReadResponse.text()).to.equal('Hello, World!');
  });
});
